import { describe, it, expect } from 'vitest';
import { createConnection, Types } from 'mongoose';
import {
  reviewCreateInput,
  reviewAdminQuery,
  reviewDecisionInput,
} from '../../src/modules/reviews/review.validation.js';
import { createReviewModel } from '../../src/modules/reviews/review.model.js';
import { reviewEligible } from '../../src/modules/reviews/reviews.service.js';
const id = new Types.ObjectId().toHexString(),
  valid = {
    encomendaId: id,
    alvoTipo: 'produto',
    produtoId: id,
    classificacao: 5,
    comentario: 'Uma compra fictícia.',
  };
describe('validação de avaliações', () => {
  it.each([0, 6, -1, 1.5, '5', null])('recusa classificação %j', (classificacao) =>
    expect(reviewCreateInput.safeParse({ ...valid, classificacao }).success).toBe(false),
  );
  it.each(['', '   ', 'x'.repeat(1001), '\u0000', '\ud800'])(
    'recusa comentário inválido %j',
    (comentario) =>
      expect(reviewCreateInput.safeParse({ ...valid, comentario }).success).toBe(false),
  );
  it('normaliza texto simples e conserva quebras de linha sem o interpretar como HTML', () => {
    expect(
      reviewCreateInput.parse({ ...valid, comentario: '  Ótimo\n<script>alert(1)</script>  ' })
        .comentario,
    ).toBe('Ótimo\n<script>alert(1)</script>');
  });
  it.each([{ produtorId: id }, { autorId: id }, { estado: 'publicada' }, { elegivel: true }])(
    'não aceita campos de autoridade %j',
    (extra) => expect(reviewCreateInput.safeParse({ ...valid, ...extra }).success).toBe(false),
  );
  it('alvo produtor não aceita produto nem produtor livre', () => {
    expect(
      reviewCreateInput.safeParse({
        encomendaId: id,
        alvoTipo: 'produtor',
        classificacao: 3,
        comentario: 'Experiência.',
      }).success,
    ).toBe(true);
    expect(reviewCreateInput.safeParse({ ...valid, alvoTipo: 'produtor' }).success).toBe(false);
  });
  it.each([
    { estado: 'pendente' },
    { classificacao: '0' },
    { pagina: '1001' },
    { porPagina: '999' },
    { produto: { $ne: null } },
    { estado: ['oculta', 'publicada'] },
    { pesquisa: '.*' },
  ])('recusa filtros %j', (q) => expect(reviewAdminQuery.safeParse(q).success).toBe(false));
  it('decisão não reescreve conteúdo e exige motivo', () => {
    expect(reviewDecisionInput.safeParse({ estado: 'oculta', motivo: ' ' }).success).toBe(false);
    expect(
      reviewDecisionInput.safeParse({ estado: 'oculta', motivo: 'Inadequado', comentario: 'Outro' })
        .success,
    ).toBe(false);
  });
  it.each(['pendente', 'confirmada', 'em_preparacao', 'pronta', 'cancelada'] as const)(
    'não aceita estado de compra %s',
    (estado) =>
      expect(reviewEligible({ estado, rececao: { concluidaEm: new Date() } as never })).toBe(false),
  );
  it('conclusão exige evidência persistida e não exige pagamento integrado', () => {
    expect(reviewEligible({ estado: 'concluida', rececao: {} as never })).toBe(false);
    expect(
      reviewEligible({ estado: 'concluida', rececao: { concluidaEm: new Date() } as never }),
    ).toBe(true);
  });
});
describe('modelo de avaliações', () => {
  const connection = createConnection(),
    Review = createReviewModel(connection);
  const base = () => ({
    autor: new Types.ObjectId(),
    encomenda: new Types.ObjectId(),
    vendedor: new Types.ObjectId(),
    perfilProdutor: new Types.ObjectId(),
    alvoTipo: 'produto',
    produto: new Types.ObjectId(),
    alvoNome: 'Produto fictício',
    classificacao: 4,
    comentario: 'Boa experiência.',
  });
  it('valida registo inicial e exatamente um alvo', async () => {
    await expect(new Review(base()).validate()).resolves.toBeUndefined();
    await expect(
      new Review({ ...base(), produtor: new Types.ObjectId() }).validate(),
    ).rejects.toThrow();
    await expect(new Review({ ...base(), produto: undefined }).validate()).rejects.toThrow();
  });
  it('índices únicos incluem comprador, encomenda e o alvo condicional', () => {
    expect(Review.schema.indexes().filter(([, opts]) => opts.unique)).toHaveLength(2);
  });
  it('rejeita versões e estados sem histórico coerente', async () => {
    await expect(new Review({ ...base(), estado: 'oculta' }).validate()).rejects.toThrow();
    await expect(new Review({ ...base(), versao: 1 }).validate()).rejects.toThrow();
  });
});
