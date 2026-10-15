import { expect, test } from '@playwright/test';
import { products } from '../src/data/market';
import {
  cartReducer,
  cartSummary,
  emptyCart,
  quantityError,
  reconcileItems,
} from '../src/features/cart/model';
import { CART_STORAGE_VERSION, restoreCart } from '../src/features/cart/storage';
import type { CartOperation, CartSession } from '../src/features/cart/types';

const now = '2026-10-15T10:00:00.000Z';
const blank = (): CartSession => ({
  cart: emptyCart(now),
  feedback: null,
  recoveryMessages: [],
  storageIssue: null,
});
const operate = (session: CartSession, operation: CartOperation, catalog = products) =>
  cartReducer(session, { type: 'operate', operation, catalog, now });
const storedItem = (productId = 'tomate-coracao', quantity = 1) => {
  const product = products.find((product) => product.id === productId);
  if (!product) throw new Error('Produto de teste não existe.');
  return {
    productId,
    producerId: product.producerId,
    quantity,
    unitPriceSnapshotCents: product.priceCents,
    unit: product.unit,
  };
};
const stored = (items: unknown[]) =>
  JSON.stringify({ version: CART_STORAGE_VERSION, updatedAt: now, items });

test('adições repetidas e alterações são imutáveis, agrupadas e calculadas em cêntimos', () => {
  const first = operate(blank(), { type: 'add', productId: 'tomate-coracao', quantity: 1 });
  const before = JSON.stringify(first);
  const second = operate(first, { type: 'add', productId: 'tomate-coracao', quantity: 1 });
  const third = operate(second, { type: 'add', productId: 'pera-rocha', quantity: 3 });
  const totals = cartSummary(third.cart, products);
  expect(totals).toMatchObject({ itemCount: 5, subtotalCents: 1280, totalCents: 1280 });
  expect(totals.producerGroups.map((group) => [group.producerId, group.subtotalCents])).toEqual([
    ['horta-ribeira', 560],
    ['pomar-vale', 720],
  ]);
  expect(third.cart.items).toHaveLength(2);
  expect(JSON.stringify(first)).toBe(before);
});

test('quantidades inválidas, indisponibilidade e adições acima do stock não alteram o carrinho', () => {
  for (const quantity of [-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const result = operate(blank(), { type: 'add', productId: 'tomate-coracao', quantity });
    expect(result.cart.items).toEqual([]);
    expect(result.feedback?.kind).toBe('error');
  }
  for (const productId of ['brocolos', 'removido']) {
    const result = operate(blank(), { type: 'add', productId, quantity: 1 });
    expect(result.cart.items).toEqual([]);
    expect(result.feedback?.kind).toBe('error');
  }
  const full = operate(blank(), { type: 'add', productId: 'tomate-coracao', quantity: 18 });
  const attempt = operate(full, { type: 'add', productId: 'tomate-coracao', quantity: 1 });
  expect(attempt.cart).toBe(full.cart);
  expect(attempt.feedback?.kind).toBe('error');
  expect(quantityError('', 18)).not.toBeNull();
  expect(quantityError('2.5', 18)).not.toBeNull();
  expect(quantityError('0', 18)).toBeNull();
});

test('zero retira uma linha, aumentar/diminuir atualiza totais e limpar esvazia', () => {
  let session = operate(blank(), { type: 'add', productId: 'tomate-coracao', quantity: 2 });
  session = operate(session, { type: 'quantity', productId: 'tomate-coracao', quantity: 3 });
  expect(cartSummary(session.cart, products).totalCents).toBe(840);
  session = operate(session, { type: 'quantity', productId: 'tomate-coracao', quantity: 1 });
  expect(cartSummary(session.cart, products).totalCents).toBe(280);
  session = operate(session, { type: 'quantity', productId: 'tomate-coracao', quantity: 0 });
  expect(session.cart.items).toEqual([]);
  session = operate(session, { type: 'add', productId: 'pera-rocha', quantity: 1 });
  expect(operate(session, { type: 'clear' }).cart.items).toEqual([]);
});

test('persistência rejeita JSON, versão, esquema e linhas inválidas sem descartar linhas válidas', () => {
  for (const raw of [
    '{',
    'null',
    '[]',
    '{}',
    stored([]).replace('"version":1', '"version":99'),
    stored([]).replace(now, 'data-inválida'),
  ]) {
    const result = restoreCart(raw, products, now);
    expect(result.cart.items).toEqual([]);
    expect(result.recoveryMessages.length).toBeGreaterThan(0);
  }
  const result = restoreCart(
    stored([
      storedItem(),
      { ...storedItem('pera-rocha'), quantity: 1.5 },
      { ...storedItem('kiwi-hayward'), unitPriceSnapshotCents: -1 },
      null,
    ]),
    products,
    now,
  );
  expect(result.cart.items).toEqual([storedItem()]);
  expect(result.recoveryMessages.length).toBeGreaterThan(0);
});

test('restauração reconcilia stock, produto removido, preço adulterado, unidade e duplicados', () => {
  const result = restoreCart(
    stored([
      {
        ...storedItem(),
        quantity: 30,
        unitPriceSnapshotCents: 1,
        producerId: 'falso',
        unit: 'errada',
      },
      storedItem(),
      { ...storedItem('pera-rocha'), productId: 'removido' },
      storedItem('brocolos'),
    ]),
    products,
    now,
  );
  expect(result.cart.items).toEqual([storedItem('tomate-coracao', 18)]);
  expect(cartSummary(result.cart, products).totalCents).toBe(5040);
  expect(result.recoveryMessages.join(' ')).toContain('reduzida');
  expect(result.recoveryMessages.join(' ')).toContain('atualizados');
  expect(result.recoveryMessages.join(' ')).toContain('reunidas');
});

test('mudanças de catálogo reconciliam o estado existente sem reservar ou alterar o stock', () => {
  const session = operate(blank(), { type: 'add', productId: 'tomate-coracao', quantity: 8 });
  const lowered = products.map((product) =>
    product.id === 'tomate-coracao' ? { ...product, availableStock: 3, priceCents: 300 } : product,
  );
  const snapshot = JSON.stringify(lowered);
  const next = cartReducer(session, { type: 'reconcile', catalog: lowered, now });
  expect(next.cart.items[0]).toMatchObject({ quantity: 3, unitPriceSnapshotCents: 300 });
  expect(cartSummary(next.cart, lowered).totalCents).toBe(900);
  const none = lowered.map((product) =>
    product.id === 'tomate-coracao' ? { ...product, availableStock: 0 } : product,
  );
  expect(cartReducer(next, { type: 'reconcile', catalog: none, now }).cart.items).toEqual([]);
  expect(JSON.stringify(lowered)).toBe(snapshot);
});

test('overflow monetário é recusado e erro de armazenamento mantém as escolhas em memória', () => {
  const product = products[0];
  if (!product) throw new Error('Produto de teste não existe.');
  const catalog = [{ ...product, priceCents: Number.MAX_SAFE_INTEGER }];
  const invalid = operate(blank(), { type: 'add', productId: product.id, quantity: 2 }, catalog);
  expect(invalid.cart.items).toEqual([]);
  expect(invalid.feedback?.kind).toBe('error');
  expect(reconcileItems([storedItem(product.id, 2)], catalog).items).toEqual([]);
  const valid = operate(blank(), { type: 'add', productId: 'tomate-coracao', quantity: 1 });
  const failed = cartReducer(valid, { type: 'storage-failure' });
  expect(failed.cart).toBe(valid.cart);
  expect(failed.storageIssue).toContain('neste browser');
});
