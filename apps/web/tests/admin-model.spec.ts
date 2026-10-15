import { expect, test } from '@playwright/test';
import { adminDemoDataset as data, DEMO_ADMIN_ID } from '../src/data/admin';
import { products, producers } from '../src/data/market';
import { buyerDemoDataset } from '../src/data/buyer';
import { producerDemoDataset } from '../src/data/producer';
import { orderTotal } from '../src/features/buyer/selectors';
import {
  adminSummary,
  applyAdminCommand,
  byId,
  filterOptions,
  selectAdminProducers,
  selectAdminUsers,
  selectAdminOrders,
  selectAdminCases,
  selectAdminAuctions,
  applicationLabels,
  validateDecision,
} from '../src/features/admin/selectors';
import { adminDemoSource, parseAdminScenario } from '../src/features/admin/source';
import { demoDestination } from '../src/features/private-area/navigation';
import type { AdminCommand, AdminDecisionDraft } from '../src/features/admin/types';
const command: AdminCommand = {
  kind: 'application',
  id: 'horta-ribeira',
  choice: 'aprovado',
  reason: ' Exemplo local ',
  now: '2026-10-15T10:00:00Z',
  actorId: DEMO_ADMIN_ID,
};

test('indicadores globais desduplicam encomendas leilões e avaliações denunciadas', () => {
  expect(adminSummary(data)).toEqual({
    userCount: 10,
    producerCount: 7,
    pendingApplicationCount: 2,
    orderCount: 8,
    reportedReviewCount: 3,
    activeAuctionCount: 2,
    pendingReviewCount: 2,
  });
  for (const items of [data.users, data.producers, data.orders, data.auctions, data.cases])
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  expect(data.cases.reduce((sum, entry) => sum + entry.reports.length, 0)).toBe(4);
});
test('referências de utilizadores produtores produtos e candidaturas são coerentes', () => {
  for (const producer of data.producers) {
    expect(byId(data.users, producer.userId)?.role).toBe('produtor');
    expect(producer.id).toBe(producer.profile.id);
    expect(producer.application.status === 'pendente').toBe(producer.application.decision === null);
    if (producer.application.decision)
      expect(Date.parse(producer.application.decision.decidedAt)).toBeGreaterThanOrEqual(
        Date.parse(producer.application.submittedAt),
      );
  }
  for (const product of data.products)
    expect(byId(data.producers, product.producerId)).not.toBeNull();
});
test('pesquisa normaliza acentos e filtros combinam estados papéis e nomes sem mutação', () => {
  const before = JSON.stringify(data);
  expect(selectAdminProducers(data, 'HORTA', 'pendente')).toHaveLength(1);
  expect(selectAdminProducers(data, 'sul', 'aprovado')).toHaveLength(0);
  expect(selectAdminUsers(data, 'DEMONSTRAÇÃO', 'comprador')).toHaveLength(1);
  expect(selectAdminUsers(data, '', 'produtor')).toHaveLength(7);
  expect(selectAdminOrders(data, 'HORTA', 'entregue').map((order) => order.id)).toEqual([
    'enc-261010',
  ]);
  expect(selectAdminCases(data, 'HORTA', 'pendente')).toHaveLength(1);
  expect(selectAdminAuctions(data, 'HORTA', 'ativo')).toHaveLength(1);
  expect(filterOptions(new URLSearchParams('estado=__proto__'), applicationLabels).status).toBe(
    'todos',
  );
  expect(JSON.stringify(data)).toBe(before);
});
test('aprovação guarda autor motivo e data sem modificar permissões nem dados externos', () => {
  const before = JSON.stringify([data, products, producers, buyerDemoDataset, producerDemoDataset]);
  const result = applyAdminCommand(data, command);
  expect(result.feedback.kind).toBe('success');
  expect(byId(result.data.producers, 'horta-ribeira')?.application).toMatchObject({
    status: 'aprovado',
    decision: { actorId: DEMO_ADMIN_ID, decidedAt: command.now, reason: 'Exemplo local' },
  });
  expect(adminSummary(result.data).pendingApplicationCount).toBe(1);
  for (const key of ['users', 'products', 'orders', 'cases', 'auctions', 'services'] as const)
    expect(result.data[key]).toBe(data[key]);
  expect(JSON.stringify([data, products, producers, buyerDemoDataset, producerDemoDataset])).toBe(
    before,
  );
});
test('rejeição e comandos sucessivos mantêm decisões anteriores e recusam sobrescrita', () => {
  const first = applyAdminCommand(data, command).data;
  const second = applyAdminCommand(first, {
    ...command,
    id: 'pomar-sul',
    choice: 'rejeitado',
  }).data;
  expect(adminSummary(second).pendingApplicationCount).toBe(0);
  expect(byId(second.producers, 'horta-ribeira')?.application.status).toBe('aprovado');
  expect(byId(second.producers, 'pomar-sul')?.application.status).toBe('rejeitado');
  expect(applyAdminCommand(second, { ...command, choice: 'rejeitado' }).data).toBe(second);
});
test('decisões inválidas datas anteriores autores alheios e IDs desconhecidos são recusados', () => {
  for (const change of [
    { choice: '' },
    { choice: 'oculta' },
    { id: 'inexistente' },
    { id: 'pomar-vale' },
    { actorId: 'comprador-demonstracao' },
    { now: 'invalida' },
    { now: '2026-10-01' },
    { reason: 'x'.repeat(501) },
  ]) {
    const result = applyAdminCommand(data, { ...command, ...change });
    expect(result.feedback.kind).toBe('error');
    expect(result.data).toBe(data);
  }
  expect(
    validateDecision({ ...command, kind: 'inventado' } as unknown as AdminDecisionDraft),
  ).not.toBeNull();
});
test('moderação mantém ou oculta preservando texto classificação evidências e catálogo público', () => {
  const before = JSON.stringify(data);
  const hidden = applyAdminCommand(data, {
    ...command,
    kind: 'review',
    id: 'denuncia-1',
    choice: 'oculta',
  }).data;
  const kept = applyAdminCommand(hidden, {
    ...command,
    kind: 'review',
    id: 'denuncia-2',
    choice: 'mantida',
  }).data;
  expect(adminSummary(kept)).toMatchObject({ reportedReviewCount: 3, pendingReviewCount: 0 });
  expect(kept.cases[0]?.review).toBe(data.cases[0]?.review);
  expect(kept.cases[0]?.reports).toBe(data.cases[0]?.reports);
  expect(kept.producers).toBe(data.producers);
  expect(
    applyAdminCommand(kept, { ...command, kind: 'review', id: 'denuncia-1', choice: 'mantida' })
      .data,
  ).toBe(kept);
  expect(JSON.stringify(data)).toBe(before);
});
test('encomendas globais preservam snapshots cêntimos proprietários e histórico', () => {
  expect(orderTotal(byId(data.orders, 'enc-261010')!)).toBe(645);
  for (const order of data.orders) {
    expect(byId(data.users, order.buyerId)?.role).toBe('comprador');
    expect(byId(data.producers, order.producerId)).not.toBeNull();
    expect(order.items.every((item) => item.producerId === order.producerId)).toBe(true);
    expect(order.history.at(-1)?.status).toBe(order.status);
    expect(Number.isSafeInteger(orderTotal(order))).toBe(true);
    expect(
      order.history.every((event) => Date.parse(event.occurredAt) <= Date.parse(data.observedAt)),
    ).toBe(true);
  }
});
test('denúncias correspondem a entregas e respeitam cronologia e alvo produtor', () => {
  for (const entry of data.cases) {
    expect(byId(data.orders, entry.review.orderId)).toMatchObject({
      status: 'entregue',
      buyerId: entry.review.buyerId,
      producerId: entry.review.producerId,
    });
    for (const report of entry.reports)
      expect(Date.parse(report.reportedAt)).toBeGreaterThanOrEqual(
        Date.parse(entry.review.createdAt),
      );
    if (entry.decision)
      expect(Date.parse(entry.decision.decidedAt)).toBeGreaterThanOrEqual(
        Math.max(...entry.reports.map((r) => Date.parse(r.reportedAt))),
      );
  }
});
test('leilões associam referências do mesmo produtor sem ofertas ou vencedores artificiais', () => {
  expect(selectAdminAuctions(data, '', 'agendado')).toHaveLength(1);
  expect(selectAdminAuctions(data, '', 'terminado')).toHaveLength(4);
  for (const auction of data.auctions) {
    expect(byId(data.producers, auction.producerId)).not.toBeNull();
    if (auction.productId)
      expect(byId(data.products, auction.productId)?.producerId).toBe(auction.producerId);
    if (!auction.currentBid) {
      expect(auction.bidCount).toBe(0);
      expect(auction.result?.kind).not.toBe('adjudicado');
    } else {
      expect(auction.currentBid.sequence).toBe(auction.bidCount);
      expect(byId(data.users, auction.currentBid.buyerId)?.role).toBe('comprador');
    }
    if (auction.result?.kind === 'adjudicado') {
      expect(auction.result.bidId).toBe(auction.currentBid?.id);
      expect(auction.result.amountCents).toBe(auction.currentBid?.amountCents);
    }
    if (auction.state === 'ativo') expect(auction.result).toBeNull();
  }
});
test('serviços separam estado real desconhecido de exemplos sem afirmar operação', () => {
  expect(data.services.map((s) => s.name)).toEqual([
    'API',
    'Socket.io',
    'MongoDB Atlas',
    'Blob Storage',
    'Swagger UI',
  ]);
  for (const service of data.services) {
    expect(service.realStatus).toBe('nao-monitorizado');
    expect(service.realObservedAt).toBeNull();
    expect(['desconhecido', 'indisponivel', 'degradado']).toContain(service.illustration.status);
  }
});
test('fonte vazio erro e destinos internos são explícitos sem persistência ou HTTP', async () => {
  expect(await adminDemoSource.load('normal')).toBe(data);
  expect(
    Object.values(adminSummary(await adminDemoSource.load('vazio'))).every((v) => v === 0),
  ).toBe(true);
  await expect(adminDemoSource.load('erro')).rejects.toThrow();
  expect(parseAdminScenario('outro')).toBe('normal');
  for (const section of [
    'candidaturas',
    'produtores',
    'utilizadores',
    'encomendas',
    'moderacao',
    'leiloes',
  ]) {
    const path = '/area/administrador/' + section + '/exemplo-1';
    expect(demoDestination(path, 'administrador')).toBe(path);
  }
  for (const path of [
    'https://exemplo.test',
    '//exemplo.test',
    '/area/administrador/produtores/x/../utilizadores',
    '/area/administrador/servicos/x',
    '/area/administrador/moderacao/x?externo=1',
    '/area/produtor',
  ])
    expect(demoDestination(path, 'administrador')).toBe('/area/administrador');
});
