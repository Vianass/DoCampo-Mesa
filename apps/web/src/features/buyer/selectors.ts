import { DEMO_BUYER_ID } from '../../data/buyer';
import {
  orderStatuses,
  type BuyerBid,
  type BuyerDashboard,
  type BuyerDataset,
  type BuyerOrder,
  type BuyerOrderItem,
  type BuyerReview,
  type OrderStatus,
  type ReviewDraft,
} from './types';

export const orderStatusLabels: Record<OrderStatus, string> = {
  pendente: 'Pendente',
  confirmada: 'Confirmada',
  pronta: 'Pronta',
  entregue: 'Entregue',
};
export function lineSubtotal(item: BuyerOrderItem) {
  const total = item.quantity * item.unitPriceCents;
  if (
    !Number.isSafeInteger(item.quantity) ||
    item.quantity <= 0 ||
    !Number.isSafeInteger(item.unitPriceCents) ||
    item.unitPriceCents < 0 ||
    !Number.isSafeInteger(total)
  )
    throw new Error('Linha monetária inválida.');
  return total;
}
function safeSum(values: readonly number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Total monetário inválido.');
  return total;
}
export function orderTotal(order: BuyerOrder) {
  return safeSum(order.items.map(lineSubtotal));
}
export function orderGroups(order: BuyerOrder) {
  const groups = new Map<
    string,
    { producerId: string; producerName: string; items: BuyerOrderItem[]; subtotalCents: number }
  >();
  for (const item of order.items) {
    const group = groups.get(item.producerId) ?? {
      producerId: item.producerId,
      producerName: item.producerName,
      items: [],
      subtotalCents: 0,
    };
    group.items.push(item);
    group.subtotalCents = safeSum([group.subtotalCents, lineSubtotal(item)]);
    groups.set(item.producerId, group);
  }
  return [...groups.values()];
}
export function parseOrderOptions(params: URLSearchParams) {
  const raw = params.get('estado');
  return {
    status: orderStatuses.find((status) => status === raw) ?? ('todos' as const),
    sort: params.get('ordem') === 'antigas' ? ('antigas' as const) : ('recentes' as const),
  };
}
export function selectOrders(
  data: BuyerDataset,
  options: { status?: OrderStatus | 'todos'; sort?: 'recentes' | 'antigas' } = {},
  buyerId = DEMO_BUYER_ID,
) {
  return data.orders
    .filter(
      (order) =>
        order.buyerId === buyerId &&
        (!options.status || options.status === 'todos' || order.status === options.status),
    )
    .sort((a, b) => {
      const byDate = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return (options.sort === 'antigas' ? -byDate : byDate) || a.id.localeCompare(b.id);
    });
}
export function selectOrder(data: BuyerDataset, id: string | undefined, buyerId = DEMO_BUYER_ID) {
  return data.orders.find((order) => order.id === id && order.buyerId === buyerId) ?? null;
}
export function selectReviews(data: BuyerDataset, buyerId = DEMO_BUYER_ID) {
  return data.reviews
    .filter((review) => review.buyerId === buyerId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}
export function selectBids(data: BuyerDataset, buyerId = DEMO_BUYER_ID) {
  return data.bids
    .filter((bid) => bid.buyerId === buyerId)
    .sort(
      (a, b) =>
        Number(b.auction.state === 'ativo') - Number(a.auction.state === 'ativo') ||
        Date.parse(a.auction.endsAt) - Date.parse(b.auction.endsAt) ||
        a.id.localeCompare(b.id),
    );
}
export function bidSituation(bid: BuyerBid) {
  if (bid.auction.state === 'terminado')
    return bid.auction.result?.winnerId === bid.buyerId ? 'ganho' : 'terminado';
  return bid.auction.currentBid.id === bid.id ? 'mais-elevada' : 'ultrapassada';
}
export const bidSituationLabels = {
  ganho: 'Leilão ganho',
  terminado: 'Leilão terminado · outra oferta venceu',
  'mais-elevada': 'Licitação mais elevada',
  ultrapassada: 'Licitação ultrapassada',
};
export function dashboardSummary(data: BuyerDataset, buyerId = DEMO_BUYER_ID): BuyerDashboard {
  const orders = selectOrders(data, {}, buyerId);
  const bids = selectBids(data, buyerId);
  return {
    orderCount: orders.length,
    ongoingOrderCount: orders.filter((order) => order.status !== 'entregue').length,
    reviewCount: selectReviews(data, buyerId).length,
    activeBidCount: new Set(
      bids.filter((bid) => bid.auction.state === 'ativo').map((bid) => bid.auction.id),
    ).size,
    recentOrder: orders[0] ?? null,
    relevantBids: bids.slice(0, 2),
  };
}
export function eligibleReviewOrders(data: BuyerDataset, buyerId = DEMO_BUYER_ID) {
  return selectOrders(data, { status: 'entregue' }, buyerId).filter((order) => {
    const groups = orderGroups(order);
    return (
      groups.length === 1 &&
      !data.reviews.some(
        (review) =>
          review.buyerId === buyerId &&
          review.orderId === order.id &&
          review.producerId === groups[0]?.producerId,
      )
    );
  });
}
export function validateReview(data: BuyerDataset, draft: ReviewDraft, buyerId = DEMO_BUYER_ID) {
  if (!eligibleReviewOrders(data, buyerId).some((order) => order.id === draft.orderId))
    return 'Escolhe uma encomenda entregue e ainda sem avaliação do produtor.';
  if (!Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5)
    return 'Escolhe uma classificação de 1 a 5.';
  if (draft.text.trim().length > 1000)
    return 'O comentário pode ter até 1000 caracteres nesta demonstração.';
  return null;
}
export function createLocalReview(
  data: BuyerDataset,
  draft: ReviewDraft,
  now: string,
): BuyerReview {
  const error = validateReview(data, draft);
  if (error) throw new Error(error);
  const order = selectOrder(data, draft.orderId);
  const producer = order?.items[0];
  if (!order || !producer) throw new Error('Produtor indisponível.');
  return {
    id: `review-local-${order.id}`,
    buyerId: DEMO_BUYER_ID,
    orderId: order.id,
    target: 'produtor',
    producerId: producer.producerId,
    displayName: 'Comprador de demonstração',
    rating: draft.rating as BuyerReview['rating'],
    text: draft.text.trim() || 'Sem comentário.',
    createdAt: now,
    demonstration: true,
  };
}
export const buyerDateFormat = new Intl.DateTimeFormat('pt-PT', {
  dateStyle: 'long',
  timeZone: 'Europe/Lisbon',
});
export function buyerDate(date: string) {
  return buyerDateFormat.format(new Date(date));
}
