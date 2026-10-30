import { describe, it, expect } from 'vitest';
import { Types, createConnection } from 'mongoose';
import { adminUserQuery, accountStateInput } from '../../src/modules/admin/admin.validation.js';
import { adminUserDto, adminUserTag } from '../../src/modules/admin/admin.serialization.js';
import { createAccountAuditModel } from '../../src/modules/admin/admin.models.js';
import { userInput } from '../support/identity-fixtures.js';
const row = {
    ...userInput(),
    _id: new Types.ObjectId(),
    nome: 'Pessoa fictícia',
    emailNormalizado: 'pessoa@example.invalid',
    papeis: ['comprador'] as ['comprador'],
    ativo: true,
    revisaoOperacional: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    passwordHash: 'privado',
    token: 'privado',
  },
  key = new Uint8Array(32).fill(42);
describe('contratos administrativos', () => {
  it('aplica paginação e filtros tipados', () => {
    expect(adminUserQuery.parse({})).toEqual({ pagina: 1, porPagina: 12, ordem: 'recentes' });
    expect(
      adminUserQuery.parse({
        pesquisa: '  Horta  ',
        papel: 'produtor',
        estado: 'inativo',
        pagina: '2',
      }),
    ).toMatchObject({ pesquisa: 'Horta', pagina: 2 });
  });
  it.each([
    { pagina: '0' },
    { pagina: '1001' },
    { porPagina: '100' },
    { estado: 'suspenso' },
    { papel: 'superadmin' },
    { pesquisa: '' },
    { pesquisa: 'a'.repeat(101) },
    { pesquisa: { $ne: '' } },
    { papeis: ['administrador'] },
  ])('rejeita query não suportada %j', (input) => {
    expect(adminUserQuery.safeParse(input).success).toBe(false);
  });
  it.each([
    { ativo: 'false', motivo: 'motivo' },
    { ativo: false },
    { ativo: false, motivo: ' ' },
    { ativo: true, motivo: 'x'.repeat(2001) },
    { ativo: false, motivo: 'teste', papeis: ['administrador'] },
    { ativo: true, motivo: 'teste', administradorId: 'forjado' },
  ])('rejeita alteração arbitrária %j', (input) => {
    expect(accountStateInput.safeParse(input).success).toBe(false);
  });
  it('exige motivo normalizado em ambas as transições e aceita Unicode por caracteres', () => {
    expect(accountStateInput.parse({ ativo: false, motivo: '  raza\u0303o  ' })).toEqual({
      ativo: false,
      motivo: 'razão',
    });
    expect(accountStateInput.parse({ ativo: true, motivo: '😀'.repeat(2000) }).motivo).toHaveLength(
      4000,
    );
  });
  it('projeta por lista permitida e protege dados internos', () => {
    expect(Object.keys(adminUserDto(row)).sort()).toEqual([
      'ativo',
      'email',
      'id',
      'nome',
      'papeis',
      'registadoEm',
    ]);
    expect(adminUserDto({ ...row, ativo: undefined }).ativo).toBe(true);
  });
  it('ETag é forte, opaco, estável e varia com estado revisão e papéis', () => {
    const tag = adminUserTag(row, key);
    expect(tag).toMatch(/^"[A-Za-z0-9_-]{43}"$/);
    expect(adminUserTag({ ...row }, key)).toBe(tag);
    for (const change of [
      { ativo: false },
      { revisaoOperacional: 1 },
      { papeis: ['administrador'] as ['administrador'] },
    ])
      expect(adminUserTag({ ...row, ...change }, key)).not.toBe(tag);
  });
  it('auditoria tem índice único por transição e não tem TTL', () => {
    const c = createConnection(),
      model = createAccountAuditModel(c);
    expect(model.schema.indexes()).toContainEqual([
      { utilizadorId: 1, revisao: 1 },
      { unique: true },
    ]);
    expect(JSON.stringify(model.schema.indexes())).not.toContain('expireAfterSeconds');
  });
});
