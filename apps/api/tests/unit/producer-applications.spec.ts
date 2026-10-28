import { randomBytes } from 'node:crypto';
import { createConnection, Types } from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import {
  applicationInput,
  applicationListQuery,
  rejectionInput,
} from '../../src/modules/producer-applications/producer-application.validation.js';
import {
  applicationDto,
  applicationTag,
  rejectedSnapshot,
} from '../../src/modules/producer-applications/producer-application.serialization.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import {
  projectProducerPublic,
  redactProducerSerialization,
} from '../../src/modules/producers/producer.serialization.js';
import { decisionInput, producerInput } from '../support/identity-fixtures.js';
import { producerApplicationInput } from '../support/producer-application-fixtures.js';

const connection = createConnection(),
  Producer = createProducerModel(connection);
afterAll(() => connection.close());
function rejected() {
  return new Producer(
    producerInput({
      aprovacao: decisionInput({
        estado: 'rejeitado',
        decisao: {
          autor: new Types.ObjectId(),
          data: new Date('2026-10-11T09:00:00Z'),
          justificacao: 'Completar a descrição da atividade.',
        },
      }),
    }),
  ).toObject({ transform: false });
}
describe('contrato de candidaturas', () => {
  it('normaliza espaços e Unicode sem aceitar campos de autorização', () => {
    const value = applicationInput.parse({
      ...producerApplicationInput(),
      nomePublico: '  Jose\u0301  ',
    });
    expect(value.nomePublico).toBe('José');
  });
  it.each(['nomePublico', 'localidade', 'concelho', 'descricao', 'telefone'])(
    'exige texto não vazio em %s',
    (field) => {
      for (const value of [undefined, null, '', '  ', 123, {}, []])
        expect(
          applicationInput.safeParse({ ...producerApplicationInput(), [field]: value }).success,
        ).toBe(false);
    },
  );
  it.each([
    ['nomePublico', 160],
    ['localidade', 120],
    ['concelho', 120],
    ['descricao', 5000],
    ['telefone', 120],
  ] as const)('limite de %s é %i caracteres Unicode', (field, size) => {
    expect(
      applicationInput.safeParse({ ...producerApplicationInput(), [field]: '🌱'.repeat(size) })
        .success,
    ).toBe(true);
    expect(
      applicationInput.safeParse({ ...producerApplicationInput(), [field]: 'a'.repeat(size + 1) })
        .success,
    ).toBe(false);
  });
  it.each([
    'userId',
    'utilizadorId',
    'papeis',
    'ativo',
    'aprovacao',
    'estado',
    'historicoCandidaturas',
    'comercial',
    'revisaoOperacional',
    'decisao',
    '__v',
  ])('recusa atribuição pelo cliente de %s', (field) => {
    expect(
      applicationInput.safeParse({ ...producerApplicationInput(), [field]: 'administrador' })
        .success,
    ).toBe(false);
  });
  it.each([
    {},
    { justificacao: '' },
    { justificacao: ' ' },
    { justificacao: 1 },
    { justificacao: 'x'.repeat(2001) },
    { justificacao: 'Motivo', autor: 'falso' },
  ])('recusa rejeição inválida %j', (input) => {
    expect(rejectionInput.safeParse(input).success).toBe(false);
  });
  it('valida justificação e paginação com as convenções existentes', () => {
    expect(rejectionInput.parse({ justificacao: '  Falta informação.  ' })).toEqual({
      justificacao: 'Falta informação.',
    });
    expect(
      applicationListQuery.parse({
        estado: 'pendente',
        pagina: '2',
        porPagina: '24',
        ordem: 'antigas',
      }),
    ).toEqual({ estado: 'pendente', pagina: 2, porPagina: 24, ordem: 'antigas' });
  });
  it.each([
    { estado: 'pending' },
    { pagina: '0' },
    { pagina: '1001' },
    { porPagina: '100' },
    { estado: ['pendente', 'aprovado'] },
    { userId: 'outra-conta' },
  ])('recusa filtros inesperados %j', (query) => {
    expect(applicationListQuery.safeParse(query).success).toBe(false);
  });
});
describe('histórico privado e projeções', () => {
  it('conserva o snapshot rejeitado completo sem alterar o original', async () => {
    const original = rejected(),
      snapshot = rejectedSnapshot(original);
    const current = new Producer(producerInput({ historicoCandidaturas: [snapshot] }));
    await expect(current.validate()).resolves.toBeUndefined();
    expect(snapshot.nomePublico).toBe(original.nomePublico);
    snapshot.decisao.data.setUTCFullYear(2030);
    expect(original.aprovacao.decisao!.data.getUTCFullYear()).toBe(2026);
  });
  it('não arquiva tentativas pendentes ou aprovadas como rejeitadas', () => {
    expect(() =>
      rejectedSnapshot(new Producer(producerInput()).toObject({ transform: false })),
    ).toThrow();
    expect(() =>
      rejectedSnapshot(
        new Producer(producerInput({ aprovacao: decisionInput() })).toObject({ transform: false }),
      ),
    ).toThrow();
  });
  it.each(['autor', 'data', 'justificacao'])('exige %s na decisão histórica', async (field) => {
    const snapshot = rejectedSnapshot(rejected());
    Reflect.deleteProperty(snapshot.decisao, field);
    await expect(
      new Producer(producerInput({ historicoCandidaturas: [snapshot] })).validate(),
    ).rejects.toThrow();
  });
  it('recusa data histórica anterior à submissão', async () => {
    const snapshot = rejectedSnapshot(rejected());
    snapshot.decisao.data = new Date('2020-01-01');
    await expect(
      new Producer(producerInput({ historicoCandidaturas: [snapshot] })).validate(),
    ).rejects.toThrow();
  });
  it('mantém contactos e história fora da serialização por omissão e pública', () => {
    const record = new Producer(
      producerInput({ historicoCandidaturas: [rejectedSnapshot(rejected())] }),
    );
    for (const value of [
      record.toJSON(),
      record.toObject(),
      projectProducerPublic(record.toObject({ transform: false })),
    ]) {
      expect(JSON.stringify(value)).not.toMatch(
        /telefone|historicoCandidaturas|justificacao|autor|passwordHash/,
      );
    }
    expect(redactProducerSerialization({ nomePublico: 'Parcial' })).toEqual({
      nomePublico: 'Parcial',
    });
  });
  it('DTO do próprio omite autoria administrativa e ID da conta; admin vê auditoria', () => {
    const record = rejected();
    record.historicoCandidaturas = [rejectedSnapshot(record)];
    const own = applicationDto(record),
      managed = applicationDto(record, true);
    expect(own.telefone).toBe(record.telefone);
    expect(own.historico[0]!.decisao!.justificacao).toBe(record.aprovacao.decisao!.justificacao);
    expect(JSON.stringify(own)).not.toMatch(
      /administradorId|utilizadorId|userId|password|comercial|revisaoOperacional/,
    );
    expect(managed.decisao!.administradorId).toBe(record.aprovacao.decisao!.autor.toHexString());
    expect(managed.historico[0]!.decisao!.administradorId).toBe(managed.decisao!.administradorId);
  });
  it('perfis legados não exigem migração de histórico', async () => {
    const record = new Producer(producerInput({ aprovacao: decisionInput() }));
    await expect(record.validate()).resolves.toBeUndefined();
    expect(applicationDto(record.toObject({ transform: false })).historico).toEqual([]);
    expect(record.historicoCandidaturas).toBeUndefined();
  });
  it('ETag muda com a revisão e a decisão e não expõe contactos', () => {
    const record = rejected(),
      key = randomBytes(32),
      initial = applicationTag(record, key);
    expect(initial).toMatch(/^"[\w-]{43}"$/);
    record.revisaoOperacional = 1;
    expect(applicationTag(record, key)).not.toBe(initial);
    expect(applicationTag(record, randomBytes(32))).not.toBe(applicationTag(record, key));
    record.revisaoOperacional = 0;
    record.aprovacao.decisao!.justificacao = 'Outro motivo';
    expect(applicationTag(record, key)).not.toBe(initial);
  });
});
