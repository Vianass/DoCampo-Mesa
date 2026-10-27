import { Types, type Connection } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '../../http/api-error.js';
import type { AuthPrincipal } from '../auth/auth.service.js';
import type { ProductRecord } from '../products/product.types.js';
import type { ProducerRecord } from '../producers/producer.model.js';
import { validateProductStockCandidate } from '../products/product-stock.repository.js';
import { operationalRevision, ConcurrencyError } from '../concurrency/concurrency-error.js';
import { validateProducerCommercial } from '../producers/producer-commercial.validation.js';
import { calculateOrderLineSubtotal } from './order.calculations.js';
import { validateCheckoutInput } from './checkout.validation.js';
import { fingerprintCheckout } from './checkout.fingerprint.js';
import { CheckoutValidationError, checkoutTechnicalLimits } from './checkout.contract.js';
import type { CheckoutRequest } from './checkout.contract.js';
import type { OrderSaleUnit } from './order.types.js';
import { isCheckoutReadUnavailable } from './checkout.idempotency.js';

const id = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/)
  .transform((v) => v.toLowerCase());
export const prepareCheckoutSchema = z.strictObject({
  itens: z
    .array(z.strictObject({ produtoId: id, quantidade: z.number().int().min(1).max(10000000) }))
    .min(1)
    .max(checkoutTechnicalLimits.maxProdutos)
    .refine((items) => new Set(items.map((i) => i.produtoId)).size === items.length),
});
export const checkoutAttemptSchema = z.strictObject({ referencia: z.uuid(), pedido: z.unknown() });
export const checkoutAttemptParams = z.strictObject({ referencia: z.uuid() });
// Checkpoint privado de recuperação; não é recibo, reserva, ordem ou árbitro da idempotência comercial.
interface Attempt {
  _id: string;
  comprador: Types.ObjectId;
  chave: string;
  hashCanonico: string;
  pedido: CheckoutRequest;
  criadaEm: Date;
  expiraEm: Date;
}
const lifetimeMS = 24 * 60 * 60 * 1000;
const unavailable = () =>
  new ApiError(
    409,
    'RECONFIRMACAO_NECESSARIA',
    'Revê os produtos, quantidades e condições comerciais antes de continuar.',
  );
export function createCheckoutPreparationService(
  connection: Connection,
  now: () => Date = () => new Date(),
) {
  const attempts = () => connection.db!.collection<Attempt>('checkout_attempts');
  function buyer(user: AuthPrincipal) {
    if (!user.papeis.includes('comprador'))
      throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta operação.');
    return new Types.ObjectId(user.id);
  }
  async function safe<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof CheckoutValidationError)
        throw new ApiError(400, error.codigo, 'Revê os campos do pedido.', [...error.campos]);
      if (error instanceof ConcurrencyError) throw unavailable();
      if (isCheckoutReadUnavailable(error))
        throw new ApiError(
          503,
          'SERVICO_INDISPONIVEL',
          'Não foi possível preparar ou recuperar a tentativa.',
        );
      throw error;
    }
  }
  return {
    async prepare() {
      await attempts().createIndex({ expiraEm: 1 }, { expireAfterSeconds: 0 });
    },
    async metadata(user: AuthPrincipal, input: z.infer<typeof prepareCheckoutSchema>) {
      buyer(user);
      return safe(async () => {
        const session = await connection.startSession();
        try {
          return await session.withTransaction(
            async () => {
              const lines = [];
              const groups = new Map<
                string,
                {
                  produtorContaId: string;
                  perfilId: string;
                  nome: string;
                  revisaoProdutorObservada: number;
                  comercial: {
                    modalidades: { levantamento: boolean; entrega: boolean };
                    localLevantamento?: string;
                    taxaEntregaCent?: number;
                    concelhosEntregaIds: readonly string[];
                    metodosPagamento: readonly string[];
                    disponibilidade: NonNullable<ProducerRecord['comercial']>['disponibilidade'];
                  };
                }
              >();
              for (const item of input.itens) {
                const product = await connection.db!.collection<ProductRecord>('products').findOne(
                  { _id: new Types.ObjectId(item.produtoId) },
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
                if (!product?.unidadeVenda || product.precoCent === undefined) throw unavailable();
                const unit = product.unidadeVenda as OrderSaleUnit;
                const revision = operationalRevision(product.revisaoOperacional);
                validateProductStockCandidate(product, {
                  produtoId: product._id,
                  produtorId: product.produtor,
                  revisaoEsperada: revision,
                  quantidade: item.quantidade,
                  precoAceiteCent: product.precoCent,
                  unidadeAceite: unit,
                });
                const accountId = product.produtor.toHexString();
                if (!groups.has(accountId)) {
                  const account = await connection
                    .db!.collection('users')
                    .findOne(
                      { _id: product.produtor, ativo: { $ne: false }, papeis: 'produtor' },
                      { session, projection: { _id: 1 } },
                    );
                  const producer = await connection
                    .db!.collection<ProducerRecord>('producers')
                    .findOne(
                      { userId: product.produtor },
                      {
                        session,
                        projection: {
                          _id: 1,
                          userId: 1,
                          nomePublico: 1,
                          'aprovacao.estado': 1,
                          revisaoOperacional: 1,
                          'comercial.modalidades': 1,
                          'comercial.localLevantamento': 1,
                          'comercial.taxaEntregaCent': 1,
                          'comercial.concelhosEntregaIds': 1,
                          'comercial.metodosPagamento': 1,
                          'comercial.disponibilidade': 1,
                        },
                      },
                    );
                  if (
                    !account ||
                    producer?.aprovacao.estado !== 'aprovado' ||
                    !producer.comercial ||
                    validateProducerCommercial(producer.comercial).length
                  )
                    throw unavailable();
                  const c = producer.comercial;
                  groups.set(accountId, {
                    produtorContaId: accountId,
                    perfilId: producer._id.toHexString(),
                    nome: producer.nomePublico,
                    revisaoProdutorObservada: operationalRevision(producer.revisaoOperacional),
                    comercial: {
                      modalidades: {
                        levantamento: c.modalidades.levantamento,
                        entrega: c.modalidades.entrega,
                      },
                      ...(c.modalidades.levantamento && c.localLevantamento
                        ? { localLevantamento: c.localLevantamento }
                        : {}),
                      ...(c.modalidades.entrega && c.taxaEntregaCent !== undefined
                        ? { taxaEntregaCent: c.taxaEntregaCent }
                        : {}),
                      concelhosEntregaIds: c.modalidades.entrega ? c.concelhosEntregaIds : [],
                      metodosPagamento: c.metodosPagamento,
                      disponibilidade: {
                        fusoHorario: c.disponibilidade.fusoHorario,
                        levantamento: c.modalidades.levantamento
                          ? c.disponibilidade.levantamento
                          : [],
                        entrega: c.modalidades.entrega ? c.disponibilidade.entrega : [],
                      },
                    },
                  });
                  if (groups.size > checkoutTechnicalLimits.maxProdutores)
                    throw new CheckoutValidationError(
                      'LIMITE_TECNICO_EXCEDIDO',
                      'pedido.condicoesPorProdutor',
                      'A compra excede o limite de produtores suportado.',
                    );
                }
                lines.push({
                  produtoId: item.produtoId,
                  produtorContaId: accountId,
                  nome: product.nome,
                  quantidade: item.quantidade,
                  stockDisponivel: product.stockDisponivel,
                  subtotalCent: calculateOrderLineSubtotal({
                    quantidade: item.quantidade,
                    precoReferenciaCent: product.precoCent,
                    unidadeVenda: unit,
                  }),
                  ofertaAceite: {
                    precoReferenciaCent: product.precoCent,
                    unidadeVenda: {
                      modalidade: unit.modalidade,
                      unidadeBase: unit.unidadeBase,
                      quantidadeReferencia: unit.quantidadeReferencia,
                      quantidadeMinima: unit.quantidadeMinima,
                      incrementoCompra: unit.incrementoCompra,
                      ...(unit.rotulo !== undefined ? { rotulo: unit.rotulo } : {}),
                      ...(unit.conteudoPorUnidade
                        ? { conteudoPorUnidade: { ...unit.conteudoPorUnidade } }
                        : {}),
                    },
                    revisaoProdutoObservada: revision,
                  },
                });
              }
              return { linhas: lines, produtores: [...groups.values()], moeda: 'EUR' as const };
            },
            {
              readConcern: { level: 'snapshot' },
              readPreference: 'primary',
              writeConcern: { w: 'majority' },
              timeoutMS: 10000,
            },
          );
        } finally {
          await session.endSession();
        }
      });
    },
    async checkpoint(user: AuthPrincipal, reference: string, key: unknown, body: unknown) {
      const owner = buyer(user);
      return safe(async () => {
        const input = validateCheckoutInput({ compradorContaId: user.id }, key, body);
        const hash = fingerprintCheckout(input.contexto, input.chaveIdempotencia, input.pedido);
        const date = now();
        const candidate: Attempt = {
          _id: reference,
          comprador: owner,
          chave: input.chaveIdempotencia,
          hashCanonico: hash,
          pedido: input.pedido,
          criadaEm: date,
          expiraEm: new Date(date.getTime() + lifetimeMS),
        };
        // Conservar apenas a tentativa imutável; não executa a compra nem reserva stock.
        try {
          await attempts().updateOne(
            { _id: reference },
            { $setOnInsert: candidate },
            { upsert: true, writeConcern: { w: 'majority' }, maxTimeMS: 5000 },
          );
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 11000)) throw error;
        }
        const saved = await attempts().findOne(
          { _id: reference },
          { readConcern: { level: 'majority' }, maxTimeMS: 5000 },
        );
        if (
          !saved ||
          !saved.comprador.equals(owner) ||
          saved.chave !== input.chaveIdempotencia ||
          saved.hashCanonico !== hash
        )
          throw new ApiError(
            409,
            'CONFLITO_IDEMPOTENCIA',
            'Não é possível reutilizar a referência para este pedido.',
          );
        if (saved.expiraEm <= now())
          throw new ApiError(
            410,
            'RECUPERACAO_EXPIRADA',
            'O prazo de recuperação terminou. Consulta as tuas encomendas antes de iniciar outra compra.',
          );
        return { referencia: saved._id, expiraEm: saved.expiraEm.toISOString() };
      });
    },
    async recover(user: AuthPrincipal, reference: string) {
      const owner = buyer(user);
      return safe(async () => {
        const saved = await attempts().findOne(
          { _id: reference, comprador: owner },
          { readConcern: { level: 'majority' }, maxTimeMS: 5000 },
        );
        if (!saved)
          throw new ApiError(
            404,
            'TENTATIVA_NAO_ENCONTRADA',
            'Não foi possível recuperar esta tentativa para a conta atual.',
          );
        if (saved.expiraEm <= now())
          throw new ApiError(
            410,
            'RECUPERACAO_EXPIRADA',
            'O prazo de recuperação terminou. Consulta as tuas encomendas antes de iniciar outra compra.',
          );
        // Validar a cópia armazenada antes de devolver o pedido original à própria conta.
        const input = validateCheckoutInput(
          { compradorContaId: user.id },
          saved.chave,
          saved.pedido,
        );
        if (
          fingerprintCheckout(input.contexto, input.chaveIdempotencia, input.pedido) !==
          saved.hashCanonico
        )
          throw new ApiError(
            503,
            'SERVICO_INDISPONIVEL',
            'Não foi possível verificar a tentativa original.',
          );
        return {
          referencia: saved._id,
          chaveIdempotencia: saved.chave,
          pedido: input.pedido,
          expiraEm: saved.expiraEm.toISOString(),
        };
      });
    },
  };
}
export type CheckoutPreparationService = ReturnType<typeof createCheckoutPreparationService>;
