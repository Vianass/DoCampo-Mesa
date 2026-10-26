import type { ClientSession, Connection } from 'mongoose';
import { Types } from 'mongoose';
import type {
  CheckoutConflict,
  CheckoutContext,
  CheckoutResult,
  ValidatedCheckoutInput,
} from './checkout.contract.js';
import { CheckoutValidationError, checkoutTechnicalLimits } from './checkout.contract.js';
import { validateCheckoutInput } from './checkout.validation.js';
import { createOrderModel } from './order.model.js';
import {
  checkoutIdempotencyProjection,
  findCheckoutPurchase,
  recoverCheckoutPurchase,
} from './checkout-idempotency.repository.js';
import {
  CheckoutIdempotencyConflict,
  checkoutAnchorOperation,
  identifyCheckout,
  inspectCheckoutGroup,
  isCheckoutIdempotencyKeyConflict,
  isCheckoutReadUnavailable,
  uncertainCheckoutRead,
} from './checkout.idempotency.js';
import {
  createCheckoutExecution,
  prepareCheckoutOrders,
  producerCheckoutSelection,
} from './checkout.preparation.js';
import { ConcurrencyError } from '../concurrency/concurrency-error.js';
import { decreaseProductStock } from '../products/product-stock.repository.js';
import type { ProductRecord } from '../products/product.types.js';
import { guardProducerEligibility } from '../producers/producer-guard.repository.js';
import type { ProducerEligibilityRecord } from '../producers/producer-eligibility.js';
import { guardUserCapabilities, UserCapabilityError } from '../users/user-capability.repository.js';
import type { UserRole } from '../users/user.model.js';

export interface CheckoutDependencies {
  readonly connection: Connection;
  /** Porta privada de composição do servidor: identidade verificada, nunca um campo do pedido. */
  readonly resolveIdentity: () => Promise<CheckoutContext>;
  readonly now?: () => Date;
  readonly transactionTimeoutMS?: number;
  readonly recoveryTimeoutMS?: number;
  readonly maxAttempts?: number;
}

class CheckoutAttemptLimit extends Error {}

function conflict(
  codigo: CheckoutConflict['codigo'],
  campo: string,
  mensagem: string,
): CheckoutConflict {
  return Object.freeze({ codigo, campos: Object.freeze([Object.freeze({ campo, mensagem })]) });
}

function domainResult(error: unknown): CheckoutResult | undefined {
  if (error instanceof CheckoutIdempotencyConflict)
    return {
      tipo: 'recusado',
      erro: conflict('CONFLITO_IDEMPOTENCIA', 'chaveIdempotencia', error.message),
    };
  if (error instanceof CheckoutValidationError)
    return { tipo: 'recusado', erro: { codigo: error.codigo, campos: error.campos } };
  if (error instanceof UserCapabilityError)
    return { tipo: 'recusado', erro: conflict('PEDIDO_INVALIDO', 'contexto', error.message) };
  if (error instanceof ConcurrencyError) {
    if (error.codigo === 'TRANSACAO_OBRIGATORIA' || error.codigo === 'LEITURA_INCOMPLETA')
      return undefined;
    return {
      tipo: 'reconfirmacao_necessaria',
      conflitos: [
        conflict(
          error.codigo === 'CONFLITO_VERSAO' ? 'CONFLITO_REVISAO' : 'RECONFIRMACAO_NECESSARIA',
          'pedido',
          'As condições da compra deixaram de ser válidas. Consulta os dados atuais antes de confirmar novamente.',
        ),
      ],
    };
  }
  return undefined;
}

/** Primeira leitura da tentativa: não observa as suas próprias escritas nem confirma um commit novo. */
async function transactionReplay(
  connection: Connection,
  input: ValidatedCheckoutInput,
  session: ClientSession,
) {
  const expected = identifyCheckout(input);
  const collection = connection.db!.collection('orders');
  const anchor = await collection.findOne(
    { 'idempotencia.chave': expected.chave },
    { session, projection: checkoutIdempotencyProjection },
  );
  if (!anchor) return undefined;
  const op = checkoutAnchorOperation(anchor, expected);
  if (!op) {
    const uncertain = uncertainCheckoutRead('GRUPO_INCONSISTENTE');
    if (uncertain.tipo !== 'resultado_indeterminado')
      throw new Error('Resultado interno inválido.');
    return uncertain;
  }
  const members = await collection
    .find({ operacaoCompraId: op }, { session, projection: checkoutIdempotencyProjection })
    .limit(checkoutTechnicalLimits.maxProdutores + 1)
    .toArray();
  const result = inspectCheckoutGroup(anchor, members, expected);
  if (result.tipo === 'inexistente') throw new Error('Grupo observado sem resultado.');
  return result;
}

/** Não está ligado ao HTTP. A função devolvida só recebe chave e pedido, nunca buyerId/papéis. */
export function createCheckoutService(dependencies: CheckoutDependencies) {
  const { connection } = dependencies;
  const timeoutMS = dependencies.transactionTimeoutMS ?? 20_000;
  const recoveryTimeoutMS = dependencies.recoveryTimeoutMS ?? 5000;
  const maxAttempts = dependencies.maxAttempts ?? 3;
  for (const value of [timeoutMS, recoveryTimeoutMS, maxAttempts])
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error('Orçamento de checkout inválido.');
  if (typeof dependencies.resolveIdentity !== 'function')
    throw new Error('Fonte confiável de identidade obrigatória.');
  const Order = createOrderModel(connection);

  return async function checkout(chave: unknown, pedido: unknown): Promise<CheckoutResult> {
    // Só a porta confiável fornece contexto. Um buyerId/papel no pedido é rejeitado pelo contrato.
    const context = await dependencies.resolveIdentity();
    let input: ValidatedCheckoutInput;
    try {
      input = validateCheckoutInput(context, chave, pedido);
    } catch (error) {
      const result = domainResult(error);
      if (result) return result;
      throw error;
    }
    try {
      const existing = await findCheckoutPurchase(connection, input, {
        timeoutMS: recoveryTimeoutMS,
      });
      if (existing.tipo !== 'inexistente') return existing;
    } catch (error) {
      const result = domainResult(error);
      if (result) return result;
      throw error;
    }
    const execution = createCheckoutExecution(input, (dependencies.now ?? (() => new Date()))());
    let session: ClientSession | undefined;
    let attempts = 0;
    try {
      session = await connection.startSession();
      return await session.withTransaction(
        async () => {
          if (++attempts > maxAttempts) throw new CheckoutAttemptLimit();
          const replay = await transactionReplay(connection, input, session!);
          if (replay) return replay;
          // Recarregar em cada tentativa; nenhum documento Mongoose abortado é reutilizado.
          const products = new Map<string, ProductRecord>();
          for (const line of input.pedido.linhas) {
            const product = await connection.db!.collection<ProductRecord>('products').findOne(
              { _id: new Types.ObjectId(line.produtoId) },
              {
                session,
                projection: {
                  _id: 1,
                  produtor: 1,
                  nome: 1,
                  precoCent: 1,
                  moeda: 1,
                  estadoPublicacao: 1,
                  unidadeVenda: 1,
                  stockDisponivel: 1,
                  revisaoOperacional: 1,
                },
              },
            );
            if (product) products.set(line.produtoId, product);
          }
          const producers = new Map<string, ProducerEligibilityRecord>();
          for (const selection of input.pedido.condicoesPorProdutor) {
            const producer = await connection
              .db!.collection<ProducerEligibilityRecord>('producers')
              .findOne(
                { userId: new Types.ObjectId(selection.produtorContaId) },
                {
                  session,
                  projection: {
                    _id: 1,
                    userId: 1,
                    'aprovacao.estado': 1,
                    revisaoOperacional: 1,
                    'comercial.modalidades': 1,
                    'comercial.localLevantamento': 1,
                    'comercial.taxaEntregaCent': 1,
                    'comercial.concelhosEntregaIds': 1,
                    'comercial.catalogoConcelhosVersao': 1,
                    'comercial.disponibilidade': 1,
                    'comercial.metodosPagamento': 1,
                  },
                },
              );
            if (producer) producers.set(selection.produtorContaId, producer);
          }
          const prepared = prepareCheckoutOrders(input, products, producers, execution);
          const documents = prepared.orders.map((order) => new Order(order));
          for (const document of documents) await document.validate();
          // Inserir a âncora primeiro arbitra cedo a chave, mas nada é visível antes do commit integral.
          await documents[0]!.save({ session });
          const capabilities = new Map<string, Set<UserRole>>([
            [input.contexto.compradorContaId, new Set(['comprador'])],
          ]);
          for (const selection of input.pedido.condicoesPorProdutor) {
            const roles = capabilities.get(selection.produtorContaId) ?? new Set<UserRole>();
            roles.add('produtor');
            capabilities.set(selection.produtorContaId, roles);
          }
          for (const accountId of [...capabilities.keys()].sort())
            await guardUserCapabilities(
              connection,
              new Types.ObjectId(accountId),
              [...capabilities.get(accountId)!],
              session!,
            );
          for (const selection of [...input.pedido.condicoesPorProdutor].sort((a, b) =>
            a.produtorContaId < b.produtorContaId ? -1 : 1,
          ))
            await guardProducerEligibility(
              connection,
              {
                produtorId: new Types.ObjectId(selection.produtorContaId),
                revisaoEsperada: selection.revisaoProdutorObservada,
                selecao: producerCheckoutSelection(selection),
              },
              session!,
            );
          for (const line of [...input.pedido.linhas].sort((a, b) =>
            a.produtoId < b.produtoId ? -1 : 1,
          ))
            await decreaseProductStock(
              connection,
              {
                produtoId: new Types.ObjectId(line.produtoId),
                produtorId: new Types.ObjectId(line.produtorContaId),
                revisaoEsperada: line.ofertaAceite.revisaoProdutoObservada,
                quantidade: line.quantidade,
                precoAceiteCent: line.ofertaAceite.precoReferenciaCent,
                unidadeAceite: line.ofertaAceite.unidadeVenda,
              },
              session!,
            );
          for (const document of documents.slice(1)) await document.save({ session });
          return { tipo: 'sucesso' as const, origem: 'nova' as const, recibo: prepared.recibo };
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          timeoutMS,
        },
      );
    } catch (error) {
      const domain = domainResult(error);
      if (error instanceof CheckoutIdempotencyConflict) return domain!;
      if (
        domain ||
        isCheckoutIdempotencyKeyConflict(error) ||
        isCheckoutReadUnavailable(error) ||
        error instanceof CheckoutAttemptLimit
      ) {
        // Fora do snapshot abortado. Só lê: nunca repete um débito ou troca a chave.
        try {
          const recovered = await recoverCheckoutPurchase(connection, input, {
            timeoutMS: recoveryTimeoutMS,
          });
          if (recovered.tipo === 'sucesso') return recovered;
          if (
            domain &&
            recovered.tipo === 'resultado_indeterminado' &&
            recovered.motivo === 'CONFIRMACAO_NAO_OBSERVADA'
          )
            return domain;
          if (recovered.tipo === 'inexistente') {
            return {
              tipo: 'resultado_indeterminado',
              codigo: 'RESULTADO_DESCONHECIDO',
              repetirComMesmaChave: true,
            };
          }
          return recovered;
        } catch (recoveryError) {
          const result = domainResult(recoveryError);
          if (result) return result;
          throw recoveryError;
        }
      }
      throw error;
    } finally {
      if (session) await session.endSession();
    }
  };
}
