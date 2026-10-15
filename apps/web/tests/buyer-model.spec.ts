import { expect, test } from '@playwright/test';
import { buyerDemoDataset, DEMO_BUYER_ID } from '../src/data/buyer';
import { products, producers } from '../src/data/market';
import {
  bidSituation,
  createLocalReview,
  dashboardSummary,
  eligibleReviewOrders,
  lineSubtotal,
  orderGroups,
  orderTotal,
  parseOrderOptions,
  selectBids,
  selectOrder,
  selectOrders,
  selectReviews,
  validateReview,
} from '../src/features/buyer/selectors';
import { buyerDemoSource, parseBuyerScenario } from '../src/features/buyer/source';
import type { BuyerDataset } from '../src/features/buyer/types';
import { demoDestination } from '../src/features/private-area/navigation';

const data = buyerDemoDataset;
test('indicadores e atividade recente são derivados dos dados sem alterar arrays', () => {
  const before = JSON.stringify(data);
  const summary = dashboardSummary(data);
  expect(summary).toMatchObject({
    orderCount: 6,
    ongoingOrderCount: 3,
    reviewCount: 2,
    activeBidCount: 2,
  });
  expect(summary.recentOrder?.id).toBe('enc-261015');
  expect(summary.relevantBids.map((bid) => bid.id)).toEqual(['cabazes', 'peras']);
  expect(JSON.stringify(data)).toBe(before);
});
test('encomendas filtram estados, ordenam datas e recuperam parâmetros desconhecidos', () => {
  expect(selectOrders(data, { status: 'entregue' }).map((order) => order.id)).toEqual([
    'enc-261010',
    'enc-261008',
    'enc-261006',
  ]);
  expect(selectOrders(data, { status: 'pronta' }).map((order) => order.id)).toEqual(['enc-261014']);
  expect(selectOrders(data, { sort: 'antigas' })[0]?.id).toBe('enc-261006');
  expect(parseOrderOptions(new URLSearchParams('estado=cancelada&ordem=errada'))).toEqual({
    status: 'todos',
    sort: 'recentes',
  });
  expect(selectOrder(data, 'inexistente')).toBeNull();
});
test('totais usam snapshots em cêntimos, sem taxas nem recálculo por preços atuais', () => {
  expect(data.orders.map(orderTotal)).toEqual([480, 670, 750, 645, 1010, 880]);
  const historical = selectOrder(data, 'enc-261010');
  if (!historical) throw new Error('Encomenda de teste em falta.');
  expect(historical.items[0]?.unitPriceCents).toBe(250);
  expect(products.find((product) => product.id === 'tomate-coracao')?.priceCents).toBe(280);
  expect(orderGroups(historical)).toMatchObject([
    { producerId: 'horta-ribeira', subtotalCents: 645 },
  ]);
  expect(orderGroups(historical)[0]?.items).toHaveLength(2);
  const item = historical.items[0];
  if (!item) throw new Error('Linha em falta.');
  expect(() => lineSubtotal({ ...item, quantity: 0 })).toThrow();
  expect(() => lineSubtotal({ ...item, unitPriceCents: NaN })).toThrow();
  expect(() =>
    lineSubtotal({ ...item, quantity: 2, unitPriceCents: Number.MAX_SAFE_INTEGER }),
  ).toThrow();
  expect(() =>
    orderTotal({
      ...historical,
      items: [
        { ...item, quantity: 1, unitPriceCents: Number.MAX_SAFE_INTEGER },
        { ...item, quantity: 1 },
      ],
    }),
  ).toThrow();
});
test('seletores próprios excluem encomendas, avaliações e ofertas de outro comprador', () => {
  const order = data.orders[0];
  const review = data.reviews[0];
  const bid = data.bids[0];
  if (!order || !review || !bid) throw new Error('Fixtures em falta.');
  const mixed: BuyerDataset = {
    ...data,
    orders: [...data.orders, { ...order, id: 'alheia', buyerId: 'outro' }],
    reviews: [...data.reviews, { ...review, id: 'alheia', buyerId: 'outro' }],
    bids: [...data.bids, { ...bid, id: 'alheia', buyerId: 'outro' }],
  };
  expect(dashboardSummary(mixed)).toMatchObject({
    orderCount: 6,
    reviewCount: 2,
    activeBidCount: 2,
  });
  expect(selectOrder(mixed, 'alheia')).toBeNull();
  expect(selectReviews(mixed)).toHaveLength(2);
  expect(selectBids(mixed)).toHaveLength(4);
  expect(selectOrders(mixed, {}, 'outro')).toHaveLength(1);
});
test('relações e históricos de encomendas são coerentes com catálogo e entrega', () => {
  for (const order of data.orders) {
    expect(order.buyerId).toBe(DEMO_BUYER_ID);
    expect(orderGroups(order)).toHaveLength(1);
    expect(order.history.at(-1)?.status).toBe(order.status);
    expect(order.history[0]?.occurredAt).toBe(order.createdAt);
    expect(
      order.history.every((entry) => Date.parse(entry.occurredAt) <= Date.parse(data.observedAt)),
    ).toBe(true);
    for (const item of order.items) {
      expect(
        products.some(
          (product) => product.id === item.productId && product.producerId === item.producerId,
        ),
      ).toBe(true);
      expect(producers.some((producer) => producer.id === item.producerId)).toBe(true);
      expect(Number.isSafeInteger(lineSubtotal(item))).toBe(true);
    }
  }
  for (const review of data.reviews) {
    const order = selectOrder(data, review.orderId);
    expect(order?.status).toBe('entregue');
    expect(order?.items.some((item) => item.producerId === review.producerId)).toBe(true);
    expect(Date.parse(review.createdAt)).toBeGreaterThanOrEqual(
      Date.parse(order?.history.at(-1)?.occurredAt ?? ''),
    );
    expect(review.demonstration).toBe(true);
  }
});
test('avaliação só é permitida após entrega própria e sem avaliação desse alvo', () => {
  expect(eligibleReviewOrders(data).map((order) => order.id)).toEqual(['enc-261006']);
  for (const orderId of ['enc-261015', 'enc-261014', 'enc-261013', 'enc-261010', 'inexistente'])
    expect(validateReview(data, { orderId, rating: 5, text: '' })).toContain('entregue');
  for (const rating of [0, 6, 1.5, NaN])
    expect(validateReview(data, { orderId: 'enc-261006', rating, text: '' })).toContain('1 a 5');
  expect(
    validateReview(data, { orderId: 'enc-261006', rating: 4, text: 'x'.repeat(1001) }),
  ).toContain('1000');
  const before = JSON.stringify(data);
  const review = createLocalReview(
    data,
    { orderId: 'enc-261006', rating: 4, text: '' },
    '2026-10-15T10:00:00Z',
  );
  expect(review).toMatchObject({
    producerId: 'forno-aldeia',
    text: 'Sem comentário.',
    target: 'produtor',
    rating: 4,
  });
  const updated = { ...data, reviews: [...data.reviews, review] };
  expect(eligibleReviewOrders(updated)).toHaveLength(0);
  expect(dashboardSummary(updated).reviewCount).toBe(3);
  expect(() =>
    createLocalReview(
      updated,
      { orderId: 'enc-261006', rating: 5, text: 'Duplicada' },
      data.observedAt,
    ),
  ).toThrow();
  expect(JSON.stringify(data)).toBe(before);
});
test('licitações obedecem ao snapshot de base, incremento, prazo, sequência e resultado', () => {
  expect(selectBids(data).map(bidSituation)).toEqual([
    'mais-elevada',
    'ultrapassada',
    'terminado',
    'ganho',
  ]);
  for (const bid of data.bids) {
    const auction = bid.auction;
    expect(bid.amountCents).toBeGreaterThanOrEqual(
      auction.basePriceCents + auction.incrementCents * bid.sequence,
    );
    expect(auction.currentBid.amountCents).toBeGreaterThanOrEqual(
      auction.basePriceCents + auction.incrementCents * auction.currentBid.sequence,
    );
    expect(bid.sequence).toBeLessThanOrEqual(auction.currentBid.sequence);
    expect(Date.parse(bid.acceptedAt)).toBeGreaterThanOrEqual(Date.parse(auction.startsAt));
    expect(Date.parse(bid.acceptedAt)).toBeLessThan(Date.parse(auction.endsAt));
    if (auction.state === 'ativo') {
      expect(auction.result).toBeNull();
      expect(Date.parse(auction.endsAt)).toBeGreaterThan(Date.parse(data.observedAt));
      expect(bidSituation(bid)).not.toBe('ganho');
    } else {
      expect(Date.parse(auction.endsAt)).toBeLessThanOrEqual(Date.parse(data.observedAt));
      expect(auction.result).toMatchObject({
        winnerId: auction.currentBid.buyerId,
        bidId: auction.currentBid.id,
        amountCents: auction.currentBid.amountCents,
      });
    }
  }
});
test('fonte local oferece cenários assíncronos explícitos sem pedidos ou temporizadores', async () => {
  expect(await buyerDemoSource.load('normal')).toBe(data);
  const empty = await buyerDemoSource.load('vazio');
  expect(dashboardSummary(empty)).toMatchObject({
    orderCount: 0,
    ongoingOrderCount: 0,
    reviewCount: 0,
    activeBidCount: 0,
    recentOrder: null,
  });
  await expect(buyerDemoSource.load('erro')).rejects.toThrow('demonstrativa');
  expect(parseBuyerScenario('desconhecido')).toBe('normal');
});
test('retoma detalhes internos do comprador sem aceitar URLs externos ou percursos alheios', () => {
  expect(demoDestination('/area/comprador/encomendas/enc-261010', 'comprador')).toBe(
    '/area/comprador/encomendas/enc-261010',
  );
  expect(demoDestination('/area/comprador/licitacoes/lote-cabazes', 'comprador')).toBe(
    '/area/comprador/licitacoes/lote-cabazes',
  );
  for (const path of [
    '/area/comprador/encomendas/../administrador',
    '//example.test',
    '/area/comprador/encomendas/x?externo=1',
  ])
    expect(demoDestination(path, 'comprador')).toBe('/area/comprador');
  expect(demoDestination('/area/comprador/encomendas/enc-261010', 'produtor')).toBe(
    '/area/produtor',
  );
});
