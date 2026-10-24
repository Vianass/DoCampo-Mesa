import { Types } from 'mongoose';
import type { ProductRecord } from '../../src/modules/products/product.types.js';
import type { ProductStockDecrease } from '../../src/modules/products/product-stock.repository.js';
import type {
  ProducerEligibilityRecord,
  ProducerGuardInput,
} from '../../src/modules/producers/producer-eligibility.js';
import type { OrderSaleUnit } from '../../src/modules/orders/order.types.js';
import { publishedProductInput, testProductImage } from './product-fixtures.js';
import { producerCommercialInput } from './producer-commercial-fixtures.js';

export const concurrentProducerId = new Types.ObjectId('000000000000000000000031');
export const concurrentProductId = new Types.ObjectId('000000000000000000000032');
export const concurrentSaleUnit: OrderSaleUnit = {
  modalidade: 'unidade',
  unidadeBase: 'un',
  quantidadeReferencia: 1,
  quantidadeMinima: 1,
  incrementoCompra: 1,
};

export function productCandidate(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    ...publishedProductInput(),
    _id: concurrentProductId,
    produtor: concurrentProducerId,
    nome: 'Produto fictício',
    estadoPublicacao: 'publicado',
    ingredientes: [],
    etiquetas: [],
    imagens: [testProductImage],
    moeda: 'EUR',
    precoCent: 150,
    unidadeVenda: { ...concurrentSaleUnit },
    stockDisponivel: 1,
    createdAt: new Date('2026-10-23T09:00:00Z'),
    updatedAt: new Date('2026-10-23T09:00:00Z'),
    revisaoOperacional: 0,
    ...overrides,
  };
}
export function stockDecrease(overrides: Partial<ProductStockDecrease> = {}): ProductStockDecrease {
  return {
    produtoId: concurrentProductId,
    produtorId: concurrentProducerId,
    revisaoEsperada: 0,
    quantidade: 1,
    precoAceiteCent: 150,
    unidadeAceite: { ...concurrentSaleUnit },
    ...overrides,
  };
}
export function producerCandidate(
  overrides: Partial<ProducerEligibilityRecord> = {},
): ProducerEligibilityRecord {
  return {
    _id: new Types.ObjectId(),
    userId: concurrentProducerId,
    aprovacao: { estado: 'aprovado' },
    comercial: producerCommercialInput(),
    revisaoOperacional: 0,
    ...overrides,
  };
}
export function producerGuard(overrides: Partial<ProducerGuardInput> = {}): ProducerGuardInput {
  return {
    produtorId: concurrentProducerId,
    revisaoEsperada: 0,
    selecao: {
      modalidade: 'entrega',
      metodoPagamento: 'dinheiro',
      concelhoId: 'concelho-ficticio-001',
      taxaEntregaAceiteCent: 250,
      periodo: {
        inicioEm: new Date('2026-10-26T14:00:00Z'),
        fimEm: new Date('2026-10-26T15:00:00Z'),
        fusoHorario: 'Europe/Lisbon',
      },
    },
    ...overrides,
  };
}
