import { normalizeSearch } from '../catalog/catalog';
import { orderStatusLabels } from '../buyer/selectors';
import type { AdminCommand, AdminDataset, AdminDecisionDraft, AdminFeedback } from './types';

export const applicationLabels = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
};
export const moderationLabels = { pendente: 'Pendente', mantida: 'Mantida', oculta: 'Oculta' };
export const auctionLabels = { agendado: 'Agendado', ativo: 'Ativo', terminado: 'Terminado' };
export const roleLabels = {
  comprador: 'Comprador',
  produtor: 'Produtor',
  administrador: 'Administrador',
};
export const serviceLabels = {
  desconhecido: 'Desconhecido',
  indisponivel: 'Indisponível',
  degradado: 'Degradado',
};
export const adminHome = '/area/administrador';
export function adminSummary(data: AdminDataset) {
  return {
    userCount: data.users.length,
    producerCount: data.producers.length,
    pendingApplicationCount: data.producers.filter((p) => p.application.status === 'pendente')
      .length,
    orderCount: data.orders.length,
    reportedReviewCount: data.cases.length,
    activeAuctionCount: data.auctions.filter((a) => a.state === 'ativo').length,
    pendingReviewCount: data.cases.filter((c) => c.status === 'pendente').length,
  };
}
export function byId<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | null {
  return items.find((item) => item.id === id) ?? null;
}
export function filterOptions(
  params: URLSearchParams,
  allowed: Record<string, string>,
  fallback = 'todos',
) {
  const value = params.get('estado');
  return {
    search: params.get('pesquisa') ?? '',
    status: value && Object.hasOwn(allowed, value) ? value : fallback,
  };
}
const matches = (text: string, search: string) =>
  normalizeSearch(text).includes(normalizeSearch(search.trim()));
export function selectAdminProducers(data: AdminDataset, search = '', status = 'todos') {
  return data.producers.filter(
    (p) =>
      matches(p.profile.name + ' ' + p.profile.locality, search) &&
      (status === 'todos' || p.application.status === status),
  );
}
export function selectAdminUsers(data: AdminDataset, search = '', role = 'todos') {
  return data.users.filter(
    (u) => matches(u.displayName + ' ' + u.id, search) && (role === 'todos' || u.role === role),
  );
}
export function selectAdminOrders(data: AdminDataset, search = '', status = 'todos') {
  return data.orders
    .filter(
      (o) =>
        (status === 'todos' || o.status === status) &&
        matches(
          o.reference +
            ' ' +
            (byId(data.users, o.buyerId)?.displayName ?? '') +
            ' ' +
            (byId(data.producers, o.producerId)?.profile.name ?? '') +
            ' ' +
            o.items.map((i) => i.productName).join(' '),
          search,
        ),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}
export function selectAdminCases(data: AdminDataset, search = '', status = 'todos') {
  return data.cases.filter(
    (c) =>
      (status === 'todos' || c.status === status) &&
      matches(
        c.review.text +
          ' ' +
          c.review.displayName +
          ' ' +
          (byId(data.producers, c.review.producerId)?.profile.name ?? ''),
        search,
      ),
  );
}
export function selectAdminAuctions(data: AdminDataset, search = '', status = 'todos') {
  return data.auctions.filter(
    (a) =>
      (status === 'todos' || a.state === status) &&
      matches(a.title + ' ' + a.producerName + ' ' + a.lot, search),
  );
}
export { orderStatusLabels };
export function validateDecision(draft: AdminDecisionDraft): string | null {
  if (draft.kind !== 'application' && draft.kind !== 'review') return 'Tipo de decisão inválido.';
  const allowed = draft.kind === 'application' ? ['aprovado', 'rejeitado'] : ['mantida', 'oculta'];
  if (!allowed.includes(draft.choice)) return 'Escolhe uma decisão para esta simulação.';
  if (draft.reason.trim().length > 500)
    return 'O motivo pode ter até 500 caracteres nesta demonstração.';
  return null;
}
export function applyAdminCommand(
  data: AdminDataset,
  command: AdminCommand,
): { data: AdminDataset; feedback: AdminFeedback } {
  const fail = (message: string) => ({ data, feedback: { kind: 'error' as const, message } });
  const error = validateDecision(command);
  if (error) return fail(error);
  if (byId(data.users, command.actorId)?.role !== 'administrador')
    return fail('O autor demonstrativo não tem o papel de administrador.');
  if (!Number.isFinite(Date.parse(command.now))) return fail('A data da decisão é inválida.');
  const target =
    command.kind === 'application'
      ? byId(data.producers, command.id)?.application
      : byId(data.cases, command.id);
  if (!target) return fail('O recurso não está disponível nesta demonstração.');
  if (target.status !== 'pendente')
    return fail('Este recurso já tem uma decisão. A simulação não a substitui.');
  const earliest =
    command.kind === 'application'
      ? byId(data.producers, command.id)!.application.submittedAt
      : byId(data.cases, command.id)!.reports.reduce(
          (latest, report) =>
            Date.parse(report.reportedAt) > Date.parse(latest) ? report.reportedAt : latest,
          byId(data.cases, command.id)!.review.createdAt,
        );
  if (Date.parse(command.now) < Date.parse(earliest))
    return fail('A decisão não pode anteceder a candidatura ou denúncia.');
  const decision = {
    actorId: command.actorId,
    decidedAt: command.now,
    reason: command.reason.trim(),
  };
  const next: AdminDataset =
    command.kind === 'application'
      ? {
          ...data,
          producers: data.producers.map((p) =>
            p.id === command.id
              ? {
                  ...p,
                  application: {
                    ...p.application,
                    status: command.choice as 'aprovado' | 'rejeitado',
                    decision,
                  },
                }
              : p,
          ),
        }
      : {
          ...data,
          cases: data.cases.map((c) =>
            c.id === command.id
              ? { ...c, status: command.choice as 'mantida' | 'oculta', decision }
              : c,
          ),
        };
  return {
    data: next,
    feedback: {
      kind: 'success',
      message:
        'Decisão simulada apenas nesta sessão. Os dados públicos e as outras áreas mantêm-se.',
    },
  };
}
