import { expect, test } from '@playwright/test';
import { applicationInput, applicationFixture } from './support/producer-application-fixtures';
import {
  parseApplication,
  validateApplication,
  applicationInput as normalize,
  applicationFields,
  emptyInput,
  type ApplicationField,
} from '../src/features/producer-application/model';

test('contrato próprio projeta só campos permitidos e não guarda autoria administrativa', () => {
  const parsed = parseApplication({
    ...applicationFixture('aprovado'),
    utilizadorId: 'privado',
    passwordHash: 'privado',
    decisao: { data: '2026-10-28T11:00:00Z', administradorId: 'privado' },
  });
  expect(JSON.stringify(parsed)).not.toMatch(/administradorId|utilizadorId|passwordHash|privado/);
});
for (const state of ['pendente', 'aprovado', 'rejeitado'] as const)
  test(`interpreta estado real ${state}`, () => {
    expect(parseApplication(applicationFixture(state)).estado).toBe(state);
  });
for (const field of Object.keys(applicationFields) as ApplicationField[]) {
  test(`valida ausência e limite Unicode de ${field}`, () => {
    expect(validateApplication({ ...applicationInput, [field]: '  ' })[field]).toBeTruthy();
    const maximum = applicationFields[field].maximum;
    expect(
      validateApplication({ ...applicationInput, [field]: '🌱'.repeat(maximum) })[field],
    ).toBeUndefined();
    expect(
      validateApplication({ ...applicationInput, [field]: 'x'.repeat(maximum + 1) })[field],
    ).toBeTruthy();
  });
}
test('normaliza NFC e espaços e o pedido inclui exatamente os cinco campos aprovados', () => {
  const value = normalize({ ...applicationFixture(), nomePublico: ' Jose\u0301 ' });
  expect(value.nomePublico).toBe('José');
  expect(Object.keys(value).sort()).toEqual(Object.keys(applicationInput).sort());
  expect(Object.keys(validateApplication(emptyInput()))).toHaveLength(5);
});
for (const fields of [
  { estado: 'pending' },
  { estado: ['pendente'] },
  { id: 'invalido' },
  { telefone: null },
  { submetidaEm: 'data inválida' },
  { historico: {} },
  { decisao: { data: '2026-10-28T11:00:00Z' } },
])
  test(`recusa contrato incoerente ${JSON.stringify(fields)}`, () => {
    expect(() => parseApplication({ ...applicationFixture(), ...fields })).toThrow();
  });
test('estado decidido exige auditoria coerente e rejeição fundamentada', () => {
  expect(() =>
    parseApplication({ ...applicationFixture('aprovado'), decisao: undefined }),
  ).toThrow();
  expect(() =>
    parseApplication({
      ...applicationFixture('rejeitado'),
      decisao: { data: '2026-10-28T11:00:00Z' },
    }),
  ).toThrow();
  expect(() =>
    parseApplication({
      ...applicationFixture('rejeitado'),
      decisao: { data: '2020-01-01', justificacao: 'Motivo' },
    }),
  ).toThrow();
});
test('preserva tentativas rejeitadas, incluindo contactos legados, mas recusa históricos pendentes', () => {
  const previous = { ...applicationFixture('rejeitado'), telefone: 'x'.repeat(150) };
  expect(
    parseApplication({ ...applicationFixture(), historico: [previous] }).historico[0]!.telefone,
  ).toBe(previous.telefone);
  expect(() =>
    parseApplication({ ...applicationFixture(), historico: [applicationFixture()] }),
  ).toThrow();
});
