import { Types, type ClientSession, type Connection } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '../../http/api-error.js';
import type { AuthPrincipal } from '../auth/auth.service.js';
import type { AuctionRepository } from './auction.repository.js';
import type { AuctionRecord } from './auction.types.js';
import type { ProductRecord } from '../products/product.types.js';
import type { ProducerRecord } from '../producers/producer.model.js';
import { validateProducerCommercial } from '../producers/producer-commercial.validation.js';
import { guardProducerEligibility } from '../producers/producer-guard.repository.js';
import { operationalRevision, revisionCondition } from '../concurrency/concurrency-error.js';
import { createOrderModel } from '../orders/order.model.js';
import type { OrderRecord, OrderSaleUnit } from '../orders/order.types.js';
import { fingerprintCheckout } from '../orders/checkout.fingerprint.js';
import { validateCheckoutInput } from '../orders/checkout.validation.js';
import { CheckoutValidationError } from '../orders/checkout.contract.js';
import {
  createCheckoutExecution,
  prepareCheckoutOrders,
  producerCheckoutSelection,
} from '../orders/checkout.preparation.js';
import { idempotencyKey } from './auction.validation.js';

const bodySchema = z.strictObject({ condicao: z.unknown() });
const missing = () =>
  new ApiError(404, 'COMPRA_NAO_DISPONIVEL', 'Esta compra não está disponível.');
const conflict = () =>
  new ApiError(
    409,
    'CONFLITO_COMPRA_LEILAO',
    'O lote ou as condições mudaram. Consulta novamente a compra.',
  );
/** A unidade comercial da encomenda é um lote indivisível, com o conteúdo físico no snapshot.
 * O débito físico já ocorreu na criação do leilão: nunca voltar a debitar o produto. */
export function createAuctionCheckoutService(connection: Connection, repo: AuctionRepository) {
  const Order = createOrderModel(connection);
  async function won(user: AuthPrincipal, id: string, session: ClientSession) {
    if (!user.papeis.includes('comprador'))
      throw new ApiError(403, 'ACESSO_PROIBIDO', 'É necessária uma conta compradora.');
    const a = await repo.auctions().findOne({ _id: new Types.ObjectId(id) }, { session });
    if (!a || !a.resultado?.comprador?.equals(new Types.ObjectId(user.id))) throw missing();
    if (
      a.estado !== 'terminado' ||
      a.resultado.tipo !== 'vencedor' ||
      !a.resultado.valorCent ||
      !a.resultado.bidId
    )
      throw conflict();
    const bid = await repo.bids().findOne(
      {
        _id: a.resultado.bidId,
        leilao: a._id,
        comprador: a.resultado.comprador,
        valorCent: a.resultado.valorCent,
      },
      { session },
    );
    if (!bid) throw conflict();
    await repo.guardUsers([{ id: a.resultado.comprador, roles: ['comprador'] }], session);
    return a;
  }
  function lot(a: AuctionRecord): OrderSaleUnit {
    return {
      modalidade: 'embalagem',
      unidadeBase: 'un',
      quantidadeReferencia: 1,
      quantidadeMinima: 1,
      incrementoCompra: 1,
      rotulo: 'Lote de leilão · ' + a.lote.quantidade + ' ' + a.lote.unidadeVenda.unidadeBase,
      conteudoPorUnidade: {
        quantidade: a.lote.quantidade,
        unidade: a.lote.unidadeVenda.unidadeBase,
      },
    };
  }
  function line(a: AuctionRecord) {
    return {
      produtoId: a.produto.toHexString(),
      produtorContaId: a.produtor.toHexString(),
      quantidade: 1,
      ofertaAceite: {
        precoReferenciaCent: a.resultado!.valorCent!,
        unidadeVenda: lot(a),
        revisaoProdutoObservada: 0,
      },
    };
  }
  async function profile(a: AuctionRecord, session: ClientSession) {
    const p = await connection
      .db!.collection<ProducerRecord>('producers')
      .findOne({ userId: a.produtor }, { session });
    if (
      !p?.comercial ||
      p.aprovacao.estado !== 'aprovado' ||
      p.moderacao?.estado === 'oculta' ||
      validateProducerCommercial(p.comercial).length
    )
      throw conflict();
    await repo.guardUsers([{ id: a.produtor, roles: ['produtor'] }], session);
    return p;
  }
  function receipt(order: OrderRecord, status: 200 | 201) {
    const original = order.idempotencia?.resultadoOriginal;
    if (!original)
      throw new ApiError(
        503,
        'RESULTADO_DESCONHECIDO',
        'Consulta novamente a compra com a mesma chave.',
      );
    return {
      status,
      body: {
        operacaoCompraId: original.operacaoCompraId,
        criadaEm: original.criadaEm.toISOString(),
        encomendas: original.encomendas.map((o) => ({
          orderId: o.orderId.toHexString(),
          produtorContaId: o.produtor.toHexString(),
          estadoInicial: o.estadoInicial,
          totalCent: o.totalCent,
        })),
        totalCent: original.totalCent,
        moeda: original.moeda,
        origem: status === 201 ? 'nova' : 'replay',
      },
    };
  }
  return {
    async prepare() {
      await Order.createCollection();
      await Order.createIndexes();
    },
    async metadata(user: AuthPrincipal, id: string) {
      return repo.transaction(async (session) => {
        const a = await won(user, id, session);
        if (!a.compra) {
          const product = await connection
            .db!.collection<ProductRecord>('products')
            .findOne({ _id: a.produto, produtor: a.produtor }, { session });
          if (
            !product ||
            product.estadoPublicacao !== 'publicado' ||
            product.moderacao?.estado === 'oculta'
          )
            throw conflict();
        }
        const p = await profile(a, session),
          c = p.comercial!;
        return {
          leilaoId: id,
          titulo: a.titulo,
          compra: {
            estado: a.compra ? 'confirmada' : 'pendente',
            ...(a.compra ? { encomendaId: a.compra.encomendaId.toHexString() } : {}),
          },
          preparacao: {
            moeda: 'EUR',
            linhas: [
              {
                ...line(a),
                nome: a.lote.nome,
                stockDisponivel: 1,
                subtotalCent: a.resultado!.valorCent!,
              },
            ],
            produtores: [
              {
                produtorContaId: a.produtor.toHexString(),
                perfilId: p._id.toHexString(),
                nome: p.nomePublico,
                revisaoProdutorObservada: operationalRevision(p.revisaoOperacional),
                comercial: {
                  modalidades: c.modalidades,
                  ...(c.localLevantamento ? { localLevantamento: c.localLevantamento } : {}),
                  ...(c.taxaEntregaCent !== undefined
                    ? { taxaEntregaCent: c.taxaEntregaCent }
                    : {}),
                  concelhosEntregaIds: c.concelhosEntregaIds,
                  metodosPagamento: c.metodosPagamento,
                  disponibilidade: c.disponibilidade,
                },
              },
            ],
          },
        };
      });
    },
    async confirm(user: AuthPrincipal, id: string, body: unknown, header?: string) {
      const parsed = bodySchema.safeParse(body),
        key = idempotencyKey.safeParse(header);
      if (!parsed.success || !key.success)
        throw new ApiError(
          400,
          'PEDIDO_INVALIDO',
          'Envia as condições e uma Idempotency-Key válida.',
        );
      try {
        return await repo.transaction(async (session) => {
          const a = await won(user, id, session);
          const input = validateCheckoutInput(
            { compradorContaId: user.id, leilaoOrigemId: id },
            key.data,
            {
              linhas: [line(a)],
              condicoesPorProdutor: [parsed.data.condicao],
            },
          );
          const hash = fingerprintCheckout(input.contexto, key.data, input.pedido);
          if (a.compra) {
            if (a.compra.chave !== key.data || a.compra.hash !== hash) throw conflict();
            const order = await connection.db!.collection<OrderRecord>('orders').findOne(
              {
                _id: a.compra.encomendaId,
                comprador: new Types.ObjectId(user.id),
                leilaoOrigem: a._id,
              },
              { session },
            );
            if (!order)
              throw new ApiError(503, 'RESULTADO_DESCONHECIDO', 'Consulta novamente a compra.');
            return receipt(order, 200);
          }
          if (a.reserva.estado !== 'afeta_vencedor' || a.reserva.reposta || a.reserva.pendente)
            throw conflict();
          const now = await repo.clock('auctions', a._id, session);
          const selection = input.pedido.condicoesPorProdutor[0]!;
          if (new Date(selection.periodo.inicioEm) <= now)
            throw new ApiError(400, 'PERIODO_INVALIDO', 'Escolhe um período futuro.');
          if (
            await connection
              .db!.collection('orders')
              .findOne({ 'idempotencia.chave': key.data }, { session, projection: { _id: 1 } })
          )
            throw conflict();
          const p = await profile(a, session);
          const product = await connection
            .db!.collection<ProductRecord>('products')
            .findOne({ _id: a.produto, produtor: a.produtor }, { session });
          if (!product) throw conflict();
          // Fonte interna de preços: resultado imutável; unidade = uma embalagem indivisível.
          const reservedLot: ProductRecord = {
            ...product,
            nome: a.lote.nome,
            precoCent: a.resultado!.valorCent!,
            unidadeVenda: lot(a),
            stockDisponivel: 1,
            revisaoOperacional: 0,
          };
          const prepared = prepareCheckoutOrders(
            input,
            new Map([[a.produto.toHexString(), reservedLot]]),
            new Map([[a.produtor.toHexString(), p]]),
            createCheckoutExecution(input, now),
          );
          await guardProducerEligibility(
            connection,
            {
              produtorId: a.produtor,
              revisaoEsperada: selection.revisaoProdutorObservada,
              selecao: producerCheckoutSelection(selection),
            },
            session,
          );
          const revision = operationalRevision(product.revisaoOperacional);
          const lock = await connection
            .db!.collection('products')
            .updateOne(
              { _id: a.produto, ...revisionCondition(revision) },
              { $inc: { revisaoOperacional: 1 } },
              { session },
            );
          if (!lock.matchedCount) throw conflict();
          const record = { ...prepared.orders[0]!, leilaoOrigem: a._id };
          await new Order(record).save({ session });
          const changed = await repo.auctions().updateOne(
            {
              _id: a._id,
              versao: a.versao,
              compra: { $exists: false },
              'reserva.estado': 'afeta_vencedor',
            },
            {
              $set: {
                compra: { encomendaId: record._id, chave: key.data, hash },
                'reserva.estado': 'consumida',
              },
              $inc: { versao: 1 },
              $currentDate: { updatedAt: true },
              $push: {
                historico: { tipo: 'compra_confirmada', origem: 'sistema', ocorridoEm: now },
              },
            },
            { session },
          );
          if (!changed.matchedCount) throw conflict();
          return receipt(record, 201);
        });
      } catch (error) {
        if (error instanceof CheckoutValidationError)
          throw new ApiError(400, error.codigo, 'Revê as condições da compra.', [...error.campos]);
        throw error;
      }
    },
  };
}
