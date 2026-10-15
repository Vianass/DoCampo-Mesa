import type { ProducerReview, ProductImage } from '../../types/market';

export const orderStatuses = ['pendente', 'confirmada', 'pronta', 'entregue'] as const;
export type OrderStatus = (typeof orderStatuses)[number];
export interface BuyerOrderItem {
  readonly productId: string;
  readonly productName: string;
  readonly producerId: string;
  readonly producerName: string;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPriceCents: number;
  readonly image: ProductImage;
}
export interface BuyerOrder {
  readonly id: string;
  readonly reference: string;
  readonly buyerId: string;
  readonly createdAt: string;
  readonly status: OrderStatus;
  readonly items: readonly BuyerOrderItem[];
  readonly history: readonly { status: OrderStatus; occurredAt: string }[];
}
export interface BuyerReview extends ProducerReview {
  readonly buyerId: string;
  readonly orderId: string;
  readonly target: 'produtor';
}
export interface BuyerAuctionSnapshot {
  readonly id: string;
  readonly title: string;
  readonly lot: string;
  readonly producerId: string;
  readonly producerName: string;
  readonly state: 'agendado' | 'ativo' | 'terminado';
  readonly startsAt: string;
  readonly endsAt: string;
  readonly basePriceCents: number;
  readonly incrementCents: number;
  readonly currentBid: {
    readonly id: string;
    readonly buyerId: string;
    readonly amountCents: number;
    readonly sequence: number;
  };
  readonly result: {
    readonly kind: 'adjudicado';
    readonly winnerId: string;
    readonly bidId: string;
    readonly amountCents: number;
  } | null;
}
export interface BuyerBid {
  readonly id: string;
  readonly buyerId: string;
  readonly amountCents: number;
  readonly acceptedAt: string;
  readonly sequence: number;
  readonly auction: BuyerAuctionSnapshot;
}
export interface BuyerDataset {
  readonly observedAt: string;
  readonly orders: readonly BuyerOrder[];
  readonly reviews: readonly BuyerReview[];
  readonly bids: readonly BuyerBid[];
}
export interface BuyerDashboard {
  readonly orderCount: number;
  readonly ongoingOrderCount: number;
  readonly reviewCount: number;
  readonly activeBidCount: number;
  readonly recentOrder: BuyerOrder | null;
  readonly relevantBids: readonly BuyerBid[];
}
export type BuyerResource =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: BuyerDataset };
export type BuyerScenario = 'normal' | 'vazio' | 'erro';
export interface ReviewDraft {
  orderId: string;
  rating: number;
  text: string;
}
export interface BuyerFeedback {
  id: number;
  kind: 'success' | 'error';
  message: string;
}
