import { products, producers } from './market';
import { buyerOrders, buyerBids, BUYER_OBSERVED_AT, DEMO_BUYER_ID } from './buyer';
import type { ProducerAuction, ProducerDataset, ProducerOrder } from '../features/producer/types';

export const DEMO_PRODUCER_ID = 'horta-ribeira';
const profile = producers.find((entry) => entry.id === DEMO_PRODUCER_ID);
if (!profile) throw new Error('Perfil de demonstração em falta.');
const baseOrders: ProducerOrder[] = buyerOrders
  .filter((order) => order.items.every((item) => item.producerId === DEMO_PRODUCER_ID))
  .map((order) => ({
    ...order,
    items: order.items.map((item) => ({ ...item, image: { ...item.image } })),
    producerId: DEMO_PRODUCER_ID,
    customerLabel: 'Comprador de demonstração',
  }));
const template = baseOrders.find((order) => order.status === 'entregue');
if (!template) throw new Error('Encomenda de demonstração em falta.');
const additionalOrders: ProducerOrder[] = [
  {
    ...template,
    id: 'recebida-261015',
    reference: 'DCM-P261015',
    createdAt: '2026-10-15T08:00:00Z',
    status: 'pendente',
    history: [{ status: 'pendente', occurredAt: '2026-10-15T08:00:00Z' }],
  },
  {
    ...template,
    id: 'recebida-261013',
    reference: 'DCM-P261013',
    createdAt: '2026-10-13T08:00:00Z',
    status: 'confirmada',
    history: [
      { status: 'pendente', occurredAt: '2026-10-13T08:00:00Z' },
      { status: 'confirmada', occurredAt: '2026-10-13T14:00:00Z' },
    ],
  },
];
const active = buyerBids.find((bid) => bid.id === 'cabazes')?.auction;
if (!active) throw new Error('Leilão de demonstração em falta.');
const auctions: ProducerAuction[] = [
  { ...active, bidCount: active.currentBid.sequence },
  {
    ...active,
    id: 'lote-proxima-colheita',
    title: 'A próxima colheita',
    lot: '10 cabazes · exemplo independente',
    state: 'agendado',
    startsAt: '2026-10-18T08:00:00Z',
    endsAt: '2026-10-19T18:00:00Z',
    basePriceCents: 4500,
    incrementCents: 500,
    currentBid: null,
    bidCount: 0,
    result: null,
  },
  {
    ...active,
    id: 'lote-colheita-entregue',
    title: 'Sabores de uma colheita',
    lot: '8 cabazes · exemplo independente',
    state: 'terminado',
    endsAt: '2026-10-13T18:00:00Z',
    basePriceCents: 4000,
    incrementCents: 500,
    bidCount: 4,
    currentBid: { id: 'oferta-horta-4', buyerId: DEMO_BUYER_ID, amountCents: 6200, sequence: 4 },
    result: {
      kind: 'adjudicado',
      bidId: 'oferta-horta-4',
      winnerId: DEMO_BUYER_ID,
      amountCents: 6200,
    },
  },
  {
    ...active,
    id: 'lote-sem-ofertas',
    title: 'Uma colheita à espera',
    lot: '5 cabazes · exemplo independente',
    state: 'terminado',
    endsAt: '2026-10-09T18:00:00Z',
    basePriceCents: 2000,
    incrementCents: 500,
    bidCount: 0,
    currentBid: null,
    result: { kind: 'sem_licitacoes' },
  },
];
export const producerDemoDataset: ProducerDataset = {
  producerId: DEMO_PRODUCER_ID,
  observedAt: BUYER_OBSERVED_AT,
  profile: { ...profile },
  products: products
    .filter((product) => product.producerId === DEMO_PRODUCER_ID)
    .map((product) => ({
      ...product,
      images: product.images.map((image) => ({ ...image })) as [
        (typeof product.images)[0],
        ...(typeof product.images)[0][],
      ],
      availableStock: product.id === 'abobora-menina' ? 2 : product.availableStock,
      lowStockThreshold: 3,
    })),
  orders: [...additionalOrders, ...baseOrders],
  auctions,
  application: { status: 'pendente', submittedAt: '2026-10-14T08:00:00Z' },
  nextProductId: 1,
};
