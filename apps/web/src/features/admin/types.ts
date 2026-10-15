import type { Role } from '../auth/types';
import type { Product, Producer } from '../../types/market';
import type { BuyerOrder, BuyerReview } from '../buyer/types';
import type { ProducerAuction } from '../producer/types';

export interface AdminUser {
  readonly id: string;
  readonly displayName: string;
  readonly role: Role;
  readonly joinedAt: string;
}
export interface AdminDecision {
  readonly actorId: string;
  readonly decidedAt: string;
  readonly reason: string;
}
export type ApplicationStatus = 'pendente' | 'aprovado' | 'rejeitado';
export type ModerationStatus = 'pendente' | 'mantida' | 'oculta';
export interface AdminProducer {
  readonly id: string;
  readonly userId: string;
  readonly profile: Producer;
  readonly application: {
    readonly status: ApplicationStatus;
    readonly submittedAt: string;
    readonly decision: AdminDecision | null;
  };
}
export interface AdminOrder extends BuyerOrder {
  readonly producerId: string;
}
export interface AdminReviewCase {
  readonly id: string;
  readonly review: BuyerReview;
  readonly reports: readonly {
    readonly id: string;
    readonly reason: string;
    readonly reportedAt: string;
    readonly reporterLabel: string;
  }[];
  readonly status: ModerationStatus;
  readonly decision: AdminDecision | null;
}
export interface AdminAuction extends ProducerAuction {
  readonly productId: string | null;
}
export interface AdminService {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly realStatus: 'nao-monitorizado';
  readonly realObservedAt: null;
  readonly illustration: {
    readonly status: 'desconhecido' | 'indisponivel' | 'degradado';
    readonly note: string;
    readonly observedAt: string | null;
  };
}
export interface AdminDataset {
  readonly observedAt: string;
  readonly users: readonly AdminUser[];
  readonly producers: readonly AdminProducer[];
  readonly products: readonly Product[];
  readonly orders: readonly AdminOrder[];
  readonly cases: readonly AdminReviewCase[];
  readonly auctions: readonly AdminAuction[];
  readonly services: readonly AdminService[];
}
export type AdminScenario = 'normal' | 'vazio' | 'erro';
export type AdminResource =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: AdminDataset };
export interface AdminDecisionDraft {
  kind: 'application' | 'review';
  id: string;
  choice: string;
  reason: string;
}
export interface AdminCommand extends AdminDecisionDraft {
  readonly actorId: string;
  readonly now: string;
}
export interface AdminFeedback {
  kind: 'success' | 'error';
  message: string;
}
