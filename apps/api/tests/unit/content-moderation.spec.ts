import { describe, it, expect } from 'vitest';
import { createConnection, Types } from 'mongoose';
import { createContentReportModel } from '../../src/modules/moderation/content-report.model.js';
import {
  reportInput,
  reportQuery,
  reportDecision,
  contentDecision,
  contentQuery,
  evidenceSchema,
} from '../../src/modules/moderation/moderation.validation.js';
import {
  moderationTag,
  requireModerationTag,
} from '../../src/modules/moderation/moderation.control.js';
const id = new Types.ObjectId().toHexString();
describe('contrato estrito de denúncias', () => {
  for (const alvoTipo of ['produto', 'produtor', 'avaliacao'])
    it('aceita motivo normalizado para ' + alvoTipo, () => {
      expect(
        reportInput.parse({ alvoTipo, alvoId: id.toUpperCase(), motivo: '  Conteúdo a rever.  ' }),
      ).toEqual({ alvoTipo, alvoId: id, motivo: 'Conteúdo a rever.' });
    });
  for (const motivo of ['', '  ', 'x'.repeat(1001), '\u0000', '\ud800'])
    it('recusa motivo inválido ' + JSON.stringify(motivo).slice(0, 28), () => {
      expect(reportInput.safeParse({ alvoTipo: 'produto', alvoId: id, motivo }).success).toBe(
        false,
      );
    });
  for (const body of [
    { alvoTipo: 'order', alvoId: id, motivo: 'Rever' },
    { alvoTipo: 'produto', alvoId: 'invalid', motivo: 'Rever' },
    { alvoTipo: 'produto', alvoId: { $ne: null }, motivo: 'Rever' },
    { alvoTipo: 'produto', alvoId: id, motivo: 'Rever', autor: id },
    { alvoTipo: 'produto', alvoId: id, motivo: 'Rever', estado: 'resolvida' },
  ])
    it('recusa alvos, IDs e campos indevidos: ' + JSON.stringify(body).slice(0, 65), () =>
      expect(reportInput.safeParse(body).success).toBe(false),
    );
  it('separa visibilidade de publicação, aprovação e estado da denúncia', () => {
    expect(contentDecision.safeParse({ estado: 'publicado', motivo: 'Rever' }).success).toBe(false);
    expect(contentDecision.safeParse({ estado: 'aprovado', motivo: 'Rever' }).success).toBe(false);
    expect(reportDecision.safeParse({ estado: 'pendente', motivo: 'Reabrir' }).success).toBe(false);
    expect(reportDecision.safeParse({ estado: 'resolvida', motivo: 'Analisada' }).success).toBe(
      true,
    );
  });
  it('valida filtros, paginação limitada e proíbe queries extra', () => {
    expect(reportQuery.parse({}).porPagina).toBe(12);
    for (const q of [
      { pagina: '0' },
      { pagina: '1001' },
      { porPagina: '10000' },
      { estado: 'outro' },
      { autor: id },
    ])
      expect(reportQuery.safeParse(q).success).toBe(false);
    expect(contentQuery.safeParse({ tipo: 'avaliacao' }).success).toBe(false);
    expect(contentQuery.safeParse({ tipo: 'produto', sinalizados: 'true' }).success).toBe(true);
  });
  it('evidência não aceita dados privados nem URLs com credenciais', () => {
    const evidence = { nome: 'Produto', descricao: 'Texto', imagens: [] };
    expect(evidenceSchema.safeParse({ ...evidence, passwordHash: 'privado' }).success).toBe(false);
    expect(
      evidenceSchema.safeParse({
        ...evidence,
        imagens: [{ url: 'https://user:pass@example.invalid/p.webp' }],
      }).success,
    ).toBe(false);
  });
});
describe('modelo e concorrência', () => {
  const Model = createContentReportModel(createConnection());
  const candidate = () => ({
    autor: new Types.ObjectId(),
    alvoTipo: 'produto',
    alvoId: new Types.ObjectId(),
    motivo: 'Analisar fotografia.',
    evidencia: { nome: 'Teste', descricao: 'Produto', imagens: [] },
  });
  it('começa pendente sem decisão e sem ocultar o conteúdo', async () => {
    const doc = new Model(candidate());
    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.estado).toBe('pendente');
    expect(doc.versao).toBe(0);
    expect(doc.historico).toHaveLength(0);
    expect(Model.schema.indexes()).toContainEqual([
      { autor: 1, alvoTipo: 1, alvoId: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });
  it('recusa resolução sem auditoria', async () => {
    const doc = new Model({ ...candidate(), estado: 'resolvida', versao: 1 });
    await expect(doc.validate()).rejects.toThrow();
  });
  it('valida autoria, motivo e sequência de uma decisão final', async () => {
    const event = {
      administrador: new Types.ObjectId(),
      ocorridoEm: new Date(),
      anterior: 'pendente',
      estado: 'rejeitada',
      motivo: 'Análise efetuada.',
      versao: 1,
    };
    await expect(
      new Model({
        ...candidate(),
        estado: 'rejeitada',
        versao: 1,
        historico: [event],
        conteudoNaDecisao: { disponivel: true, estado: 'visivel', versao: 0 },
      }).validate(),
    ).resolves.toBeUndefined();
    await expect(
      new Model({ ...candidate(), estado: 'resolvida', versao: 1, historico: [event] }).validate(),
    ).rejects.toThrow();
  });
  it('ETag é forte, estável e rejeita ausência, formato ou versão antiga', () => {
    const key = new TextEncoder().encode('Chave fictícia exclusiva do teste.'),
      a = moderationTag(key, 'produto:0'),
      b = moderationTag(key, 'produto:1');
    expect(a).toMatch(/^"[A-Za-z0-9_-]{43}"$/);
    expect(a).not.toBe(b);
    expect(() => requireModerationTag(a, a)).not.toThrow();
    for (const [value, status] of [
      [undefined, 428],
      ['W/' + a, 400],
      [b, 412],
    ] as const) {
      try {
        requireModerationTag(a, value);
        throw Error('Não recusou');
      } catch (e) {
        expect(e).toMatchObject({ status });
      }
    }
  });
});
