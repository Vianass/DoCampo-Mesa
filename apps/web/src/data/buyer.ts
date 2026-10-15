import { products, producers } from './market';
import type {
  BuyerBid,
  BuyerDataset,
  BuyerOrder,
  BuyerOrderItem,
  BuyerReview,
  OrderStatus,
} from '../features/buyer/types';

export const DEMO_BUYER_ID = 'comprador-demonstracao';
export const BUYER_OBSERVED_AT = '2026-10-15T09:00:00.000Z';

function item(productId: string, quantity: number, snapshotPrice?: number): BuyerOrderItem {
  const product = products.find((entry) => entry.id === productId);
  if (!product) throw new Error('Produto de demonstração em falta.');
  return {
    productId,
    productName: product.name,
    producerId: product.producerId,
    producerName: product.producerName,
    quantity,
    unit: product.unit,
    unitPriceCents: snapshotPrice ?? product.priceCents,
    image: { ...product.images[0] },
  };
}
function order(day: string, status: OrderStatus, items: readonly BuyerOrderItem[]): BuyerOrder {
  const createdAt = `2026-10-${day}T08:00:00.000Z`;
  const chain: readonly OrderStatus[] = ['pendente', 'confirmada', 'pronta', 'entregue'];
  return {
    id: `enc-2610${day}`,
    reference: `DCM-2610${day}`,
    buyerId: DEMO_BUYER_ID,
    createdAt,
    status,
    items,
    history: chain.slice(0, chain.indexOf(status) + 1).map((entry, index) => ({
      status: entry,
      occurredAt: new Date(Date.parse(createdAt) + index * 6 * 60 * 60 * 1000).toISOString(),
    })),
  };
}
export const buyerOrders: readonly BuyerOrder[] = [
  order('15', 'pendente', [item('pera-rocha', 2)]),
  order('14', 'pronta', [item('tomate-coracao', 2), item('couve-galega', 1)]),
  order('13', 'confirmada', [item('mel-multifloral', 1)]),
  order('10', 'entregue', [item('tomate-coracao', 2, 250), item('cenoura', 1)]),
  order('08', 'entregue', [item('pera-rocha', 3), item('maca-bravo-esmolfe', 1)]),
  order('06', 'entregue', [item('pao-milho', 2), item('pao-centeio', 1)]),
];
export const buyerReviews: readonly BuyerReview[] = [
  {
    id: 'comprador-review-horta',
    buyerId: DEMO_BUYER_ID,
    orderId: 'enc-261010',
    target: 'produtor',
    producerId: 'horta-ribeira',
    displayName: 'Comprador de demonstração',
    rating: 5,
    text: 'Neste cenário fictício, os legumes inspiraram uma sopa de outono. Não corresponde a uma compra real.',
    createdAt: '2026-10-11T12:00:00Z',
    demonstration: true,
  },
  {
    id: 'comprador-review-pomar',
    buyerId: DEMO_BUYER_ID,
    orderId: 'enc-261008',
    target: 'produtor',
    producerId: 'pomar-vale',
    displayName: 'Comprador de demonstração',
    rating: 4,
    text: 'Uma avaliação imaginada para mostrar como o percurso pode continuar depois da entrega.',
    createdAt: '2026-10-09T12:00:00Z',
    demonstration: true,
  },
];
function bid(
  id: string,
  producerId: string,
  title: string,
  lot: string,
  amountCents: number,
  sequence: number,
  currentAmount: number,
  currentSequence: number,
  acceptedAt: string,
  endsAt: string,
  state: 'ativo' | 'terminado',
  base: number,
  increment: number,
): BuyerBid {
  const producer = producers.find((entry) => entry.id === producerId);
  if (!producer) throw new Error('Produtor de demonstração em falta.');
  const leading = amountCents === currentAmount && sequence === currentSequence;
  const currentBid = {
    id: leading ? id : `${id}-seguinte`,
    buyerId: leading ? DEMO_BUYER_ID : 'outro-participante-ficticio',
    amountCents: currentAmount,
    sequence: currentSequence,
  };
  return {
    id,
    buyerId: DEMO_BUYER_ID,
    amountCents,
    sequence,
    acceptedAt,
    auction: {
      id: `lote-${id}`,
      title,
      lot,
      producerId,
      producerName: producer.name,
      state,
      startsAt: '2026-10-01T08:00:00.000Z',
      endsAt,
      basePriceCents: base,
      incrementCents: increment,
      currentBid,
      result:
        state === 'terminado'
          ? {
              kind: 'adjudicado',
              winnerId: currentBid.buyerId,
              bidId: currentBid.id,
              amountCents: currentAmount,
            }
          : null,
    },
  };
}
export const buyerBids: readonly BuyerBid[] = [
  bid(
    'cabazes',
    'horta-ribeira',
    'Uma colheita para partilhar',
    '20 cabazes de hortícolas · lote ilustrativo',
    31700,
    3,
    31700,
    3,
    '2026-10-15T08:30:00Z',
    '2026-10-16T18:00:00Z',
    'ativo',
    28000,
    1000,
  ),
  bid(
    'peras',
    'pomar-vale',
    'O pomar à tua mesa',
    '10 kg de pera · lote ilustrativo',
    3500,
    2,
    4000,
    3,
    '2026-10-14T09:00:00Z',
    '2026-10-17T16:00:00Z',
    'ativo',
    2500,
    500,
  ),
  bid(
    'mel',
    'mel-encosta',
    'Pequenos frascos, grandes sabores',
    '8 frascos de mel · lote ilustrativo',
    6200,
    4,
    6200,
    4,
    '2026-10-12T14:00:00Z',
    '2026-10-13T18:00:00Z',
    'terminado',
    4000,
    500,
  ),
  bid(
    'broas',
    'forno-aldeia',
    'Uma fornada da aldeia',
    '6 broas · lote ilustrativo',
    2200,
    2,
    2700,
    3,
    '2026-10-08T10:00:00Z',
    '2026-10-09T18:00:00Z',
    'terminado',
    1200,
    500,
  ),
];
// Frozen-in-time fiction, independent of public auction state and cart contents.
export const buyerDemoDataset: BuyerDataset = {
  observedAt: BUYER_OBSERVED_AT,
  orders: buyerOrders,
  reviews: buyerReviews,
  bids: buyerBids,
};
