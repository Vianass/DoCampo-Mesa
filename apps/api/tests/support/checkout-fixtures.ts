import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import type { CheckoutRequest } from '../../src/modules/orders/checkout.contract.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import { producerCommercialInput } from './producer-commercial-fixtures.js';
import { decisionInput, producerInput, userInput } from './identity-fixtures.js';
import { productCandidate } from './concurrency-fixtures.js';

export const checkoutTestNow = new Date('2026-10-26T08:00:00.000Z');

/** Todos os valores são fictícios; construção em memória utilizável nos testes puros. */
export function checkoutScenario(count = 1, delivery = false) {
  const buyerId = new Types.ObjectId();
  const producers = Array.from({ length: count }, () => {
    const userId = new Types.ObjectId();
    return {
      _id: new Types.ObjectId(),
      ...producerInput({ userId }),
      userId,
      aprovacao: { ...decisionInput(), estado: 'aprovado' as const },
      revisaoOperacional: 0,
      comercial: producerCommercialInput({
        localLevantamento: 'Local oficial fictício ' + userId.toHexString(),
      }),
      createdAt: checkoutTestNow,
      updatedAt: checkoutTestNow,
    };
  });
  const products = producers.map((producer) =>
    productCandidate({
      _id: new Types.ObjectId(),
      produtor: producer.userId,
      nome: 'Produto para teste de checkout',
      stockDisponivel: 10_000,
      unidadeVenda: {
        modalidade: 'peso',
        unidadeBase: 'g',
        quantidadeReferencia: 1000,
        quantidadeMinima: 250,
        incrementoCompra: 50,
      },
    }),
  );
  const pedido: CheckoutRequest = {
    linhas: products.map((product) => ({
      produtoId: product._id.toHexString(),
      produtorContaId: product.produtor.toHexString(),
      quantidade: 500,
      ofertaAceite: {
        precoReferenciaCent: 150,
        revisaoProdutoObservada: 0,
        unidadeVenda: {
          modalidade: 'peso',
          unidadeBase: 'g',
          quantidadeReferencia: 1000,
          quantidadeMinima: 250,
          incrementoCompra: 50,
        },
      },
    })),
    condicoesPorProdutor: producers.map((producer) => ({
      produtorContaId: producer.userId.toHexString(),
      periodo: {
        inicioEm: delivery ? '2026-10-26T14:00:00.000Z' : '2026-10-26T09:00:00.000Z',
        fimEm: delivery ? '2026-10-26T15:00:00.000Z' : '2026-10-26T10:00:00.000Z',
        fusoHorario: 'Europe/Lisbon',
      },
      metodoPagamento: 'dinheiro',
      taxaEntregaAceiteCent: delivery ? 250 : 0,
      revisaoProdutorObservada: 0,
      ...(delivery
        ? {
            modalidade: 'entrega' as const,
            concelhoId: 'concelho-ficticio-001',
            morada: 'Morada privada fictícia',
            contacto: 'Contacto privado fictício',
          }
        : { modalidade: 'levantamento' as const }),
    })),
  };
  return { buyerId, producers, products, pedido, chave: 'checkout-ficticio-' + randomUUID() };
}

/** Provisiona apenas a base isolada que o teste fornecer; não é código comercial. */
export async function seedCheckoutScenario(connection: Connection, scenario = checkoutScenario()) {
  const User = createUserModel(connection);
  const Producer = createProducerModel(connection);
  const Product = createProductModel(connection);
  await User.create(
    userInput({
      _id: scenario.buyerId,
      emailNormalizado: scenario.buyerId.toHexString() + '@example.invalid',
      papeis: ['comprador'],
    }),
  );
  for (const producer of scenario.producers) {
    await User.create(
      userInput({
        _id: producer.userId,
        emailNormalizado: producer.userId.toHexString() + '@example.invalid',
        papeis: ['produtor'],
      }),
    );
    await Producer.create(producer);
  }
  for (const product of scenario.products) await Product.create(product);
  return scenario;
}
