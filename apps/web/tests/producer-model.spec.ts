import { expect, test } from '@playwright/test';
import { producerDemoDataset as data, DEMO_PRODUCER_ID } from '../src/data/producer';
import { products, producers } from '../src/data/market';
import { orderTotal } from '../src/features/buyer/selectors';
import {
  applyProducerCommand,
  ownAuctions,
  ownOrders,
  ownProducts,
  priceToCents,
  productDraft,
  productOptions,
  producerSummary,
  selectProducerProduct,
  selectProducerProducts,
  stockSituation,
  validateProduct,
  validateProfile,
} from '../src/features/producer/selectors';
import { parseProducerScenario, producerDemoSource } from '../src/features/producer/source';
import { demoDestination } from '../src/features/private-area/navigation';
import type { ProductDraft, ProducerDataset } from '../src/features/producer/types';

const now = '2026-10-15T10:00:00Z';
const valid: ProductDraft = {
  name: 'Nabos demonstrativos',
  description: '',
  category: 'Hortícolas',
  unit: 'kg',
  price: '2,35',
  stock: '6',
  threshold: '3',
};
test('indicadores derivam dos dados próprios, com unidade e fórmula monetária coerentes', () => {
  const before = JSON.stringify(data);
  expect(producerSummary(data)).toEqual({
    productCount: 13,
    orderCount: 4,
    pendingOrderCount: 1,
    availableUnits: 295,
    lowStockCount: 1,
    unavailableCount: 1,
    deliveredValueCents: 645,
    activeAuctionCount: 1,
    bidCount: 7,
  });
  expect(ownOrders(data)[0]?.reference).toBe('DCM-P261015');
  expect(JSON.stringify(data)).toBe(before);
});
test('pesquisa normaliza acentos e combina categoria e disponibilidade sem mutar dados', () => {
  expect(
    selectProducerProducts(
      data,
      productOptions(new URLSearchParams('pesquisa=ABÓBORA&stock=reduzido')),
    ).map((p) => p.id),
  ).toEqual(['abobora-menina']);
  expect(
    selectProducerProducts(data, { search: '', category: 'Ervas e aromáticas', stock: 'todos' }),
  ).toHaveLength(2);
  expect(
    selectProducerProducts(data, { search: '', category: '', stock: 'indisponivel' }).map(
      (p) => p.id,
    ),
  ).toEqual(['brocolos']);
  expect(productOptions(new URLSearchParams('categoria=errada&stock=invalido'))).toEqual({
    search: '',
    category: '',
    stock: 'todos',
  });
  expect(selectProducerProduct(data, 'pera-rocha')).toBeNull();
});
test('parser de EUR recusa negativos, expoentes, frações excessivas e valores inseguros', () => {
  expect(priceToCents(' 3,25 ')).toBe(325);
  expect(priceToCents('0')).toBe(0);
  expect(priceToCents('12.5')).toBe(1250);
  for (const value of ['-1', '1,001', '1e2', 'NaN', '', 'Infinity', '9007199254740992', '1.234,56'])
    expect(priceToCents(value)).toBeNull();
});
test('validação de produto exige campos permitidos e stock inteiro não negativo', () => {
  expect(validateProduct(valid)).toEqual({});
  expect(
    validateProduct({
      ...valid,
      name: '',
      category: 'inventada',
      unit: 'litro',
      price: '-1',
      stock: '1.5',
      threshold: '-1',
    }),
  ).toMatchObject({
    name: expect.any(String),
    category: expect.any(String),
    unit: expect.any(String),
    price: expect.any(String),
    stock: expect.any(String),
    threshold: expect.any(String),
  });
  expect(
    validateProduct({ ...valid, stock: '9007199254740992', description: 'x'.repeat(1001) }),
  ).toMatchObject({ stock: expect.any(String), description: expect.any(String) });
});
test('criação guarda cópia privada, gera ID e placeholder e ignora atribuição de proprietário', () => {
  const publicBefore = JSON.stringify(products);
  const before = JSON.stringify(data);
  const result = applyProducerCommand(data, {
    type: 'product',
    draft: { ...valid, producerId: 'outro' } as ProductDraft,
    now,
  });
  expect(result.feedback.kind).toBe('success');
  expect(selectProducerProduct(result.data, 'produto-local-1')).toMatchObject({
    priceCents: 235,
    availableStock: 6,
    producerId: DEMO_PRODUCER_ID,
    organic: false,
  });
  expect(selectProducerProduct(result.data, 'produto-local-1')?.images[0].src).toContain(
    'product-placeholder.svg',
  );
  const second = applyProducerCommand(result.data, { type: 'product', draft: valid, now });
  expect(second.feedback.targetId).toBe('produto-local-2');
  expect(producerSummary(result.data).productCount).toBe(14);
  expect(JSON.stringify(data)).toBe(before);
  expect(JSON.stringify(products)).toBe(publicBefore);
});
test('edição atualiza preço e stock sem recalcular snapshots de encomendas', () => {
  const previous = selectProducerProduct(data, 'tomate-coracao');
  if (!previous) throw new Error('Produto de teste em falta.');
  const result = applyProducerCommand(data, {
    type: 'product',
    id: previous.id,
    draft: { ...productDraft(previous), price: '9,95', stock: '0' },
    now,
  });
  expect(result.feedback.kind).toBe('success');
  expect(selectProducerProduct(result.data, previous.id)).toMatchObject({
    priceCents: 995,
    availableStock: 0,
  });
  expect(producerSummary(result.data)).toMatchObject({
    unavailableCount: 2,
    deliveredValueCents: 645,
  });
  expect(
    ownOrders(result.data).find((order) => order.status === 'entregue')?.items[0]?.unitPriceCents,
  ).toBe(250);
  expect(
    ownOrders(result.data)
      .filter((order) => order.status === 'entregue')
      .map(orderTotal),
  ).toEqual([645]);
  expect(previous.priceCents).toBe(280);
});
test('limiar por produto distingue zero e alterações inválidas nunca ficam parcialmente aplicadas', () => {
  const item = selectProducerProduct(data, 'abobora-menina');
  if (!item) throw new Error('Produto em falta.');
  expect(stockSituation(item)).toBe('reduzido');
  expect(stockSituation({ ...item, lowStockThreshold: 1 })).toBe('disponivel');
  expect(stockSituation({ ...item, availableStock: 0, lowStockThreshold: 0 })).toBe('indisponivel');
  for (const draft of [
    { ...valid, stock: '-1' },
    { ...valid, stock: String(Number.MAX_SAFE_INTEGER) },
  ]) {
    const result = applyProducerCommand(data, { type: 'product', id: item.id, draft, now });
    expect(result.feedback.kind).toBe('error');
    expect(result.data).toBe(data);
  }
});
test('seletores e comandos excluem recursos alheios e propriedade não vem do formulário', () => {
  const item = data.products[0],
    order = data.orders[0],
    auction = data.auctions[0];
  if (!item || !order || !auction) throw new Error('Fixtures em falta.');
  const mixed: ProducerDataset = {
    ...data,
    products: [...data.products, { ...item, id: 'alheio', producerId: 'outro' }],
    orders: [...data.orders, { ...order, producerId: 'outro', id: 'alheia' }],
    auctions: [...data.auctions, { ...auction, producerId: 'outro', id: 'alheio' }],
  };
  expect(ownProducts(mixed)).toHaveLength(13);
  expect(ownOrders(mixed)).toHaveLength(4);
  expect(ownAuctions(mixed)).toHaveLength(4);
  const result = applyProducerCommand(mixed, { type: 'product', id: 'alheio', draft: valid, now });
  expect(result.data).toBe(mixed);
  expect(result.feedback.kind).toBe('error');
});
test('perfil aceita apenas nome público localidade e descrição sem tocar em aprovação ou fonte pública', () => {
  const before = JSON.stringify(producers);
  expect(validateProfile({ name: '', locality: '', description: '' })).toMatchObject({
    name: expect.any(String),
    locality: expect.any(String),
  });
  const result = applyProducerCommand(data, {
    type: 'profile',
    draft: {
      name: 'Horta local',
      locality: 'Viana do Castelo',
      description: 'Exemplo privado',
      approval: 'aprovado',
    } as { name: string; locality: string; description: string },
  });
  expect(result.feedback.kind).toBe('success');
  expect(result.data.profile.name).toBe('Horta local');
  expect(result.data.application).toEqual(data.application);
  expect(result.data.products.every((product) => product.producerName === 'Horta local')).toBe(
    true,
  );
  expect(result.data.orders).toBe(data.orders);
  expect(JSON.stringify(producers)).toBe(before);
});
test('encomendas próprias têm snapshots e histórico dos quatro estados sem dados pessoais', () => {
  expect(
    ownOrders(data)
      .map((order) => order.status)
      .sort(),
  ).toEqual(['confirmada', 'entregue', 'pendente', 'pronta']);
  expect(ownOrders(data, 'pendente')).toHaveLength(1);
  expect(ownOrders(data, 'manipulado')).toHaveLength(4);
  for (const order of ownOrders(data)) {
    expect(order.items.every((item) => item.producerId === DEMO_PRODUCER_ID)).toBe(true);
    expect(order.history.at(-1)?.status).toBe(order.status);
    expect(order.history[0]?.occurredAt).toBe(order.createdAt);
    expect(
      order.history.every((entry) => Date.parse(entry.occurredAt) <= Date.parse(data.observedAt)),
    ).toBe(true);
    expect(Number.isSafeInteger(orderTotal(order))).toBe(true);
  }
});
test('leilões respeitam estados prazo sequência resultado e preço base sem oferta artificial', () => {
  for (const auction of ownAuctions(data)) {
    expect(Date.parse(auction.endsAt)).toBeGreaterThan(Date.parse(auction.startsAt));
    if (!auction.currentBid) {
      expect(auction.bidCount).toBe(0);
      expect(auction.result?.kind).not.toBe('adjudicado');
    } else {
      expect(auction.currentBid.sequence).toBe(auction.bidCount);
      expect(auction.currentBid.amountCents).toBeGreaterThanOrEqual(
        auction.basePriceCents + auction.bidCount * auction.incrementCents,
      );
    }
    if (auction.state === 'agendado')
      expect(Date.parse(auction.startsAt)).toBeGreaterThan(Date.parse(data.observedAt));
    if (auction.state === 'ativo') {
      expect(auction.result).toBeNull();
      expect(Date.parse(auction.endsAt)).toBeGreaterThan(Date.parse(data.observedAt));
    }
    if (auction.state === 'terminado') {
      expect(Date.parse(auction.endsAt)).toBeLessThan(Date.parse(data.observedAt));
      if (auction.result?.kind === 'adjudicado')
        expect(auction.result.bidId).toBe(auction.currentBid?.id);
    }
  }
});
test('fonte oferece vazio e erro sem HTTP e destinos privados recusam caminhos externos ou alheios', async () => {
  expect(await producerDemoSource.load('normal')).toBe(data);
  const empty = await producerDemoSource.load('vazio');
  expect(producerSummary(empty)).toMatchObject({
    productCount: 0,
    orderCount: 0,
    availableUnits: 0,
    bidCount: 0,
    deliveredValueCents: 0,
  });
  await expect(producerDemoSource.load('erro')).rejects.toThrow();
  expect(parseProducerScenario('invalido')).toBe('normal');
  for (const path of [
    '/area/produtor/produtos/tomate-coracao/editar',
    '/area/produtor/perfil/pre-visualizacao',
    '/area/produtor/encomendas/enc-261010',
    '/area/produtor/leiloes/lote-cabazes',
  ])
    expect(demoDestination(path, 'produtor')).toBe(path);
  for (const path of [
    'https://example.test',
    '//example.test',
    '/area/produtor/produtos/x/../administrador',
    '/area/produtor/produtos/x?externo=1',
    '/area/comprador',
  ])
    expect(demoDestination(path, 'produtor')).toBe('/area/produtor');
});
