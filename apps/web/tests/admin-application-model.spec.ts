import { test, expect } from '@playwright/test';
import {
  parseAdministrativeApplication,
  parseApplicationList,
  applicationQuery,
  queryString,
  validateRejection,
  rejectionReason,
} from '../src/features/admin-applications/contracts';
import { administrativeFixture, applicationTag } from './support/admin-application-fixtures';
for (const state of ['pendente', 'aprovado', 'rejeitado'] as const)
  test('projeta detalhe administrativo ' + state, () => {
    const raw = administrativeFixture(state),
      value = parseAdministrativeApplication(
        {
          ...raw,
          email: 'privado',
          passwordHash: 'privado',
          comercial: { pagamentoPrivado: 'privado' },
        },
        { etag: applicationTag },
      );
    expect(value.utilizadorId).toBe(raw.utilizadorId);
    expect(value.etag).toBe(applicationTag);
    expect(JSON.stringify(value)).not.toMatch(/privado|passwordHash|comercial|email/);
    if (state !== 'pendente') expect(value.administradorId).toBe('000000000000000000000501');
  });
test('histórico administrativo conserva motivo e autor sem guardar extras', () => {
  const prior = administrativeFixture('rejeitado');
  const raw = { ...administrativeFixture(), historico: [{ ...prior, passwordHash: 'privado' }] };
  const result = parseAdministrativeApplication(raw, { etag: applicationTag });
  expect(result.historico[0]!.administradorId).toBe(prior.decisao!.administradorId);
  expect(result.historico[0]!.decisao!.justificacao).toBe(prior.decisao!.justificacao);
  expect(JSON.stringify(result)).not.toContain('passwordHash');
});
for (const etag of [null, 'W/' + applicationTag, '"invalid"', ''])
  test('recusa ETag ausente/fraco/inválido ' + etag, () => {
    expect(() => parseAdministrativeApplication(administrativeFixture(), { etag })).toThrow();
  });
test('recusa autoria e identidade administrativas incompletas', () => {
  expect(() =>
    parseAdministrativeApplication(
      { ...administrativeFixture(), utilizadorId: 'inválido' },
      { etag: applicationTag },
    ),
  ).toThrow();
  expect(() =>
    parseAdministrativeApplication(
      {
        ...administrativeFixture('rejeitado'),
        decisao: { data: '2026-10-28T11:00:00Z', justificacao: 'Motivo' },
      },
      { etag: applicationTag },
    ),
  ).toThrow();
});
test('lista projeta resumos sem contactos nem histórico', () => {
  const data = parseApplicationList({
    itens: [administrativeFixture()],
    pagina: 1,
    porPagina: 12,
    total: 1,
    totalPaginas: 1,
  });
  expect(data.itens[0]).not.toHaveProperty('telefone');
  expect(data.itens[0]).not.toHaveProperty('historico');
  expect(data.itens[0]).not.toHaveProperty('descricao');
});
for (const fields of [
  { totalPaginas: 2 },
  { pagina: 0 },
  { porPagina: 10 },
  { total: 2 },
  { itens: [administrativeFixture(), administrativeFixture()], total: 2 },
  { itens: [{ ...administrativeFixture(), submetidaEm: 'inválido' }] },
])
  test('recusa página incoerente ' + JSON.stringify(fields), () => {
    expect(() =>
      parseApplicationList({
        itens: [administrativeFixture()],
        pagina: 1,
        porPagina: 12,
        total: 1,
        totalPaginas: 1,
        ...fields,
      }),
    ).toThrow();
  });
test('página fora do limite atual pode estar vazia sem inventar resultados', () => {
  expect(
    parseApplicationList({ itens: [], pagina: 2, porPagina: 12, total: 1, totalPaginas: 1 }).itens,
  ).toEqual([]);
});
test('query suporta apenas os filtros e limites do contrato', () => {
  expect(
    applicationQuery(new URLSearchParams('pagina=1001&porPagina=99&estado=desconhecido&ordem=x')),
  ).toEqual({ pagina: 1, porPagina: 12, estado: '', ordem: 'recentes' });
  expect(
    queryString(
      applicationQuery(
        new URLSearchParams(
          'pagina=2&porPagina=24&estado=rejeitado&ordem=antigas&pesquisa=ignorada',
        ),
      ),
    ),
  ).toBe('pagina=2&porPagina=24&ordem=antigas&estado=rejeitado');
});
test('motivo obrigatório normaliza NFC e respeita 2000 caracteres Unicode', () => {
  expect(validateRejection('  ')).toBeTruthy();
  expect(validateRejection('🌱'.repeat(2000))).toBeUndefined();
  expect(validateRejection('🌱'.repeat(2001))).toBeTruthy();
  expect(rejectionReason(' Jose\u0301 ')).toBe('José');
});
