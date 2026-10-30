import { test, expect } from '@playwright/test';
import {
  parsePublicReview,
  parsePublicReviews,
  parseEligibility,
  parseAdminReview,
} from '../src/features/reviews/contracts';
import { reviewFixture, reviewPage } from './support/review-fixtures';
test('projeção pública descarta dados privados e preserva classificação confirmada', () => {
  const r = parsePublicReview({ ...reviewFixture(), autor: 'privado', historico: ['privado'] });
  expect(r).not.toHaveProperty('autor');
  expect(r).not.toHaveProperty('encomendaId');
  expect(r).not.toHaveProperty('historico');
  expect(r.classificacao).toBe(5);
});
test('recusa classificações e compras não verificadas', () => {
  for (const classificacao of [0, 6, 1.5, '5'])
    expect(() => parsePublicReview({ ...reviewFixture(), classificacao })).toThrow();
  expect(() => parsePublicReview({ ...reviewFixture(), compraVerificada: false })).toThrow();
});
test('média, distribuição e total devem corresponder ao conjunto todo', () => {
  const p = reviewPage([reviewFixture()]);
  expect(parsePublicReviews(p).resumo.media).toBe(5);
  expect(() => parsePublicReviews({ ...p, resumo: { ...p.resumo, media: 4 } })).toThrow();
  expect(() => parsePublicReviews({ ...p, total: 2 })).toThrow();
});
test('vazio não inventa média zero', () => {
  expect(parsePublicReviews(reviewPage([])).resumo.media).toBeNull();
});
test('elegibilidade não aceita encomenda pronta marcada como elegível', () => {
  expect(() =>
    parseEligibility({
      itens: [
        {
          encomendaId: reviewFixture().encomendaId,
          estadoEncomenda: 'pronta',
          elegivel: true,
          alvos: [],
        },
      ],
      pagina: 1,
      porPagina: 12,
      total: 1,
      totalPaginas: 1,
    }),
  ).toThrow();
});
test('decisão administrativa exige ETag forte e não reutiliza token como ETag', () => {
  expect(() => parseAdminReview(reviewFixture(), { etag: null })).toThrow();
  expect(() => parseAdminReview(reviewFixture(), { etag: 'W/"x"' })).toThrow();
  expect(parseAdminReview(reviewFixture(), { etag: '"' + 'A'.repeat(43) + '"' }).versao).toBe(0);
});
