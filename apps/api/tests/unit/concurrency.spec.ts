import { createConnection, mongo, Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ConcurrencyError,
  isMongoWriteConflict,
  operationalRevision,
  revisionCondition,
} from '../../src/modules/concurrency/concurrency-error.js';
import type { ConcurrencyErrorCode } from '../../src/modules/concurrency/concurrency-error.js';
import { requireOperationSession } from '../../src/modules/concurrency/operation-session.js';
import { validateProductStockCandidate } from '../../src/modules/products/product-stock.repository.js';
import {
  producerPeriodFits,
  validateProducerGuardCandidate,
} from '../../src/modules/producers/producer-eligibility.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import {
  productCandidate,
  producerCandidate,
  producerGuard,
  stockDecrease,
} from '../support/concurrency-fixtures.js';
import { producerInput } from '../support/identity-fixtures.js';
import { producerCommercialInput } from '../support/producer-commercial-fixtures.js';

function conflict(action: () => unknown, code: ConcurrencyErrorCode) {
  expect(action).toThrow(ConcurrencyError);
  try {
    action();
    expect.fail('Esperado conflito.');
  } catch (error) {
    if (!(error instanceof ConcurrencyError)) throw error;
    expect(error.codigo).toBe(code);
    expect(error).not.toHaveProperty('status');
  }
}
const connection = createConnection();
const Product = createProductModel(connection);
const Producer = createProducerModel(connection);
afterAll(() => connection.close());

describe('revisões e sessões explícitas', () => {
  it('trata ausência legada como zero e protege o incremento sem overflow', () => {
    expect(operationalRevision(undefined)).toBe(0);
    expect(revisionCondition(0)).toEqual({
      $or: [{ revisaoOperacional: 0 }, { revisaoOperacional: { $exists: false } }],
    });
    expect(revisionCondition(2)).toEqual({ revisaoOperacional: 2 });
    conflict(() => revisionCondition(Number.MAX_SAFE_INTEGER), 'VALIDACAO');
  });
  it.each([-1, 0.5, NaN, Infinity, null, '0'])('rejeita revisão inválida %s', (value) => {
    conflict(() => operationalRevision(value), 'VALIDACAO');
  });
  it('não aceita revisão esperada omitida nem sessão fictícia/inativa', () => {
    conflict(() => revisionCondition(undefined as unknown as number), 'VALIDACAO');
    expect(() => requireOperationSession(undefined, false)).not.toThrow();
    conflict(() => requireOperationSession(undefined, true), 'TRANSACAO_OBRIGATORIA');
    conflict(() => requireOperationSession({} as ClientSession, false), 'TRANSACAO_OBRIGATORIA');
  });
  it('identifica write conflict real sem o transformar nem ocultar labels', () => {
    const error = new mongo.MongoServerError({
      message: 'Conflito fictício',
      code: 112,
      errorLabels: ['TransientTransactionError'],
    });
    expect(isMongoWriteConflict(error)).toBe(true);
    expect(error.hasErrorLabel('TransientTransactionError')).toBe(true);
    expect(isMongoWriteConflict(new Error('Erro interno'))).toBe(false);
  });
  it('versão técnica não é exposta na serialização e preserva o __v existente', () => {
    const product = new Product(productCandidate());
    const producer = new Producer(producerInput());
    for (const document of [product, producer]) {
      expect(document.get('revisaoOperacional')).toBe(0);
      expect(document.toJSON()).not.toHaveProperty('revisaoOperacional');
      expect(document.toObject()).not.toHaveProperty('revisaoOperacional');
      expect(document.schema.get('versionKey')).toBe('__v');
    }
  });
  it('não permite atribuir uma revisão nova artificial ou reescrever a revisão carregada', async () => {
    const fresh = new Producer(producerInput({ revisaoOperacional: 1 }));
    await expect(fresh.validate()).rejects.toMatchObject({ codigo: 'VALIDACAO' });
    const loaded = Producer.hydrate(
      producerInput({ _id: new Types.ObjectId(), revisaoOperacional: 0 }),
    );
    loaded.set('revisaoOperacional', 1);
    await expect(loaded.validate()).rejects.toMatchObject({ codigo: 'CONFLITO_VERSAO' });
  });
});

describe('pré-condições puras do débito de stock', () => {
  it('reutiliza também a rejeição aprovada de subtotal arredondado a zero', () => {
    const unidadeAceite = {
      modalidade: 'peso',
      unidadeBase: 'g',
      quantidadeReferencia: 1000,
      quantidadeMinima: 1,
      incrementoCompra: 1,
    } as const;
    conflict(
      () =>
        validateProductStockCandidate(
          productCandidate(),
          stockDecrease({ quantidade: 1, precoAceiteCent: 1, unidadeAceite }),
        ),
      'VALIDACAO',
    );
  });
  it('aceita a última unidade e não altera o candidato nem a quantidade', () => {
    const product = productCandidate();
    const input = stockDecrease();
    expect(() => validateProductStockCandidate(product, input)).not.toThrow();
    expect(product.stockDisponivel).toBe(1);
  });
  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejeita quantidade %s',
    (quantidade) => {
      conflict(
        () => validateProductStockCandidate(productCandidate(), stockDecrease({ quantidade })),
        'VALIDACAO',
      );
    },
  );
  it('distingue stock insuficiente, indisponibilidade e versão antiga', () => {
    conflict(
      () =>
        validateProductStockCandidate(productCandidate({ stockDisponivel: 0 }), stockDecrease()),
      'STOCK_INSUFICIENTE',
    );
    for (const estadoPublicacao of ['rascunho', 'arquivado'] as const)
      conflict(
        () =>
          validateProductStockCandidate(productCandidate({ estadoPublicacao }), stockDecrease()),
        'PRODUTO_INDISPONIVEL',
      );
    conflict(() => validateProductStockCandidate(null, stockDecrease()), 'PRODUTO_INDISPONIVEL');
    conflict(
      () =>
        validateProductStockCandidate(
          productCandidate({ produtor: new Types.ObjectId() }),
          stockDecrease(),
        ),
      'PRODUTO_INDISPONIVEL',
    );
    conflict(
      () =>
        validateProductStockCandidate(productCandidate({ revisaoOperacional: 1 }), stockDecrease()),
      'CONFLITO_VERSAO',
    );
  });
  it('recusa oferta/unidade alteradas e mínimos/incrementos inválidos', () => {
    conflict(
      () => validateProductStockCandidate(productCandidate({ precoCent: 160 }), stockDecrease()),
      'OFERTA_ALTERADA',
    );
    conflict(
      () =>
        validateProductStockCandidate(
          productCandidate({
            unidadeVenda: { ...stockDecrease().unidadeAceite, rotulo: 'Outra unidade' },
          }),
          stockDecrease(),
        ),
      'OFERTA_ALTERADA',
    );
    conflict(
      () =>
        validateProductStockCandidate(
          productCandidate(),
          stockDecrease({
            unidadeAceite: { ...stockDecrease().unidadeAceite, quantidadeMinima: 2 },
          }),
        ),
      'VALIDACAO',
    );
  });
  it('aceita documentos legados, mas não aceita preço/stock inválidos', () => {
    expect(() =>
      validateProductStockCandidate(
        productCandidate({ revisaoOperacional: undefined }),
        stockDecrease(),
      ),
    ).not.toThrow();
    conflict(
      () =>
        validateProductStockCandidate(productCandidate(), stockDecrease({ precoAceiteCent: 0 })),
      'VALIDACAO',
    );
    conflict(
      () =>
        validateProductStockCandidate(
          productCandidate({ stockDisponivel: undefined }),
          stockDecrease(),
        ),
      'VALIDACAO',
    );
  });
});

describe('pré-condições do produtor e disponibilidade', () => {
  it('aceita configuração válida e não expõe dados privados', () => {
    expect(() =>
      validateProducerGuardCandidate(producerCandidate(), producerGuard()),
    ).not.toThrow();
  });
  it.each(['pendente', 'rejeitado'])('recusa produtor %s', (estado) => {
    conflict(
      () =>
        validateProducerGuardCandidate(
          producerCandidate({ aprovacao: { estado } }),
          producerGuard(),
        ),
      'PRODUTOR_INELEGIVEL',
    );
  });
  it('recusa produtor ausente ou sem configuração', () => {
    conflict(() => validateProducerGuardCandidate(null, producerGuard()), 'PRODUTOR_INELEGIVEL');
    conflict(
      () =>
        validateProducerGuardCandidate(
          producerCandidate({ comercial: undefined }),
          producerGuard(),
        ),
      'PRODUTOR_INELEGIVEL',
    );
  });
  it('distingue modalidade, método, concelho, taxa e revisão alterados', () => {
    const original = producerGuard();
    conflict(
      () =>
        validateProducerGuardCandidate(
          producerCandidate({
            comercial: producerCommercialInput({
              modalidades: { levantamento: true, entrega: false },
            }),
          }),
          original,
        ),
      'MODALIDADE_INDISPONIVEL',
    );
    conflict(
      () =>
        validateProducerGuardCandidate(
          producerCandidate({
            comercial: producerCommercialInput({ metodosPagamento: ['mb_way'] }),
          }),
          original,
        ),
      'METODO_NAO_ACEITE',
    );
    conflict(
      () =>
        validateProducerGuardCandidate(producerCandidate(), {
          ...original,
          selecao: { ...original.selecao, concelhoId: 'fora' },
        }),
      'CONCELHO_NAO_ABRANGIDO',
    );
    conflict(
      () =>
        validateProducerGuardCandidate(
          producerCandidate({ comercial: producerCommercialInput({ taxaEntregaCent: 350 }) }),
          original,
        ),
      'CONFIGURACAO_ALTERADA',
    );
    conflict(
      () => validateProducerGuardCandidate(producerCandidate({ revisaoOperacional: 1 }), original),
      'CONFLITO_VERSAO',
    );
  });
  it('recusa horário, dia, fuso ou intervalo inválidos e exige levantamento gratuito', () => {
    const input = producerGuard();
    for (const periodo of [
      { ...input.selecao.periodo, inicioEm: new Date('2026-10-26T13:00:00Z') },
      { ...input.selecao.periodo, fimEm: new Date('2026-10-26T19:00:00Z') },
      { ...input.selecao.periodo, inicioEm: new Date(NaN) },
      { ...input.selecao.periodo, fusoHorario: 'UTC' },
    ])
      conflict(
        () =>
          validateProducerGuardCandidate(producerCandidate(), {
            ...input,
            selecao: { ...input.selecao, periodo },
          }),
        'HORARIO_INCOMPATIVEL',
      );
    conflict(
      () =>
        validateProducerGuardCandidate(producerCandidate(), {
          ...input,
          selecao: { ...input.selecao, modalidade: 'levantamento' },
        }),
      'CONFIGURACAO_ALTERADA',
    );
  });
  it('verifica o interior do intervalo e não permite atravessar uma pausa', () => {
    const settings = producerCommercialInput({
      disponibilidade: {
        ...producerCommercialInput().disponibilidade,
        entrega: [
          { diaSemana: 1, inicio: '14:00', fim: '15:00' },
          { diaSemana: 1, inicio: '16:00', fim: '18:00' },
        ],
      },
    });
    const selection = producerGuard().selecao;
    expect(
      producerPeriodFits(settings, {
        ...selection,
        periodo: { ...selection.periodo, fimEm: new Date('2026-10-26T17:00:00Z') },
      }),
    ).toBe(false);
  });
  it('trata UTC explícito na mudança de hora e não aceita um salto por fora da janela', () => {
    const settings = producerCommercialInput({
      disponibilidade: {
        fusoHorario: 'Europe/Lisbon',
        levantamento: [],
        entrega: [{ diaSemana: 7, inicio: '01:30', fim: '02:00' }],
      },
    });
    const selection = producerGuard().selecao;
    const periodo = {
      inicioEm: new Date('2026-10-25T00:30:00Z'),
      fimEm: new Date('2026-10-25T01:45:00Z'),
      fusoHorario: 'Europe/Lisbon',
    };
    expect(producerPeriodFits(settings, { ...selection, periodo })).toBe(false);
    expect(
      producerPeriodFits(settings, {
        ...selection,
        periodo: { ...periodo, inicioEm: new Date('2026-10-25T01:30:00Z') },
      }),
    ).toBe(true);
  });
  it('não interpola valores bancários, contactos ou a configuração nos erros', () => {
    try {
      validateProducerGuardCandidate(producerCandidate(), {
        ...producerGuard(),
        revisaoEsperada: 1,
      });
    } catch (error) {
      expect(JSON.stringify(error)).not.toMatch(/iban|PT77|contacto|pagamentoPrivado/);
    }
  });
});
