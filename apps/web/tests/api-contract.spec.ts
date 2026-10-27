import { expect, test } from '@playwright/test';
import { adaptProduct, adaptProducer, seasonLabel } from '../src/features/api/catalog';
import { parseProduct, parseProducer, parsePage } from '../src/features/api/catalog-contract';
import { productDtos, producerDtos } from './support/catalog-fixtures';
import {
  lineTotal,
  productQuantityError,
  cartReducer,
  cartSummary,
} from '../src/features/cart/model';
import { restoreCart } from '../src/features/cart/storage';
import { apiBase, getJson, ApiFailure } from '../src/features/api/client';
const sample = () => structuredClone(productDtos[0]!);
test('DTO público preserva IDs, preço e perfil, sem campos editoriais fabricados', () => {
  const dto = parseProduct(sample()),
    product = adaptProduct(dto),
    producer = adaptProducer(parseProducer(producerDtos[0]));
  expect(product.id).toMatch(/^[a-f0-9]{24}$/);
  expect(product.producerId).toBe(dto.produtor.id);
  expect(product.priceCents).toBe(dto.precoCent);
  expect(product.categoryId).toBe('cat-001');
  expect(product.featured).toBe(false);
  expect(producer).not.toHaveProperty('story');
  expect(producer).not.toHaveProperty('organicCertification');
  expect(producer).not.toHaveProperty('reviews');
});
for (const [mode, base, reference] of [
  ['peso', 'g', 1000],
  ['volume', 'ml', 1000],
  ['unidade', 'un', 1],
  ['embalagem', 'un', 1],
] as const) {
  test(`unidade ${mode}: conserva referência, mínimo, incremento e stock`, () => {
    const dto = sample();
    dto.unidadeVenda = {
      modalidade: mode,
      unidadeBase: base,
      quantidadeReferencia: reference,
      quantidadeMinima: reference === 1 ? 1 : 250,
      incrementoCompra: reference === 1 ? 1 : 50,
    };
    dto.stockDisponivel = reference * 10;
    const product = adaptProduct(parseProduct(dto));
    expect(product.availableStock).toBe(reference * 10);
    expect(product.sale).toEqual(dto.unidadeVenda);
    expect(lineTotal(reference, dto.precoCent, reference)).toBe(dto.precoCent);
  });
}
for (const [label, mutate] of [
  [
    'ID inválido',
    (d: ReturnType<typeof sample>) => {
      d.id = 'slug';
    },
  ],
  [
    'preço decimal',
    (d: ReturnType<typeof sample>) => {
      d.precoCent = 2.5;
    },
  ],
  [
    'stock inconsistente',
    (d: ReturnType<typeof sample>) => {
      d.stockDisponivel = 0;
    },
  ],
  [
    'unidade incompatível',
    (d: ReturnType<typeof sample>) => {
      d.unidadeVenda.unidadeBase = 'g';
    },
  ],
  [
    'categoria desconhecida',
    (d: ReturnType<typeof sample>) => {
      d.categoria.id = 'cat-999';
    },
  ],
  [
    'fotografia insegura',
    (d: ReturnType<typeof sample>) => {
      d.imagens[0]!.url = 'javascript:alert(1)';
    },
  ],
  [
    'mês inválido',
    (d: ReturnType<typeof sample>) => {
      d.epocaMeses = [13];
    },
  ],
  [
    'produtor ausente',
    (d: ReturnType<typeof sample>) => {
      d.produtor.nomePublico = '';
    },
  ],
] as const)
  test(`contrato recusa ${label}`, () => {
    const dto = sample();
    mutate(dto);
    expect(() => parseProduct(dto)).toThrow();
  });
test('ausência de meses, modo e imagem do produtor não cria informação', () => {
  const dto = sample();
  delete dto.epocaMeses;
  delete dto.modoProducao;
  delete dto.produtor.imagem;
  const product = adaptProduct(parseProduct(dto));
  expect(product.season).toEqual([]);
  expect(product.organic).toBe(false);
  expect(seasonLabel(product)).toBe('Não indicada pelo produtor');
});
test('metadados de paginação incoerentes são recusados; página além do fim mantém-se vazia', () => {
  expect(() =>
    parsePage({ itens: [], pagina: 1, porPagina: 12, total: 1, totalPaginas: 1 }, parseProduct),
  ).toThrow();
  expect(
    parsePage({ itens: [], pagina: 99, porPagina: 12, total: 1, totalPaginas: 1 }, parseProduct),
  ).toMatchObject({ pagina: 99, total: 1, itens: [] });
});
test('carrinho de peso aplica mínimo, grelha e half-up por linha', () => {
  const dto = sample();
  dto.precoCent = 199;
  dto.stockDisponivel = 5000;
  dto.unidadeVenda = {
    modalidade: 'peso',
    unidadeBase: 'g',
    quantidadeReferencia: 1000,
    quantidadeMinima: 250,
    incrementoCompra: 50,
  };
  const product = adaptProduct(dto);
  expect(lineTotal(250, 199, 1000)).toBe(50);
  expect(productQuantityError(249, product)).toContain('mínima');
  expect(productQuantityError(275, product)).toContain('múltiplos');
  expect(productQuantityError(300, product)).toBeNull();
  const session = {
    cart: { items: [], updatedAt: '2026-10-01T00:00:00Z' },
    feedback: null,
    recoveryMessages: [],
    storageIssue: null,
  };
  const next = cartReducer(session, {
    type: 'operate',
    operation: { type: 'add', productId: product.id, quantity: 250 },
    catalog: [product],
    now: session.cart.updatedAt,
  });
  expect(cartSummary(next.cart, [product]).subtotalCents).toBe(50);
  expect(next.cart.items[0]?.quantity).toBe(250);
});
test('snapshot público mantém escolhas durante falha ou ausência de catálogo parcial', () => {
  const product = adaptProduct(sample());
  const raw = JSON.stringify({
    version: 1,
    updatedAt: '2026-10-01T00:00:00Z',
    items: [
      {
        productId: product.id,
        producerId: product.producerId,
        quantity: 2,
        unitPriceSnapshotCents: product.priceCents,
        unit: product.unit,
        productSnapshot: product,
      },
    ],
  });
  const restored = restoreCart(raw, [], '2026-10-02T00:00:00Z');
  expect(restored.cart.items[0]?.productId).toBe(product.id);
  expect(restored.recoveryMessages).toEqual([]);
});
test('configuração pública recusa protocolos e credenciais', () => {
  for (const base of [
    'javascript:alert(1)',
    'https://user:secret@example.invalid/api',
    '//example.invalid/api',
  ])
    expect(() => apiBase(base)).toThrow();
  expect(apiBase('/api/')).toBe('/api');
  expect(apiBase('https://api.example.invalid/api')).toBe('https://api.example.invalid/api');
});
test('cliente tem timeout e não devolve dados quando o pedido já foi cancelado', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) =>
      new Promise((_, reject) => {
        const signal = options?.signal;
        if (signal?.aborted) {
          reject(new DOMException('abort', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')), {
          once: true,
        });
      });
    await expect(
      getJson('/products', (v) => v, undefined, {
        base: 'http://example.invalid/api',
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ kind: 'timeout' } satisfies Partial<ApiFailure>);
    const controller = new AbortController();
    controller.abort();
    await expect(
      getJson('/products', (v) => v, controller.signal, { base: 'http://example.invalid/api' }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  } finally {
    globalThis.fetch = previous;
  }
});
