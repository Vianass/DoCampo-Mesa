import { createConnection, Error as MongooseError, Types } from 'mongoose';
import { afterAll, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import {
  producerPaymentMethods,
  producerReceptionModalities,
  producerWeekDays,
} from '../../src/modules/producers/producer-commercial.constants.js';
import type {
  ProducerCommercialSettings,
  ProducerPaymentMethod,
} from '../../src/modules/producers/producer-commercial.types.js';
import {
  assessProducerCommercial,
  validProducerIban,
  validateProducerCommercial,
} from '../../src/modules/producers/producer-commercial.validation.js';
import { projectProducerPublic } from '../../src/modules/producers/producer.serialization.js';
import {
  orderPaymentMethods,
  orderReceptionModalities,
} from '../../src/modules/orders/order.constants.js';
import type { OrderPaymentMethod } from '../../src/modules/orders/order.types.js';
import { producerInput, decisionInput } from '../support/identity-fixtures.js';
import {
  fictitiousProducerIban,
  fictitiousMbWayContact,
  pickupCommercialInput,
  producerCommercialInput,
} from '../support/producer-commercial-fixtures.js';

const connection = createConnection();
const Producer = createProducerModel(connection);
afterAll(() => connection.close());

describe('configuração comercial aditiva de producers', () => {
  it('reutiliza os identificadores aprovados sem alterar orders', () => {
    expect(producerPaymentMethods).toEqual(orderPaymentMethods);
    expect(producerReceptionModalities).toEqual(orderReceptionModalities);
    expect(producerWeekDays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expectTypeOf<ProducerPaymentMethod>().toEqualTypeOf<OrderPaymentMethod>();
  });

  it('mantém válido um produtor antigo sem inventar modalidades, taxas ou horários', async () => {
    const input = producerInput();
    const document = new Producer(input);
    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.comercial).toBeUndefined();
    expect(document.toJSON()).not.toHaveProperty('comercial');
    expect(assessProducerCommercial(document)).toEqual({
      aprovado: false,
      configurado: false,
      prontoLocalmente: false,
    });
    expect(validateProducerCommercial(undefined)).toEqual([]);
  });

  it('distingue aprovação, configuração e prontidão exclusivamente local', async () => {
    const oldApproved = new Producer(producerInput({ aprovacao: decisionInput() }));
    expect(assessProducerCommercial(oldApproved)).toEqual({
      aprovado: true,
      configurado: false,
      prontoLocalmente: false,
    });
    const pendingConfigured = new Producer(producerInput({ comercial: producerCommercialInput() }));
    await pendingConfigured.validate();
    expect(assessProducerCommercial(pendingConfigured)).toEqual({
      aprovado: false,
      configurado: true,
      prontoLocalmente: false,
    });
    const approvedConfigured = new Producer(
      producerInput({ aprovacao: decisionInput(), comercial: producerCommercialInput() }),
    );
    await approvedConfigured.validate();
    expect(assessProducerCommercial(approvedConfigured)).toEqual({
      aprovado: true,
      configurado: true,
      prontoLocalmente: true,
    });
  });

  it.each([
    pickupCommercialInput(),
    producerCommercialInput(),
    producerCommercialInput({ modalidades: { levantamento: false, entrega: true } }),
    producerCommercialInput({ taxaEntregaCent: 0 }),
    producerCommercialInput({ taxaEntregaCent: Number.MAX_SAFE_INTEGER }),
    producerCommercialInput({ pagamentoPrivado: undefined }),
  ])('aceita configuração válida %#', async (comercial) => {
    expect(validateProducerCommercial(comercial)).toEqual([]);
    await expect(new Producer(producerInput({ comercial })).validate()).resolves.toBeUndefined();
  });

  it.each([
    ['modalidades', { levantamento: false, entrega: false }],
    ['modalidades', { levantamento: true }],
    ['modalidades', { levantamento: 'true', entrega: false }],
    ['taxaEntregaCent', undefined],
    ['taxaEntregaCent', -1],
    ['taxaEntregaCent', 0.5],
    ['taxaEntregaCent', Number.MAX_SAFE_INTEGER + 1],
    ['taxaEntregaCent', NaN],
    ['taxaEntregaCent', Infinity],
    ['taxaEntregaCent', '250'],
    ['concelhosEntregaIds', []],
    ['concelhosEntregaIds', ['duplicado', 'duplicado']],
    ['concelhosEntregaIds', ['']],
    ['concelhosEntregaIds', [' nome ']],
    ['concelhosEntregaIds', [123]],
    ['concelhosEntregaIds', ['a\n']],
    ['concelhosEntregaIds', ['a'.repeat(129)]],
    ['concelhosEntregaIds', 'concelho-ficticio'],
    ['catalogoConcelhosVersao', ''],
    ['metodosPagamento', []],
    ['metodosPagamento', ['dinheiro', 'dinheiro']],
    ['metodosPagamento', ['cartao']],
    ['metodosPagamento', 'dinheiro'],
    ['disponibilidade', undefined],
    ['disponibilidade.fusoHorario', 'Zona/Inexistente'],
    ['disponibilidade.levantamento', []],
    ['disponibilidade.entrega', []],
    ['disponibilidade.entrega', [null]],
    ['disponibilidade.entrega.0.diaSemana', 0],
    ['disponibilidade.entrega.0.diaSemana', 8],
    ['disponibilidade.entrega.0.diaSemana', 1.5],
    ['disponibilidade.entrega.0.diaSemana', '1'],
    ['disponibilidade.entrega.0.inicio', '9:00'],
    ['disponibilidade.entrega.0.inicio', '24:00'],
    ['disponibilidade.entrega.0.inicio', '14:60'],
    ['disponibilidade.entrega.0.inicio', '18:00'],
    ['disponibilidade.entrega.0.inicio', '19:00'],
    ['pagamentoPrivado.mbWay.contacto', ''],
    ['pagamentoPrivado.mbWay.contacto', 123],
    ['pagamentoPrivado.transferenciaBancaria.iban', 'PT00000000000000000000000'],
    ['pagamentoPrivado.transferenciaBancaria.iban', 123],
    ['pagamentoPrivado.transferenciaBancaria.titular', ''],
  ] as const)('recusa %s inválido %# sem divulgar dados recebidos', async (path, value) => {
    const document = new Producer(producerInput({ comercial: producerCommercialInput() }));
    document.set('comercial.' + path, value);
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
  });

  it.each([
    {
      periods: [
        { diaSemana: 1, inicio: '14:00', fim: '18:00' },
        { diaSemana: 1, inicio: '14:00', fim: '18:00' },
      ],
    },
    {
      periods: [
        { diaSemana: 1, inicio: '14:00', fim: '18:00' },
        { diaSemana: 1, inicio: '17:00', fim: '19:00' },
      ],
    },
    {
      periods: [
        { diaSemana: 1, inicio: '14:00', fim: '18:00' },
        { diaSemana: 1, inicio: '15:00', fim: '16:00' },
      ],
    },
  ])('recusa duplicações/sobreposições na mesma modalidade/dia %#', async ({ periods }) => {
    const document = new Producer(producerInput({ comercial: producerCommercialInput() }));
    document.set('comercial.disponibilidade.entrega', periods);
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
  });

  it('permite intervalos adjacentes, outros dias e sobreposição entre modalidades', async () => {
    const document = new Producer(producerInput({ comercial: producerCommercialInput() }));
    document.set('comercial.disponibilidade.entrega', [
      { diaSemana: 1, inicio: '09:00', fim: '12:00' },
      { diaSemana: 1, inicio: '12:00', fim: '14:00' },
      { diaSemana: 2, inicio: '09:00', fim: '12:00' },
    ]);
    await expect(document.validate()).resolves.toBeUndefined();
  });

  it('não altera nem ordena a configuração de entrada', () => {
    const input = producerCommercialInput();
    const before = structuredClone(input);
    expect(validateProducerCommercial(input)).toEqual([]);
    expect(input).toEqual(before);
  });

  it('não exige uma migração de catálogo nem deriva IDs dos nomes', async () => {
    const input = producerCommercialInput({
      concelhosEntregaIds: ['ID-legado-123', '010203'],
      catalogoConcelhosVersao: undefined,
    });
    await expect(
      new Producer(producerInput({ comercial: input })).validate(),
    ).resolves.toBeUndefined();
  });

  it.each([null, false, [], 'configuracao'])(
    'recusa bloco comercial malformado %#',
    async (comercial) => {
      expect(validateProducerCommercial(comercial).length).toBeGreaterThan(0);
      await expect(new Producer(producerInput({ comercial })).validate()).rejects.toBeInstanceOf(
        MongooseError.ValidationError,
      );
    },
  );

  it('preserva informação configurada de uma modalidade inativa sem a ativar', async () => {
    const input = producerCommercialInput({ modalidades: { levantamento: true, entrega: false } });
    const document = new Producer(producerInput({ comercial: input }));
    await document.validate();
    expect(document.comercial?.modalidades.entrega).toBe(false);
    expect(document.comercial?.taxaEntregaCent).toBe(250);
  });

  it('normaliza apresentação do IBAN mas não consulta ou verifica contas reais', async () => {
    expect(validProducerIban(fictitiousProducerIban)).toBe(true);
    const document = new Producer(producerInput({ comercial: producerCommercialInput() }));
    document.set(
      'comercial.pagamentoPrivado.transferenciaBancaria.iban',
      fictitiousProducerIban
        .toLowerCase()
        .match(/.{1,4}/g)!
        .join(' '),
    );
    await document.validate();
    expect(document.comercial?.pagamentoPrivado?.transferenciaBancaria?.iban).toBe(
      fictitiousProducerIban,
    );
    for (const value of [null, undefined, 123, '', 'PT00x', fictitiousProducerIban + 'A'])
      expect(validProducerIban(value)).toBe(false);
  });

  it('não converte falhas internas inesperadas em erros de validação', () => {
    const failure = new Error('Falha interna fictícia');
    const input = {
      get modalidades(): never {
        throw failure;
      },
    };
    expect(() => validateProducerCommercial(input)).toThrow(failure);
    const formatter = vi.spyOn(Intl, 'DateTimeFormat').mockImplementationOnce(function () {
      throw failure;
    });
    try {
      expect(() => validateProducerCommercial(producerCommercialInput())).toThrow(failure);
    } finally {
      formatter.mockRestore();
    }
  });
});

describe('privacidade comercial e compatibilidade de serialização', () => {
  it('não acrescenta comercial ao JSON anterior e protege também toObject', () => {
    const document = new Producer(
      producerInput({ aprovacao: decisionInput(), comercial: producerCommercialInput() }),
    );
    for (const value of [document.toJSON(), document.toObject()]) {
      expect(value).not.toHaveProperty('telefone');
      expect(value).not.toHaveProperty('comercial');
      expect(value.aprovacao.decisao).not.toHaveProperty('autor');
      expect(value).toMatchObject({
        nomePublico: 'Exploração fictícia de teste',
        aprovacao: { estado: 'aprovado' },
      });
    }
    expect(document.toObject()).not.toHaveProperty('nomeResponsavel');
  });

  it('uma projeção pública aditiva inclui horários/métodos sem dados privados, mesmo a partir de raw', () => {
    const document = new Producer(
      producerInput({ comercial: producerCommercialInput(), aprovacao: decisionInput() }),
    );
    const raw = document.toObject({ transform: false });
    const projected = projectProducerPublic(raw);
    expect(projected).toMatchObject({
      comercial: {
        taxaEntregaCent: 250,
        metodosPagamento: ['dinheiro', 'mb_way', 'transferencia_bancaria'],
      },
    });
    const serialized = JSON.stringify(projected);
    for (const secret of [
      fictitiousProducerIban,
      fictitiousMbWayContact,
      'pagamentoPrivado',
      'telefone',
      'autor',
      'userId',
    ])
      expect(serialized).not.toContain(secret);
    expect(raw.comercial?.pagamentoPrivado?.transferenciaBancaria?.iban).toBe(
      fictitiousProducerIban,
    );
  });

  it('serializar diretamente os subdocumentos privados também os minimiza', () => {
    const document = new Producer(producerInput({ comercial: producerCommercialInput() }));
    for (const path of [
      'comercial',
      'comercial.pagamentoPrivado',
      'comercial.pagamentoPrivado.mbWay',
      'comercial.pagamentoPrivado.transferenciaBancaria',
    ]) {
      const text = JSON.stringify(document.get(path));
      expect(text).not.toContain(fictitiousProducerIban);
      expect(text).not.toContain(fictitiousMbWayContact);
    }
  });

  it('não expõe dados bancários em erros de validação ou cast, incluindo objetos estranhos', async () => {
    for (const invalid of [
      {
        ...producerCommercialInput(),
        pagamentoPrivado: {
          transferenciaBancaria: { iban: fictitiousProducerIban, segredo: 'erro-privado' },
        },
      },
      {
        ...producerCommercialInput(),
        pagamentoPrivado: { transferenciaBancaria: { iban: { conta: fictitiousProducerIban } } },
      },
      {
        ...producerCommercialInput(),
        pagamentoPrivado: { transferenciaBancaria: { iban: fictitiousProducerIban + 'A' } },
      },
    ]) {
      const document = new Producer(producerInput({ comercial: invalid }));
      try {
        await document.validate();
        expect.fail('Era esperado um erro.');
      } catch (error) {
        expect(error).toBeInstanceOf(MongooseError.ValidationError);
        expect(String(error)).not.toContain(fictitiousProducerIban);
        expect(JSON.stringify(error)).not.toContain(fictitiousProducerIban);
        expect(String(error)).not.toContain('erro-privado');
      }
    }
  });

  it.each([
    null,
    undefined,
    {},
    { nomePublico: 'Parcial' },
    { comercial: { disponibilidade: {} } },
  ])('projeções incompletas são seguras %#', (value) => {
    expect(() => projectProducerPublic(value)).not.toThrow();
  });

  it('não propaga conta populada ou campos administrativos ao resumo público', () => {
    const value = {
      _id: new Types.ObjectId(),
      nomePublico: 'Perfil fictício',
      userId: { emailNormalizado: 'privado@example.invalid', passwordHash: 'privado' },
      aprovacao: { estado: 'aprovado', decisao: { autor: 'privado' } },
      comercial: producerCommercialInput(),
    };
    const text = JSON.stringify(projectProducerPublic(value));
    for (const secret of [
      'privado@example.invalid',
      'passwordHash',
      'autor',
      fictitiousProducerIban,
    ])
      expect(text).not.toContain(secret);
  });

  it('tipos comerciais mantêm separados os dados privados', () => {
    expectTypeOf<ProducerCommercialSettings>().toHaveProperty('pagamentoPrivado');
  });
});
