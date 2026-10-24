import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  aggregateOrderLines,
  calculateOrderAmounts,
  calculateOrderDeliveryFee,
  calculateOrderLineSubtotal,
  calculateOrderProducts,
  calculateOrderProductsSubtotal,
  calculateOrderTotal,
  OrderValidationError,
  validateOrderLineQuantity,
  validateOrderMoney,
  validateOrderPrice,
  validateOrderQuantity,
  validateOrderSaleUnit,
} from '../../src/modules/orders/order.calculations.js';
import {
  maximumOrderMoneyCents,
  minimumOrderLineSubtotalCents,
  orderCancellationRequestStates,
  orderComplaintStates,
  orderCompletionModes,
  orderCurrency,
  orderPaymentMethods,
  orderPaymentStates,
  orderPeriodProposalStates,
  orderReceptionDurationMs,
  orderReceptionModalities,
  orderStates,
} from '../../src/modules/orders/order.constants.js';
import type {
  OrderActor,
  OrderAmounts,
  OrderAmountsInput,
  OrderLineCalculationInput,
  OrderLineInput,
  OrderRecord,
  OrderSaleUnit,
  OrderState,
  OrderValidationCode,
} from '../../src/modules/orders/order.types.js';
import {
  maximumProductPriceCents,
  minimumProductPriceCents,
  saleDefinitions,
} from '../../src/modules/products/product.constants.js';
import type { SaleUnitRecord } from '../../src/modules/products/product.types.js';

function unit(
  overrides: Partial<Extract<OrderSaleUnit, { modalidade: 'peso' }>> = {},
): OrderSaleUnit {
  return {
    modalidade: 'peso',
    unidadeBase: 'g',
    quantidadeReferencia: 1000,
    quantidadeMinima: 1,
    incrementoCompra: 1,
    ...overrides,
  };
}

function line(overrides: Partial<OrderLineInput> = {}): OrderLineInput {
  return {
    produtoId: 'produto-a',
    quantidade: 500,
    precoReferenciaCent: 150,
    unidadeVenda: unit(),
    versaoUnidade: 0,
    ...overrides,
  };
}

function validation(action: () => unknown, codigo: OrderValidationCode) {
  expect(action).toThrow(OrderValidationError);
  try {
    action();
    expect.fail('Era esperado um erro de validação.');
  } catch (error) {
    expect(error).toBeInstanceOf(OrderValidationError);
    if (!(error instanceof OrderValidationError)) throw error;
    expect(error.codigo).toBe(codigo);
    expect(error.campos).toEqual([{ campo: expect.any(String), mensagem: error.message }]);
    expect(error).not.toHaveProperty('status');
  }
}

const modalities: readonly OrderSaleUnit[] = [
  unit(),
  {
    modalidade: 'volume',
    unidadeBase: 'ml',
    quantidadeReferencia: 1000,
    quantidadeMinima: 1,
    incrementoCompra: 1,
  },
  {
    modalidade: 'unidade',
    unidadeBase: 'un',
    quantidadeReferencia: 1,
    quantidadeMinima: 1,
    incrementoCompra: 1,
  },
  {
    modalidade: 'embalagem',
    unidadeBase: 'un',
    quantidadeReferencia: 1,
    quantidadeMinima: 1,
    incrementoCompra: 1,
    conteudoPorUnidade: { quantidade: 500, unidade: 'g' },
  },
];

describe('tipos conceptuais e constantes orders', () => {
  it('mantém exclusivamente os estados e identificadores aprovados', () => {
    expect(orderStates).toEqual([
      'pendente',
      'confirmada',
      'em_preparacao',
      'pronta',
      'concluida',
      'cancelada',
    ]);
    expect(orderPaymentStates).toEqual(['por_pagar', 'pagamento_comunicado', 'pago']);
    expect(orderCancellationRequestStates).toEqual(['pendente', 'aceite', 'rejeitado']);
    expect(orderComplaintStates).toEqual(['aberta', 'em_analise', 'escalada', 'resolvida']);
    expect(orderReceptionModalities).toEqual(['levantamento', 'entrega']);
    expect(orderPaymentMethods).toEqual(['dinheiro', 'mb_way', 'transferencia_bancaria']);
    expect(orderPeriodProposalStates).toEqual(['pendente', 'aceite', 'rejeitada']);
    expect(orderCompletionModes).toEqual(['comprador', 'automatica', 'intervencao_administrativa']);
    expect(orderReceptionDurationMs).toBe(168 * 60 * 60 * 1000);
    expect(orderCurrency).toBe('EUR');
    expect(minimumOrderLineSubtotalCents).toBe(1);
    expect(maximumOrderMoneyCents).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('separa domínio, entradas e resultados sem exportar metadados privados nos cálculos', () => {
    expectTypeOf<OrderSaleUnit>().toExtend<SaleUnitRecord>();
    expectTypeOf<
      Extract<OrderSaleUnit, { modalidade: 'peso' }>['unidadeBase']
    >().toEqualTypeOf<'g'>();
    expectTypeOf<
      Extract<OrderSaleUnit, { modalidade: 'volume' }>['quantidadeReferencia']
    >().toEqualTypeOf<1000>();
    expectTypeOf<OrderState>().toEqualTypeOf<
      'pendente' | 'confirmada' | 'em_preparacao' | 'pronta' | 'concluida' | 'cancelada'
    >();
    expectTypeOf<OrderRecord['reclamacoes']>().toExtend<readonly { readonly id: string }[]>();
    expectTypeOf<OrderRecord['rececao']['duracaoMs']>().toEqualTypeOf<604800000>();
    expectTypeOf<Extract<OrderActor, { tipo: 'sistema' }>>().not.toHaveProperty('userId');
    expectTypeOf<OrderAmounts>().not.toHaveProperty('idempotencia');
    expectTypeOf<OrderAmountsInput>().not.toHaveProperty('comprador');
    expectTypeOf<OrderLineCalculationInput>().not.toHaveProperty('passwordHash');
  });
});

describe('validações de quantidade, preço, dinheiro e unidade', () => {
  it.each([
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '1',
    1n,
    null,
    undefined,
    true,
  ])('recusa quantidade inválida %s sem conversão implícita', (value) => {
    validation(() => validateOrderQuantity(value), 'QUANTIDADE_INVALIDA');
  });

  it.each([1, 1000, Number.MAX_SAFE_INTEGER])('aceita inteiro positivo seguro %s', (value) => {
    expect(() => validateOrderQuantity(value)).not.toThrow();
  });

  it.each([0, -1, 1.5, 1_000_001, NaN, Infinity, '150', null, undefined, true, 150n])(
    'recusa preço inválido %s',
    (value) => {
      validation(() => validateOrderPrice(value), 'PRECO_INVALIDO');
    },
  );

  it.each([1, 1_000_000])('mantém o preço de referência aprovado %s', (value) => {
    expect(() => validateOrderPrice(value)).not.toThrow();
  });

  it.each([
    -1,
    0.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '0',
    null,
    undefined,
    1n,
  ])('recusa dinheiro inválido %s', (value) => {
    validation(() => validateOrderMoney(value), 'VALOR_MONETARIO_INVALIDO');
  });

  it.each([0, 1, Number.MAX_SAFE_INTEGER])('aceita dinheiro seguro %s', (value) => {
    expect(() => validateOrderMoney(value)).not.toThrow();
  });

  it.each(modalities)('aceita a modalidade completa $modalidade', (unidadeVenda) => {
    expect(() => validateOrderSaleUnit(unidadeVenda)).not.toThrow();
  });

  it.each([
    null,
    undefined,
    [],
    {},
    { modalidade: 'kg' },
    unit({ unidadeBase: 'kg' } as unknown as Parameters<typeof unit>[0]),
    { ...unit(), quantidadeReferencia: 100 },
    { ...unit(), quantidadeReferencia: '1000' },
    { ...unit(), quantidadeMinima: 0 },
    { ...unit(), quantidadeMinima: 0.5 },
    { ...unit(), incrementoCompra: 0 },
    { ...unit(), incrementoCompra: Infinity },
    { ...unit(), rotulo: '' },
    { ...unit(), rotulo: 12 },
    { ...unit(), conteudoPorUnidade: { quantidade: 500, unidade: 'g' } },
    { ...modalities[1], conteudoPorUnidade: { quantidade: 500, unidade: 'ml' } },
    { ...modalities[3], conteudoPorUnidade: null },
    { ...modalities[3], conteudoPorUnidade: { quantidade: 0, unidade: 'g' } },
    { ...modalities[3], conteudoPorUnidade: { quantidade: 1.5, unidade: 'g' } },
    { ...modalities[3], conteudoPorUnidade: { quantidade: 500, unidade: 'kg' } },
    { ...modalities[3], conteudoPorUnidade: { quantidade: 500 } },
  ])('recusa unidade incompleta/incompatível %#', (value) => {
    validation(() => validateOrderSaleUnit(value), 'UNIDADE_VENDA_INVALIDA');
  });

  it('não transforma conteúdo físico em quantidade comercial de embalagens', () => {
    const embalagem = modalities[3]!;
    expect(
      calculateOrderLineSubtotal(
        line({ quantidade: 2, precoReferenciaCent: 350, unidadeVenda: embalagem }),
      ),
    ).toBe(700);
  });

  it('valida mínimo e grelha a partir do mínimo, incluindo mínimo não múltiplo do passo', () => {
    const unidadeVenda = unit({ quantidadeMinima: 3, incrementoCompra: 2 });
    expect(() => validateOrderLineQuantity(3, unidadeVenda)).not.toThrow();
    expect(() => validateOrderLineQuantity(5, unidadeVenda)).not.toThrow();
    validation(() => validateOrderLineQuantity(2, unidadeVenda), 'QUANTIDADE_MINIMA');
    validation(() => validateOrderLineQuantity(4, unidadeVenda), 'INCREMENTO_INVALIDO');
  });

  it.each(modalities)(
    'aplica teto de products para $modalidade, inclusive no limite',
    (unidadeVenda) => {
      const maximum = saleDefinitions[unidadeVenda.modalidade].stockMaximo;
      expect(() => validateOrderLineQuantity(maximum, unidadeVenda, maximum)).not.toThrow();
      validation(() => validateOrderLineQuantity(maximum + 1, unidadeVenda), 'QUANTIDADE_MAXIMA');
    },
  );

  it.each([-1, 1.5, NaN, Infinity, '500', null, 10_000_001])(
    'recusa stock explícito inválido %s',
    (stock) => {
      validation(() => validateOrderLineQuantity(500, unit(), stock), 'STOCK_INVALIDO');
    },
  );

  it('stock é opcional mas, quando fornecido, não pode ser insuficiente ou zero', () => {
    expect(() => validateOrderLineQuantity(500, unit())).not.toThrow();
    expect(() => validateOrderLineQuantity(500, unit(), 500)).not.toThrow();
    validation(() => validateOrderLineQuantity(500, unit(), 499), 'STOCK_INSUFICIENTE');
    validation(() => validateOrderLineQuantity(1, unit(), 0), 'STOCK_INSUFICIENTE');
  });

  it('não inventa um teto novo para o mínimo/incremento de Product', () => {
    expect(() =>
      validateOrderSaleUnit(
        unit({
          quantidadeMinima: Number.MAX_SAFE_INTEGER,
          incrementoCompra: Number.MAX_SAFE_INTEGER,
        }),
      ),
    ).not.toThrow();
    validation(
      () => validateOrderLineQuantity(1, unit({ quantidadeMinima: Number.MAX_SAFE_INTEGER })),
      'QUANTIDADE_MINIMA',
    );
  });
});

describe('cálculos monetários exatos', () => {
  it.each(modalities)(
    'calcula o teto de preço/quantidade de $modalidade sem alterar products',
    (unidadeVenda) => {
      const quantidade = saleDefinitions[unidadeVenda.modalidade].stockMaximo;
      expect(
        calculateOrderLineSubtotal(
          line({ quantidade, precoReferenciaCent: 1_000_000, unidadeVenda }),
        ),
      ).toBe(unidadeVenda.quantidadeReferencia === 1000 ? 10_000_000_000 : 100_000_000_000);
    },
  );

  it.each([
    { quantidade: 1, precoReferenciaCent: 150, expected: 0 },
    { quantidade: 4, precoReferenciaCent: 150, expected: 1 },
    { quantidade: 1, precoReferenciaCent: 500, expected: 1 },
    { quantidade: 1, precoReferenciaCent: 499, expected: 0 },
    { quantidade: 1, precoReferenciaCent: 501, expected: 1 },
    { quantidade: 250, precoReferenciaCent: 150, expected: 38 },
    { quantidade: 500, precoReferenciaCent: 150, expected: 75 },
    { quantidade: 10_000_000, precoReferenciaCent: 1_000_000, expected: 10_000_000_000 },
  ])(
    'half-up de $quantidade g a $precoReferenciaCent cêntimos/kg',
    ({ quantidade, precoReferenciaCent, expected }) => {
      const input = line({ quantidade, precoReferenciaCent });
      if (expected === 0)
        validation(() => calculateOrderLineSubtotal(input), 'SUBTOTAL_INFERIOR_MINIMO');
      else expect(calculateOrderLineSubtotal(input)).toBe(expected);
    },
  );

  it('os 4 g só são aceites se respeitarem mínimo e incremento', () => {
    validation(
      () =>
        calculateOrderLineSubtotal(
          line({ quantidade: 4, unidadeVenda: unit({ quantidadeMinima: 5 }) }),
        ),
      'QUANTIDADE_MINIMA',
    );
    validation(
      () =>
        calculateOrderLineSubtotal(
          line({ quantidade: 4, unidadeVenda: unit({ quantidadeMinima: 1, incrementoCompra: 2 }) }),
        ),
      'INCREMENTO_INVALIDO',
    );
  });

  it.each(modalities)('calcula com referência fixa de $modalidade', (unidadeVenda) => {
    const quantidade = unidadeVenda.quantidadeReferencia === 1000 ? 250 : 2;
    expect(calculateOrderLineSubtotal(line({ unidadeVenda, quantidade }))).toBe(
      quantidade === 250 ? 38 : 300,
    );
  });

  it('soma linhas de produtos distintos depois do arredondamento, sem arredondar o grupo', () => {
    const result = calculateOrderProducts([
      line({ quantidade: 250 }),
      line({ produtoId: 'produto-b', quantidade: 250 }),
    ]);
    expect(result.linhas.map((item) => item.subtotalCent)).toEqual([38, 38]);
    expect(result.subtotalProdutosCent).toBe(76);
  });

  it('agrega o mesmo produto antes do arredondamento: 250 + 250 g dão 75, não 76', () => {
    const result = calculateOrderProducts([line({ quantidade: 250 }), line({ quantidade: 250 })]);
    expect(result.linhas).toHaveLength(1);
    expect(result.linhas[0]).toMatchObject({ quantidade: 500, subtotalCent: 75 });
    expect(result.subtotalProdutosCent).toBe(75);
  });

  it('duplicados individualmente arredondados a zero podem formar uma linha válida', () => {
    expect(
      calculateOrderProducts([line({ quantidade: 1 }), line({ quantidade: 3 })])
        .subtotalProdutosCent,
    ).toBe(1);
  });

  it.each([null, undefined, {}, []])('recusa ausência de linha comercial %#', (value) => {
    validation(
      () => calculateOrderLineSubtotal(value as OrderLineCalculationInput),
      Array.isArray(value) || value == null ? 'LINHAS_INVALIDAS' : 'PRECO_INVALIDO',
    );
  });

  it('não impõe a totals/taxas o teto de preço de referência de Product', () => {
    expect(calculateOrderProductsSubtotal([1_000_000, 1_000_000])).toBe(2_000_000);
    expect(calculateOrderDeliveryFee('entrega', 2_000_000)).toBe(2_000_000);
  });

  it('aceita o maior total seguro e somas próximas do limite sem perder um cêntimo', () => {
    expect(calculateOrderProductsSubtotal([Number.MAX_SAFE_INTEGER - 1, 1])).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(calculateOrderTotal(Number.MAX_SAFE_INTEGER - 1, 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(calculateOrderTotal(Number.MAX_SAFE_INTEGER, 0)).toBe(Number.MAX_SAFE_INTEGER);
    expect(calculateOrderDeliveryFee('entrega', Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('rejeita overflow das somas em vez de arredondar ou truncar', () => {
    validation(
      () => calculateOrderProductsSubtotal([Number.MAX_SAFE_INTEGER, 1]),
      'LIMITE_NUMERICO_EXCEDIDO',
    );
    validation(() => calculateOrderTotal(Number.MAX_SAFE_INTEGER, 1), 'LIMITE_NUMERICO_EXCEDIDO');
  });

  it('valida o limite seguro também no cálculo completo com taxa de entrega', () => {
    const input: OrderAmountsInput = {
      linhas: [line()],
      modalidadeRececao: 'entrega',
      taxaEntregaCent: Number.MAX_SAFE_INTEGER - 75,
    };
    expect(calculateOrderAmounts(input).totalCent).toBe(Number.MAX_SAFE_INTEGER);
    validation(
      () => calculateOrderAmounts({ ...input, taxaEntregaCent: input.taxaEntregaCent + 1 }),
      'LIMITE_NUMERICO_EXCEDIDO',
    );
  });

  it.each([
    [],
    null,
    undefined,
    [0],
    [-1],
    [0.5],
    [NaN],
    [Infinity],
    [Number.MAX_SAFE_INTEGER + 1],
  ])('recusa subtotais inválidos %#', (values) => {
    const code =
      !Array.isArray(values) || values.length === 0
        ? 'LINHAS_INVALIDAS'
        : values[0] === 0
          ? 'SUBTOTAL_INFERIOR_MINIMO'
          : 'VALOR_MONETARIO_INVALIDO';
    validation(() => calculateOrderProductsSubtotal(values as readonly number[]), code);
  });

  it.each([-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'recusa taxa inválida %s mesmo no levantamento',
    (fee) => {
      for (const modalidade of orderReceptionModalities) {
        validation(() => calculateOrderDeliveryFee(modalidade, fee), 'VALOR_MONETARIO_INVALIDO');
        validation(() => calculateOrderTotal(100, fee), 'VALOR_MONETARIO_INVALIDO');
      }
    },
  );

  it('aplica entrega uma vez e levantamento gratuito, incluindo entrega gratuita', () => {
    const linhas = [line(), line({ produtoId: 'produto-b' })];
    expect(
      calculateOrderAmounts({ linhas, modalidadeRececao: 'entrega', taxaEntregaCent: 250 }),
    ).toMatchObject({
      subtotalProdutosCent: 150,
      taxaEntregaCent: 250,
      totalCent: 400,
      moeda: 'EUR',
    });
    expect(
      calculateOrderAmounts({ linhas, modalidadeRececao: 'levantamento', taxaEntregaCent: 250 }),
    ).toMatchObject({ taxaEntregaCent: 0, totalCent: 150 });
    expect(
      calculateOrderAmounts({ linhas, modalidadeRececao: 'entrega', taxaEntregaCent: 0 }).totalCent,
    ).toBe(150);
  });

  it('recusa modalidade de receção desconhecida e total de produtos zero', () => {
    validation(
      () => calculateOrderDeliveryFee('correio' as 'entrega', 100),
      'MODALIDADE_RECECAO_INVALIDA',
    );
    validation(() => calculateOrderTotal(0, 100), 'SUBTOTAL_INFERIOR_MINIMO');
    validation(() => calculateOrderTotal(-1, 100), 'VALOR_MONETARIO_INVALIDO');
    validation(
      () => calculateOrderAmounts(null as unknown as OrderAmountsInput),
      'LINHAS_INVALIDAS',
    );
  });

  it('identifica o campo inválido sem incluir valores recebidos nos erros', () => {
    const privateValue = 'valor-ficticio-privado';
    try {
      calculateOrderDeliveryFee('entrega', privateValue as unknown as number);
      expect.fail('Era esperado um erro.');
    } catch (error) {
      expect(error).toBeInstanceOf(OrderValidationError);
      if (!(error instanceof OrderValidationError)) throw error;
      expect(error.campos[0]?.campo).toBe('taxaEntregaCent');
      expect(JSON.stringify(error)).not.toContain(privateValue);
      expect(error.message).not.toContain(privateValue);
    }
  });

  it('não converte falhas internas inesperadas em erros de validação', () => {
    const failure = new Error('Falha interna fictícia.');
    const input = {
      ...line(),
      get quantidade(): number {
        throw failure;
      },
    };
    expect(() => calculateOrderLineSubtotal(input)).toThrow(failure);
    expect(failure).not.toBeInstanceOf(OrderValidationError);
  });
});

describe('agregação determinística e compatibilidade', () => {
  it('agrega exclusivamente por ID, ordena por ID e preserva a unidade correta', () => {
    const inputs = [
      line({ quantidade: 2000 }),
      line({ produtoId: 'produto-b', quantidade: 1000 }),
      line({ quantidade: 3000 }),
    ];
    const result = aggregateOrderLines(inputs);
    expect(result.map(({ produtoId, quantidade }) => ({ produtoId, quantidade }))).toEqual([
      { produtoId: 'produto-a', quantidade: 5000 },
      { produtoId: 'produto-b', quantidade: 1000 },
    ]);
    expect(aggregateOrderLines([...inputs].reverse())).toEqual(result);
    expect(result[0]?.unidadeVenda).toEqual(unit());
  });

  it('valida mínimo, incremento e stock depois de agregar, nunca em cada fragmento', () => {
    const unidadeVenda = unit({ quantidadeMinima: 500, incrementoCompra: 250 });
    const inputs = [
      line({ quantidade: 200, unidadeVenda, stockDisponivel: 750 }),
      line({ quantidade: 550, unidadeVenda, stockDisponivel: 750 }),
    ];
    expect(aggregateOrderLines(inputs)[0]?.quantidade).toBe(750);
    validation(
      () => aggregateOrderLines(inputs.map((item) => ({ ...item, stockDisponivel: 700 }))),
      'STOCK_INSUFICIENTE',
    );
    validation(
      () =>
        aggregateOrderLines([
          line({ quantidade: 100, unidadeVenda }),
          line({ quantidade: 200, unidadeVenda }),
        ]),
      'QUANTIDADE_MINIMA',
    );
    validation(
      () =>
        aggregateOrderLines([
          line({ quantidade: 300, unidadeVenda }),
          line({ quantidade: 300, unidadeVenda }),
        ]),
      'INCREMENTO_INVALIDO',
    );
  });

  it('verifica o teto da modalidade só após a soma dos fragmentos', () => {
    validation(
      () => aggregateOrderLines([line({ quantidade: 6_000_000 }), line({ quantidade: 5_000_000 })]),
      'QUANTIDADE_MAXIMA',
    );
    validation(
      () =>
        aggregateOrderLines([
          line({ quantidade: Number.MAX_SAFE_INTEGER }),
          line({ quantidade: 1 }),
        ]),
      'LIMITE_NUMERICO_EXCEDIDO',
    );
  });

  it.each([
    { precoReferenciaCent: 151 },
    { versaoUnidade: 1 },
    { stockDisponivel: 500 },
    { unidadeVenda: unit({ quantidadeMinima: 2 }) },
    { unidadeVenda: unit({ incrementoCompra: 2 }) },
    { unidadeVenda: unit({ rotulo: 'Outra apresentação' }) },
    { unidadeVenda: modalities[1]! },
  ])('recusa condições contraditórias para o mesmo ID %#', (overrides) => {
    validation(() => aggregateOrderLines([line(), line(overrides)]), 'LINHAS_INCOMPATIVEIS');
  });

  it('não depende da ordem das propriedades de uma unidade equivalente', () => {
    const unidadeVenda: OrderSaleUnit = {
      incrementoCompra: 1,
      quantidadeMinima: 1,
      quantidadeReferencia: 1000,
      unidadeBase: 'g',
      modalidade: 'peso',
    };
    expect(aggregateOrderLines([line(), line({ unidadeVenda })])[0]?.quantidade).toBe(1000);
  });

  it('recusa conteúdo comercial diferente mesmo com a mesma modalidade embalagem', () => {
    const embalagem = modalities[3]!;
    validation(
      () =>
        aggregateOrderLines([
          line({ quantidade: 1, unidadeVenda: embalagem }),
          line({
            quantidade: 1,
            unidadeVenda: {
              ...embalagem,
              conteudoPorUnidade: { quantidade: 750, unidade: 'g' },
            } as OrderSaleUnit,
          }),
        ]),
      'LINHAS_INCOMPATIVEIS',
    );
  });

  it.each(['', '   ', 123, null, undefined])('recusa ID inválido %s', (produtoId) => {
    validation(
      () => aggregateOrderLines([line({ produtoId: produtoId as string })]),
      'PRODUTO_INVALIDO',
    );
  });

  it.each([-1, 0.5, NaN, Infinity, '0', null, undefined])(
    'recusa versão inválida %s',
    (versaoUnidade) => {
      validation(
        () => aggregateOrderLines([line({ versaoUnidade: versaoUnidade as number })]),
        'VERSAO_INVALIDA',
      );
    },
  );

  it.each([[], null, undefined, [null], [undefined], [1], new Array(1)])(
    'recusa lista vazia/malformada %#',
    (inputs) => {
      validation(
        () => aggregateOrderLines(inputs as readonly OrderLineInput[]),
        'LINHAS_INVALIDAS',
      );
    },
  );

  it('não compensa fragmentos negativos, fracionários ou zero por soma', () => {
    for (const quantidade of [-1, 0, 0.5]) {
      validation(() => aggregateOrderLines([line(), line({ quantidade })]), 'QUANTIDADE_INVALIDA');
    }
  });

  it('não agrupa pelo nome nem trata IDs como propriedades de um objeto', () => {
    const named = [
      { ...line({ produtoId: '__proto__' }), nome: 'Mesmo nome' },
      { ...line({ produtoId: 'constructor' }), nome: 'Mesmo nome' },
    ];
    expect(aggregateOrderLines(named)).toHaveLength(2);
    expect(calculateOrderProducts(named).subtotalProdutosCent).toBe(150);
  });

  it('não altera arrays, linhas ou objetos aninhados, inclusive após erro', () => {
    const embalagem = modalities[3]!;
    Object.freeze(embalagem.conteudoPorUnidade);
    const inputs = Object.freeze([
      Object.freeze(line({ quantidade: 1, unidadeVenda: Object.freeze(embalagem) })),
      Object.freeze(line({ quantidade: 2, unidadeVenda: Object.freeze(embalagem) })),
    ]);
    const before = structuredClone(inputs);
    const result = aggregateOrderLines(inputs);
    expect(inputs).toEqual(before);
    expect(result[0]?.unidadeVenda).not.toBe(embalagem);
    expect(result[0]?.unidadeVenda.conteudoPorUnidade).not.toBe(embalagem.conteudoPorUnidade);
    validation(() => aggregateOrderLines([...inputs, line()]), 'LINHAS_INCOMPATIVEIS');
    expect(inputs).toEqual(before);
  });

  it('resultados são cópias e não propagam propriedades privadas desconhecidas', () => {
    const privateInput = {
      ...line(),
      passwordHash: 'campo-ficticio',
      idempotencia: { chave: 'privada' },
      unidadeVenda: { ...unit(), contacto: 'contacto-ficticio' },
    };
    const result = calculateOrderAmounts({
      linhas: [privateInput],
      modalidadeRececao: 'entrega',
      taxaEntregaCent: 0,
    });
    const serialized = JSON.stringify(result);
    for (const property of [
      'passwordHash',
      'idempotencia',
      'chave',
      'contacto',
      'stockDisponivel',
    ]) {
      expect(serialized).not.toContain(property);
    }
    expect(result.linhas[0]?.unidadeSnapshot).not.toBe(privateInput.unidadeVenda);
  });

  it('não aplica limites de cardinalidade ainda apresentados como propostas técnicas', () => {
    const inputs = Array.from({ length: 101 }, (_, index) =>
      line({ produtoId: `produto-${index}` }),
    );
    expect(aggregateOrderLines(inputs)).toHaveLength(101);
    expect(calculateOrderProducts(inputs).subtotalProdutosCent).toBe(7575);
  });

  it('reutiliza as referências e limites de products sem os modificar', () => {
    expect(minimumProductPriceCents).toBe(1);
    expect(maximumProductPriceCents).toBe(1_000_000);
    expect(saleDefinitions).toEqual({
      peso: { unidadeBase: 'g', quantidadeReferencia: 1000, stockMaximo: 10_000_000 },
      volume: { unidadeBase: 'ml', quantidadeReferencia: 1000, stockMaximo: 10_000_000 },
      unidade: { unidadeBase: 'un', quantidadeReferencia: 1, stockMaximo: 100_000 },
      embalagem: { unidadeBase: 'un', quantidadeReferencia: 1, stockMaximo: 100_000 },
    });
    const before = structuredClone(saleDefinitions);
    calculateOrderProducts([line()]);
    expect(saleDefinitions).toEqual(before);
  });
});
