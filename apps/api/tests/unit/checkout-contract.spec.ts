import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  CheckoutValidationError,
  checkoutCanonicalVersion,
  checkoutTechnicalLimits,
} from '../../src/modules/orders/checkout.contract.js';
import type {
  CheckoutAcceptedOffer,
  CheckoutModality,
  CheckoutReceipt,
  CheckoutResult,
  CheckoutTechnicalLimits,
  CheckoutValidationCode,
} from '../../src/modules/orders/checkout.contract.js';
import { validateCheckoutInput } from '../../src/modules/orders/checkout.validation.js';
import { canonicalizeCheckout } from '../../src/modules/orders/checkout.canonicalization.js';
import { fingerprintCheckout } from '../../src/modules/orders/checkout.fingerprint.js';
import type {
  OrderReceptionModality,
  OrderSaleUnit,
} from '../../src/modules/orders/order.types.js';

const buyer = { compradorContaId: 'dddddddddddddddddddddddd' };
const key = 'chave-ficticia-4b1';
const producer = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const otherProducer = 'cccccccccccccccccccccccc';
const product = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const otherProduct = 'eeeeeeeeeeeeeeeeeeeeeeee';

function line(id = product, owner = producer, quantity = 1) {
  return {
    produtoId: id,
    produtorContaId: owner,
    quantidade: quantity,
    ofertaAceite: {
      precoReferenciaCent: 150,
      revisaoProdutoObservada: 0,
      unidadeVenda: {
        modalidade: 'unidade' as const,
        unidadeBase: 'un' as const,
        quantidadeReferencia: 1 as const,
        quantidadeMinima: 1,
        incrementoCompra: 1,
      },
    },
  };
}

function selection(owner = producer) {
  return {
    produtorContaId: owner,
    modalidade: 'levantamento' as const,
    periodo: {
      inicioEm: '2026-10-26T14:00:00Z',
      fimEm: '2026-10-26T15:00:00Z',
      fusoHorario: 'Europe/Lisbon',
    },
    metodoPagamento: 'dinheiro' as const,
    taxaEntregaAceiteCent: 0,
    revisaoProdutorObservada: 0,
  };
}

function delivery(owner = producer) {
  return {
    ...selection(owner),
    modalidade: 'entrega' as const,
    taxaEntregaAceiteCent: 250,
    concelhoId: 'concelho-ficticio-001',
    morada: 'Morada privada fictícia',
    contacto: 'Contacto privado fictício',
  };
}

function request() {
  return { linhas: [line()], condicoesPorProdutor: [selection()] };
}

function multiple() {
  return {
    linhas: [line(otherProduct, otherProducer), line()],
    condicoesPorProdutor: [selection(otherProducer), selection()],
  };
}

function replace(path: string, value: unknown, original: unknown = request()): unknown {
  const result: unknown = structuredClone(original);
  const keys = path.split('.');
  let target = result as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[keys.at(-1)!] = value;
  return result;
}

function rejected(run: () => unknown, code?: CheckoutValidationCode) {
  let failure: unknown;
  try {
    run();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(CheckoutValidationError);
  if (!(failure instanceof CheckoutValidationError)) throw new Error('Expected validation failure');
  if (code) expect(failure.codigo).toBe(code);
  expect(failure.campos).toHaveLength(1);
  expect(failure).not.toHaveProperty('status');
  return failure;
}

function reverseProperties(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseProperties);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, value]) => [key, reverseProperties(value)]),
    );
  return value;
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe('contrato puro e associação declarada de produtores', () => {
  it('aceita um produtor sem criar resultados, referências ou metadados comerciais', () => {
    const result = validateCheckoutInput(buyer, key, request());
    expect(result.contexto).toEqual(buyer);
    expect(result.chaveIdempotencia).toBe(key);
    expect(result.pedido.linhas).toHaveLength(1);
    expect(result.pedido.condicoesPorProdutor[0]?.periodo.inicioEm).toBe(
      '2026-10-26T14:00:00.000Z',
    );
    expect(Object.keys(result).sort()).toEqual(['chaveIdempotencia', 'contexto', 'pedido']);
    expect(result).not.toHaveProperty('recibo');
  });
  it('aceita vários produtores e ordena por identificador sem locale', () => {
    const result = validateCheckoutInput(buyer, key, multiple());
    expect(result.pedido.linhas.map((l) => l.produtoId)).toEqual([product, otherProduct]);
    expect(result.pedido.condicoesPorProdutor.map((c) => c.produtorContaId)).toEqual([
      producer,
      otherProducer,
    ]);
  });
  it('mantém a identidade separada e rejeita tentativas de escolher comprador ou papel no pedido', () => {
    for (const extra of [
      { buyerId: buyer.compradorContaId },
      { compradorContaId: buyer.compradorContaId },
      { papel: 'administrador' },
      { totalCent: 1 },
      { operacaoCompraId: 'inventada' },
    ])
      rejected(
        () => validateCheckoutInput(buyer, key, { ...request(), ...extra }),
        'PEDIDO_INVALIDO',
      );
    rejected(
      () => validateCheckoutInput({ ...buyer, role: 'comprador' }, key, request()),
      'PEDIDO_INVALIDO',
    );
  });
  it.each([
    {},
    null,
    [],
    new Map(),
    new Date(),
    { linhas: [] },
    { linhas: [], condicoesPorProdutor: [] },
  ])('rejeita estrutura ou lista vazia %#', (value) => {
    rejected(() => validateCheckoutInput(buyer, key, value), 'PEDIDO_INVALIDO');
  });
  it.each(['', 'produto-slug', 'a'.repeat(23), 'a'.repeat(25), 'z'.repeat(24), 12, null])(
    'rejeita ID inválido %#',
    (value) => {
      rejected(
        () => validateCheckoutInput(buyer, key, replace('linhas.0.produtoId', value)),
        'PEDIDO_INVALIDO',
      );
      rejected(
        () => validateCheckoutInput({ compradorContaId: value }, key, request()),
        'PEDIDO_INVALIDO',
      );
      rejected(
        () =>
          validateCheckoutInput(
            buyer,
            key,
            replace('condicoesPorProdutor.0.produtorContaId', value),
          ),
        'PEDIDO_INVALIDO',
      );
    },
  );
  it('normaliza hexadecimal sem confundir conta e perfil ou consultar propriedade real', () => {
    const input = replace('linhas.0.produtoId', product.toUpperCase());
    expect(canonicalizeCheckout(buyer, key, input)).toBe(
      canonicalizeCheckout(buyer, key, request()),
    );
    rejected(
      () =>
        validateCheckoutInput(buyer, key, {
          ...request(),
          condicoesPorProdutor: [selection(otherProducer)],
        }),
      'CONDICOES_PRODUTOR_INCOERENTES',
    );
  });
  it.each(['', 'com espaço', ' chave', 'chave\n', 'ç', 'a'.repeat(129), null, 10])(
    'rejeita chave não opaca %#',
    (value) => {
      rejected(() => validateCheckoutInput(buyer, value, request()), 'PEDIDO_INVALIDO');
    },
  );
  it('aceita o limite de 128 caracteres e não incorpora a chave na representação', () => {
    expect(validateCheckoutInput(buyer, 'a'.repeat(128), request()).chaveIdempotencia).toHaveLength(
      128,
    );
    expect(canonicalizeCheckout(buyer, key, request())).not.toContain(key);
    expect(fingerprintCheckout(buyer, key, request())).toBe(
      fingerprintCheckout(buyer, 'outra-chave', request()),
    );
  });
  it('exige exatamente uma seleção por produtor e rejeita produtores contraditórios no mesmo produto', () => {
    for (const input of [
      { ...request(), condicoesPorProdutor: [selection(), selection()] },
      { ...request(), condicoesPorProdutor: [selection(), selection(otherProducer)] },
      { ...multiple(), condicoesPorProdutor: [selection()] },
      { ...request(), linhas: [line(), line(product, otherProducer)] },
    ])
      rejected(() => validateCheckoutInput(buyer, key, input), 'CONDICOES_PRODUTOR_INCOERENTES');
  });
});

describe('validação e agregação reutilizam as regras de orders', () => {
  it.each([0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null])(
    'rejeita quantidade inválida %#',
    (value) => {
      rejected(
        () => validateCheckoutInput(buyer, key, replace('linhas.0.quantidade', value)),
        'QUANTIDADE_INVALIDA',
      );
    },
  );
  it.each([0, -1, 1.5, NaN, Infinity, 1_000_001, '150', null])(
    'rejeita preço inválido %#',
    (value) => {
      rejected(
        () =>
          validateCheckoutInput(
            buyer,
            key,
            replace('linhas.0.ofertaAceite.precoReferenciaCent', value),
          ),
        'OFERTA_INCOERENTE',
      );
    },
  );
  it.each([
    null,
    {},
    { modalidade: 'caixa' },
    { ...line().ofertaAceite.unidadeVenda, unidadeBase: 'g' },
    { ...line().ofertaAceite.unidadeVenda, incrementoCompra: 0 },
  ])('rejeita unidade inválida %#', (value) => {
    rejected(() =>
      validateCheckoutInput(buyer, key, replace('linhas.0.ofertaAceite.unidadeVenda', value)),
    );
  });
  it('agrega A2, B1, A3 e conserva a oferta aceite antes de mínimos/incrementos', () => {
    const input = {
      ...request(),
      linhas: [line(product, producer, 2), line(otherProduct), line(product, producer, 3)],
    };
    const result = validateCheckoutInput(buyer, key, input);
    expect(result.pedido.linhas.map((l) => [l.produtoId, l.quantidade])).toEqual([
      [product, 5],
      [otherProduct, 1],
    ]);
    expect(result.pedido.linhas[0]?.ofertaAceite).toEqual(line().ofertaAceite);
  });
  it('não valida mínimo/grelha nem arredonda fragmentos individualmente', () => {
    const weighted = {
      ...line(),
      quantidade: 250,
      ofertaAceite: {
        ...line().ofertaAceite,
        unidadeVenda: {
          modalidade: 'peso',
          unidadeBase: 'g',
          quantidadeReferencia: 1000,
          quantidadeMinima: 500,
          incrementoCompra: 500,
        },
      },
    };
    const input = { ...request(), linhas: [weighted, structuredClone(weighted)] };
    expect(validateCheckoutInput(buyer, key, input).pedido.linhas[0]?.quantidade).toBe(500);
    const combined = { ...request(), linhas: [{ ...weighted, quantidade: 500 }] };
    expect(fingerprintCheckout(buyer, key, input)).toBe(fingerprintCheckout(buyer, key, combined));
    rejected(
      () => validateCheckoutInput(buyer, key, { ...request(), linhas: [weighted] }),
      'QUANTIDADE_INVALIDA',
    );
  });
  it('reutiliza a rejeição de subtotal zero após agregação e não cobra artificialmente um cêntimo', () => {
    const tiny = {
      ...line(),
      ofertaAceite: {
        ...line().ofertaAceite,
        precoReferenciaCent: 1,
        unidadeVenda: {
          modalidade: 'peso',
          unidadeBase: 'g',
          quantidadeReferencia: 1000,
          quantidadeMinima: 1,
          incrementoCompra: 1,
        },
      },
    };
    rejected(
      () => validateCheckoutInput(buyer, key, { ...request(), linhas: [tiny] }),
      'OFERTA_INCOERENTE',
    );
    expect(
      validateCheckoutInput(buyer, key, {
        ...request(),
        linhas: [
          { ...tiny, quantidade: 250 },
          { ...tiny, quantidade: 250 },
        ],
      }).pedido.linhas[0]?.quantidade,
    ).toBe(500);
  });
  it.each([
    ['precoReferenciaCent', 151],
    ['revisaoProdutoObservada', 1],
    ['unidadeVenda', { ...line().ofertaAceite.unidadeVenda, quantidadeMinima: 2 }],
  ])('rejeita oferta duplicada contraditória em %s', (field, value) => {
    const conflicting = replace('ofertaAceite.' + field, value, line());
    rejected(
      () => validateCheckoutInput(buyer, key, { ...request(), linhas: [line(), conflicting] }),
      'OFERTA_INCOERENTE',
    );
  });
  it('não aceita compensar fragmentos negativos nem ultrapassar o teto agregado', () => {
    rejected(
      () =>
        validateCheckoutInput(buyer, key, {
          ...request(),
          linhas: [line(product, producer, -1), line(product, producer, 2)],
        }),
      'QUANTIDADE_INVALIDA',
    );
    rejected(
      () =>
        validateCheckoutInput(buyer, key, {
          ...request(),
          linhas: [line(product, producer, 100_000), line()],
        }),
      'QUANTIDADE_INVALIDA',
    );
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0', null])(
    'rejeita revisão inválida %#',
    (value) => {
      rejected(
        () =>
          validateCheckoutInput(
            buyer,
            key,
            replace('linhas.0.ofertaAceite.revisaoProdutoObservada', value),
          ),
        'PEDIDO_INVALIDO',
      );
      rejected(
        () =>
          validateCheckoutInput(
            buyer,
            key,
            replace('condicoesPorProdutor.0.revisaoProdutorObservada', value),
          ),
        'PEDIDO_INVALIDO',
      );
    },
  );
  it('aceita revisão inteira segura máxima como token sem afirmar que permite uma escrita', () => {
    expect(
      validateCheckoutInput(
        buyer,
        key,
        replace('linhas.0.ofertaAceite.revisaoProdutoObservada', Number.MAX_SAFE_INTEGER),
      ).pedido.linhas[0]?.ofertaAceite.revisaoProdutoObservada,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('seleções comerciais e valores monetários', () => {
  it.each([
    ['modalidade', 'teletransporte'],
    ['metodoPagamento', 'cartao'],
    ['taxaEntregaAceiteCent', -1],
    ['taxaEntregaAceiteCent', 0.5],
    ['taxaEntregaAceiteCent', Infinity],
    ['taxaEntregaAceiteCent', '0'],
    ['taxaEntregaAceiteCent', Number.MAX_SAFE_INTEGER + 1],
  ])('recusa seleção inválida em %s %#', (field, value) => {
    rejected(() =>
      validateCheckoutInput(buyer, key, replace('condicoesPorProdutor.0.' + field, value)),
    );
  });
  it('levantamento exige zero e não aceita morada, contacto, concelho ou local atribuído pelo cliente', () => {
    for (const extra of [
      { taxaEntregaAceiteCent: 1 },
      { morada: 'privada' },
      { contacto: 'privado' },
      { concelhoId: 'concelho' },
      { localLevantamento: 'inventado' },
    ])
      rejected(() =>
        validateCheckoutInput(buyer, key, {
          ...request(),
          condicoesPorProdutor: [{ ...selection(), ...extra }],
        }),
      );
  });
  it('entrega exige dados mínimos e concelho opaco; não assume um catálogo ou disponibilidade reais', () => {
    const input = { ...request(), condicoesPorProdutor: [delivery()] };
    expect(validateCheckoutInput(buyer, key, input).pedido.condicoesPorProdutor[0]).toMatchObject({
      modalidade: 'entrega',
      concelhoId: 'concelho-ficticio-001',
    });
    for (const value of ['', null, 'com espaço', 'x'.repeat(129)])
      rejected(() =>
        validateCheckoutInput(
          buyer,
          key,
          replace('condicoesPorProdutor.0.concelhoId', value, input),
        ),
      );
    for (const field of ['morada', 'contacto'])
      rejected(() =>
        validateCheckoutInput(buyer, key, replace('condicoesPorProdutor.0.' + field, '   ', input)),
      );
  });
  it('rejeita overflow de total por produtor e global sem impor o teto de products à taxa', () => {
    const input = {
      ...request(),
      condicoesPorProdutor: [
        { ...delivery(), taxaEntregaAceiteCent: Number.MAX_SAFE_INTEGER - 150 },
      ],
    };
    expect(() => validateCheckoutInput(buyer, key, input)).not.toThrow();
    rejected(
      () =>
        validateCheckoutInput(
          buyer,
          key,
          replace(
            'condicoesPorProdutor.0.taxaEntregaAceiteCent',
            Number.MAX_SAFE_INTEGER - 149,
            input,
          ),
        ),
      'OFERTA_INCOERENTE',
    );
    const global = {
      ...multiple(),
      condicoesPorProdutor: [
        { ...delivery(), taxaEntregaAceiteCent: Number.MAX_SAFE_INTEGER - 150 },
        selection(otherProducer),
      ],
    };
    rejected(() => validateCheckoutInput(buyer, key, global), 'OFERTA_INCOERENTE');
  });
});

describe('UTC explícito e fuso IANA, sem relógio ou resolução local', () => {
  it.each([
    '2026-02-30T14:00:00Z',
    '2026-10-26T24:00:00Z',
    '2026-10-26T14:00:60Z',
    '2026-10-26T14:00:00',
    '2026-10-26',
    '2026-10-26T15:00:00+01:00',
    new Date(NaN),
    null,
    42,
  ])('rejeita instante implícito, normalizado silenciosamente ou inválido %#', (value) => {
    rejected(() =>
      validateCheckoutInput(buyer, key, replace('condicoesPorProdutor.0.periodo.inicioEm', value)),
    );
  });
  it('normaliza frações e Date UTC sem mutar nem guardar o objeto Date original', () => {
    const date = new Date('2026-10-26T14:00:00.100Z');
    const a = replace('condicoesPorProdutor.0.periodo.inicioEm', date);
    const b = replace('condicoesPorProdutor.0.periodo.inicioEm', '2026-10-26T14:00:00.1Z');
    expect(canonicalizeCheckout(buyer, key, a)).toBe(canonicalizeCheckout(buyer, key, b));
    expect(date.toISOString()).toBe('2026-10-26T14:00:00.100Z');
  });
  it.each(['Fuso/Inexistente', '+01:00', ' Europe/Lisbon ', '', null])(
    'rejeita fuso inválido %#',
    (value) => {
      rejected(
        () =>
          validateCheckoutInput(
            buyer,
            key,
            replace('condicoesPorProdutor.0.periodo.fusoHorario', value),
          ),
        'SELECAO_COMERCIAL_INVALIDA',
      );
    },
  );
  it('não impõe um fuso único aos produtores nem converte zonas da seleção', () => {
    const input = replace('condicoesPorProdutor.0.periodo.fusoHorario', 'Asia/Tokyo', multiple());
    const zones = validateCheckoutInput(buyer, key, input).pedido.condicoesPorProdutor.map(
      (c) => c.periodo.fusoHorario,
    );
    expect(zones).toContain('Asia/Tokyo');
    expect(zones).toContain('Europe/Lisbon');
  });
  it('rejeita intervalo vazio ou invertido', () => {
    for (const end of ['2026-10-26T14:00:00Z', '2026-10-26T13:00:00Z'])
      rejected(
        () =>
          validateCheckoutInput(buyer, key, replace('condicoesPorProdutor.0.periodo.fimEm', end)),
        'SELECAO_COMERCIAL_INVALIDA',
      );
  });
  it('distingue as duas ocorrências UTC da hora repetida sem escolher uma delas', () => {
    const first = {
      ...request(),
      condicoesPorProdutor: [
        {
          ...selection(),
          periodo: {
            inicioEm: '2026-10-25T00:30:00Z',
            fimEm: '2026-10-25T00:45:00Z',
            fusoHorario: 'Europe/Lisbon',
          },
        },
      ],
    };
    const second = {
      ...request(),
      condicoesPorProdutor: [
        {
          ...selection(),
          periodo: {
            inicioEm: '2026-10-25T01:30:00Z',
            fimEm: '2026-10-25T01:45:00Z',
            fusoHorario: 'Europe/Lisbon',
          },
        },
      ],
    };
    expect(fingerprintCheckout(buyer, key, first)).not.toBe(
      fingerprintCheckout(buyer, key, second),
    );
    rejected(
      () =>
        validateCheckoutInput(
          buyer,
          key,
          replace('condicoesPorProdutor.0.periodo.inicioEm', '2026-03-29T01:30:00'),
        ),
      'PEDIDO_INVALIDO',
    );
  });
});

describe('canonicalização versionada, fingerprint e ausência de mutação', () => {
  it('preserva um vetor fixo do formato v1 e do seu SHA-256', () => {
    const canonical = canonicalizeCheckout(buyer, key, request());
    expect(canonical).toBe(
      '{"versao":"docampo.checkout.v1","compradorContaId":"dddddddddddddddddddddddd","linhas":[{"produtoId":"aaaaaaaaaaaaaaaaaaaaaaaa","produtorContaId":"bbbbbbbbbbbbbbbbbbbbbbbb","quantidade":1,"precoReferenciaCent":150,"revisaoProdutoObservada":0,"unidadeVenda":{"modalidade":"unidade","unidadeBase":"un","quantidadeReferencia":1,"quantidadeMinima":1,"incrementoCompra":1}}],"condicoesPorProdutor":[{"produtorContaId":"bbbbbbbbbbbbbbbbbbbbbbbb","modalidade":"levantamento","periodo":{"inicioEm":"2026-10-26T14:00:00.000Z","fimEm":"2026-10-26T15:00:00.000Z","fusoHorario":"Europe/Lisbon"},"metodoPagamento":"dinheiro","taxaEntregaAceiteCent":0,"revisaoProdutorObservada":0}]}',
    );
    expect(fingerprintCheckout(buyer, key, request())).toBe(
      'e93b7f38b0aaebc5af4ec93839902729d7a224036aa35f7dd7ef457fae76f942',
    );
  });
  it('preserva volume e embalagem, distinguindo conteúdo físico de quantidade comercial', () => {
    const packaged = {
      ...line(),
      ofertaAceite: {
        ...line().ofertaAceite,
        unidadeVenda: {
          modalidade: 'embalagem',
          unidadeBase: 'un',
          quantidadeReferencia: 1,
          quantidadeMinima: 1,
          incrementoCompra: 1,
          rotulo: 'Caixa',
          conteudoPorUnidade: { quantidade: 500, unidade: 'g' },
        },
      },
    };
    const input = { ...request(), linhas: [packaged] };
    expect(validateCheckoutInput(buyer, key, input).pedido.linhas[0]?.quantidade).toBe(1);
    expect(canonicalizeCheckout(buyer, key, reverseProperties(input))).toBe(
      canonicalizeCheckout(buyer, key, input),
    );
    expect(
      fingerprintCheckout(
        buyer,
        key,
        replace('linhas.0.ofertaAceite.unidadeVenda.conteudoPorUnidade.quantidade', 501, input),
      ),
    ).not.toBe(fingerprintCheckout(buyer, key, input));
    rejected(
      () =>
        validateCheckoutInput(
          buyer,
          key,
          replace(
            'linhas.0.ofertaAceite.unidadeVenda.conteudoPorUnidade.extra',
            'não autorizado',
            input,
          ),
        ),
      'PEDIDO_INVALIDO',
    );
    const volume = {
      ...line(),
      quantidade: 500,
      ofertaAceite: {
        ...line().ofertaAceite,
        unidadeVenda: {
          modalidade: 'volume',
          unidadeBase: 'ml',
          quantidadeReferencia: 1000,
          quantidadeMinima: 250,
          incrementoCompra: 50,
        },
      },
    };
    expect(
      validateCheckoutInput(buyer, key, { ...request(), linhas: [volume] }).pedido.linhas[0]
        ?.ofertaAceite.unidadeVenda.modalidade,
    ).toBe('volume');
  });
  it('é estável entre execuções, ordens de propriedades, linhas e produtores', () => {
    const input = multiple();
    const reordered = {
      linhas: [...input.linhas].reverse(),
      condicoesPorProdutor: [...input.condicoesPorProdutor].reverse(),
    };
    const expected = canonicalizeCheckout(buyer, key, input);
    expect(canonicalizeCheckout(buyer, key, reordered)).toBe(expected);
    expect(canonicalizeCheckout(reverseProperties(buyer), key, reverseProperties(reordered))).toBe(
      expected,
    );
    for (let i = 0; i < 4; i++) expect(canonicalizeCheckout(buyer, key, input)).toBe(expected);
    expect(fingerprintCheckout(buyer, key, reordered)).toBe(
      createHash('sha256').update(expected, 'utf8').digest('hex'),
    );
    expect(fingerprintCheckout(buyer, key, input)).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(expected).versao).toBe(checkoutCanonicalVersion);
    expect(checkoutCanonicalVersion).toBe('docampo.checkout.v1');
  });
  it.each([
    ['linhas.0.quantidade', 2],
    ['linhas.0.produtoId', otherProduct],
    ['linhas.0.ofertaAceite.precoReferenciaCent', 151],
    ['linhas.0.ofertaAceite.revisaoProdutoObservada', 1],
    ['condicoesPorProdutor.0.revisaoProdutorObservada', 1],
    ['condicoesPorProdutor.0.metodoPagamento', 'mb_way'],
    ['condicoesPorProdutor.0.periodo.inicioEm', '2026-10-26T14:15:00Z'],
    ['condicoesPorProdutor.0.periodo.fusoHorario', 'UTC'],
  ])('altera o fingerprint quando muda %s', (field, value) => {
    expect(fingerprintCheckout(buyer, key, replace(field, value))).not.toBe(
      fingerprintCheckout(buyer, key, request()),
    );
  });
  it('distingue comprador, modalidade, taxa, concelho e dados de entrega sem publicar textos privados', () => {
    const input = { ...request(), condicoesPorProdutor: [delivery()] };
    const baseline = fingerprintCheckout(buyer, key, input);
    expect(fingerprintCheckout({ compradorContaId: otherProducer }, key, input)).not.toBe(baseline);
    expect(fingerprintCheckout(buyer, key, request())).not.toBe(baseline);
    for (const [field, value] of [
      ['taxaEntregaAceiteCent', 251],
      ['concelhoId', 'concelho-ficticio-002'],
      ['morada', 'Outra morada privada'],
      ['contacto', 'Outro contacto privado'],
    ] as const)
      expect(
        fingerprintCheckout(buyer, key, replace('condicoesPorProdutor.0.' + field, value, input)),
      ).not.toBe(baseline);
    const canonical = canonicalizeCheckout(buyer, key, input);
    expect(canonical).not.toContain(delivery().morada);
    expect(canonical).not.toContain(delivery().contacto);
    expect(canonical).not.toContain(key);
    expect(JSON.parse(canonical).condicoesPorProdutor[0].dadosEntregaHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
  it('normaliza NFC/trim antes do digest privado e conserva identificadores opacos', () => {
    const input = { ...request(), condicoesPorProdutor: [delivery()] };
    const changed = replace(
      'condicoesPorProdutor.0.morada',
      '  ' + delivery().morada.normalize('NFD') + '  ',
      input,
    );
    expect(fingerprintCheckout(buyer, key, changed)).toBe(fingerprintCheckout(buyer, key, input));
    const uppercaseConcelho = replace(
      'condicoesPorProdutor.0.concelhoId',
      'CONCELHO-ficticio-001',
      input,
    );
    expect(fingerprintCheckout(buyer, key, uppercaseConcelho)).not.toBe(
      fingerprintCheckout(buyer, key, input),
    );
  });
  it('não depende da hora atual nem do locale de ordenação', () => {
    const expected = fingerprintCheckout(buyer, key, multiple());
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('clock unavailable');
    });
    vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
      throw new Error('locale unavailable');
    });
    expect(fingerprintCheckout(buyer, key, multiple())).toBe(expected);
  });
  it('aceita argumentos congelados, não os altera e devolve cópias profundamente congeladas', () => {
    const input = freeze(multiple());
    const context = freeze({ ...buyer });
    const before = JSON.stringify(input);
    const result = validateCheckoutInput(context, key, input);
    fingerprintCheckout(context, key, input);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.pedido.linhas[0]).not.toBe(input.linhas[1]);
    expect(Object.isFrozen(result.pedido.linhas[0]?.ofertaAceite.unidadeVenda)).toBe(true);
    expect(Object.isFrozen(result.pedido.condicoesPorProdutor[0]?.periodo)).toBe(true);
  });
  it('não altera argumentos quando a validação falha', () => {
    const input = freeze({ ...request(), linhas: [line(), line(product, producer, -1)] });
    const before = JSON.stringify(input);
    rejected(() => validateCheckoutInput(buyer, key, input));
    expect(JSON.stringify(input)).toBe(before);
  });
  it('mantém tipos comerciais existentes e resultados futuros separados do pedido', () => {
    expectTypeOf<CheckoutAcceptedOffer['unidadeVenda']>().toEqualTypeOf<OrderSaleUnit>();
    expectTypeOf<CheckoutModality>().toEqualTypeOf<OrderReceptionModality>();
    expectTypeOf<CheckoutReceipt['moeda']>().toEqualTypeOf<'EUR'>();
    expectTypeOf<
      CheckoutReceipt['encomendas'][number]['estadoInicial']
    >().toEqualTypeOf<'pendente'>();
    expectTypeOf<Extract<CheckoutResult, { tipo: 'sucesso' }>['origem']>().toEqualTypeOf<
      'nova' | 'replay'
    >();
  });
});

describe('limites técnicos, objetos estritos e privacidade dos erros', () => {
  it('mede bytes UTF-8 de dados privados antes de os substituir pelo digest canónico', () => {
    const input = {
      ...request(),
      condicoesPorProdutor: [{ ...delivery(), morada: '😀'.repeat(20) }],
    };
    const normalized = validateCheckoutInput(buyer, key, input);
    const serialized = JSON.stringify(normalized);
    const bytes = Buffer.byteLength(serialized, 'utf8');
    expect(bytes).toBeGreaterThan(serialized.length);
    expect(() => validateCheckoutInput(buyer, key, input, { maxPedidoBytes: bytes })).not.toThrow();
    rejected(
      () => validateCheckoutInput(buyer, key, input, { maxPedidoBytes: bytes - 1 }),
      'LIMITE_TECNICO_EXCEDIDO',
    );
  });
  it('o orçamento de produtos é configurável e não se transforma num limite do modelo', () => {
    const lines = Array.from({ length: 101 }, (_, i) =>
      line((i + 1).toString(16).padStart(24, '0')),
    );
    const input = { ...request(), linhas: lines };
    rejected(() => validateCheckoutInput(buyer, key, input), 'LIMITE_TECNICO_EXCEDIDO');
    expect(
      validateCheckoutInput(buyer, key, input, { maxProdutos: 101 }).pedido.linhas,
    ).toHaveLength(101);
  });
  it('rejeita excesso de fragmentos antes de os agregar', () => {
    rejected(
      () =>
        validateCheckoutInput(
          buyer,
          key,
          { ...request(), linhas: [line(), line()] },
          { maxLinhas: 1 },
        ),
      'LIMITE_TECNICO_EXCEDIDO',
    );
  });
  it('conta produtos distintos depois da normalização e permite configurar o orçamento sem mudar products', () => {
    rejected(
      () =>
        validateCheckoutInput(
          buyer,
          key,
          { ...request(), linhas: [line(), line(otherProduct)] },
          { maxProdutos: 1 },
        ),
      'LIMITE_TECNICO_EXCEDIDO',
    );
    expect(
      validateCheckoutInput(
        buyer,
        key,
        { ...request(), linhas: [line(), line()] },
        { maxProdutos: 1 },
      ).pedido.linhas,
    ).toHaveLength(1);
    rejected(
      () => validateCheckoutInput(buyer, key, multiple(), { maxProdutores: 1 }),
      'LIMITE_TECNICO_EXCEDIDO',
    );
  });
  it.each([0, -1, NaN, Infinity, 1.2, Number.MAX_SAFE_INTEGER + 1, undefined])(
    'rejeita limites internos inválidos %#',
    (value) => {
      rejected(
        () =>
          validateCheckoutInput(buyer, key, request(), {
            maxLinhas: value,
          } as Partial<CheckoutTechnicalLimits>),
        'PEDIDO_INVALIDO',
      );
    },
  );
  it('limita texto e dimensões UTF-8 do pedido e da representação canónica', () => {
    const input = { ...request(), condicoesPorProdutor: [delivery()] };
    rejected(
      () => validateCheckoutInput(buyer, key, input, { maxTexto: 2 }),
      'LIMITE_TECNICO_EXCEDIDO',
    );
    rejected(
      () => validateCheckoutInput(buyer, key, input, { maxPedidoBytes: 20 }),
      'LIMITE_TECNICO_EXCEDIDO',
    );
    const canonical = canonicalizeCheckout(buyer, key, input);
    const size = Buffer.byteLength(canonical, 'utf8');
    expect(canonicalizeCheckout(buyer, key, input, { maxCanonicoBytes: size })).toBe(canonical);
    rejected(
      () => canonicalizeCheckout(buyer, key, input, { maxCanonicoBytes: size - 1 }),
      'LIMITE_TECNICO_EXCEDIDO',
    );
    expect(checkoutTechnicalLimits.maxPedidoBytes).toBe(100 * 1024);
    expect(Object.isFrozen(checkoutTechnicalLimits)).toBe(true);
  });
  it.each([
    ['linhas.0.stockDisponivel', 10],
    ['linhas.0.ofertaAceite.tokenSecreto', 'segredo'],
    ['linhas.0.ofertaAceite.unidadeVenda.extra', 'segredo'],
    ['condicoesPorProdutor.0.pagamentoPrivado', { iban: 'IBAN-privado' }],
    ['condicoesPorProdutor.0.periodo.extra', 'segredo'],
  ])('rejeita campos inesperados em %s', (field, value) => {
    const failure = rejected(
      () => validateCheckoutInput(buyer, key, replace(field, value)),
      'PEDIDO_INVALIDO',
    );
    expect(JSON.stringify(failure)).not.toContain('segredo');
    expect(failure.message).not.toContain('IBAN-privado');
  });
  it('não executa acessores nem toJSON e rejeita arrays esparsos, ciclos e símbolos', () => {
    let invoked = 0;
    const accessor = { ...request() };
    Object.defineProperty(accessor, 'linhas', {
      enumerable: true,
      get() {
        invoked++;
        return [line()];
      },
    });
    rejected(() => validateCheckoutInput(buyer, key, accessor), 'PEDIDO_INVALIDO');
    const sparse = new Array(1);
    rejected(
      () => validateCheckoutInput(buyer, key, { ...request(), linhas: sparse }),
      'PEDIDO_INVALIDO',
    );
    const cyclic: Record<string, unknown> = { ...request() };
    cyclic.linhas = cyclic;
    rejected(() => validateCheckoutInput(buyer, key, cyclic), 'PEDIDO_INVALIDO');
    rejected(
      () => validateCheckoutInput(buyer, key, { ...request(), [Symbol('privado')]: 'segredo' }),
      'PEDIDO_INVALIDO',
    );
    rejected(
      () =>
        validateCheckoutInput(buyer, key, {
          ...request(),
          toJSON() {
            invoked++;
            return {};
          },
        }),
      'PEDIDO_INVALIDO',
    );
    expect(invoked).toBe(0);
  });
  it('não inclui valores recebidos, chaves privadas ou causas internas nos erros de validação', () => {
    const secret = 'morada-secreta-invalida';
    const failure = rejected(() =>
      validateCheckoutInput(buyer, key, { ...request(), [secret]: secret }),
    );
    expect(failure.message + JSON.stringify(failure)).not.toContain(secret);
    expect(failure).not.toHaveProperty('cause');
  });
  it('não converte falhas internas inesperadas em erros de validação', () => {
    const failure = new Error('falha interna controlada');
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function () {
      throw failure;
    });
    expect(() => validateCheckoutInput(buyer, key, request())).toThrow(failure);
  });
});
