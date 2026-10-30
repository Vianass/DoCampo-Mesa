import { InvalidResponse, parsePage, objectId } from '../api/catalog-contract';
import { record, text, number } from '../auctions/contracts';
export const ownReviewsPath = '/area/comprador/avaliacoes',
  adminReviewsPath = '/area/administrador/moderacao';
export type ReviewTarget = 'produto' | 'produtor';
export type ReviewState = 'publicada' | 'oculta';
const id = (v: unknown) => {
  if (typeof v !== 'string' || !objectId(v)) throw new InvalidResponse();
  return v;
};
const date = (v: unknown) => {
  const s = text(v);
  if (!Number.isFinite(Date.parse(s))) throw new InvalidResponse();
  return s;
};
export function parsePublicReview(value: unknown) {
  const r = record(value);
  if (!['produto', 'produtor'].includes(String(r.alvoTipo)) || r.compraVerificada !== true)
    throw new InvalidResponse();
  const rating = number(r.classificacao, 1);
  if (rating > 5) throw new InvalidResponse();
  return {
    id: id(r.id),
    alvoTipo: r.alvoTipo as ReviewTarget,
    alvoNome: text(r.alvoNome),
    ...(r.alvoTipo === 'produto' ? { produtoId: id(r.produtoId) } : {}),
    produtorPerfilId: id(r.produtorPerfilId),
    classificacao: rating as 1 | 2 | 3 | 4 | 5,
    comentario: text(r.comentario),
    criadaEm: date(r.criadaEm),
    autorPublico: text(r.autorPublico),
    compraVerificada: true as const,
  };
}
export function parseOwnReview(value: unknown) {
  const r = record(value);
  if (!['publicada', 'oculta'].includes(String(r.estado))) throw new InvalidResponse();
  return {
    ...parsePublicReview(value),
    encomendaId: id(r.encomendaId),
    estado: r.estado as ReviewState,
    versao: number(r.versao),
    atualizadaEm: date(r.atualizadaEm),
  };
}
export function parseAdminReview(value: unknown, metadata: { etag: string | null }) {
  const r = record(value);
  if (!metadata.etag || !/^"[A-Za-z0-9_-]{43}"$/.test(metadata.etag)) throw new InvalidResponse();
  return { ...parseOwnReview(value), produtorContaId: id(r.produtorContaId), etag: metadata.etag };
}
function reviewPage<T>(value: unknown, parse: (v: unknown) => T) {
  const r = record(value),
    p = parsePage(value, parse),
    summary = record(r.resumo),
    distribution = record(summary.distribuicao);
  const counts = Object.fromEntries(
    [1, 2, 3, 4, 5].map((k) => [String(k), number(distribution[k])]),
  );
  const count = number(summary.numeroAvaliacoes),
    sum = Object.entries(counts).reduce((a, [k, n]) => a + BigInt(k) * BigInt(n), 0n);
  if (
    count !== p.total ||
    Object.values(counts).reduce((a, n) => a + BigInt(n), 0n) !== BigInt(count) ||
    (count === 0
      ? summary.media !== null
      : typeof summary.media !== 'number' ||
        !Number.isFinite(summary.media) ||
        Math.abs(summary.media - Number(sum) / count) > 0.000001)
  )
    throw new InvalidResponse();
  return {
    ...p,
    resumo: {
      numeroAvaliacoes: count,
      media: summary.media as number | null,
      distribuicao: counts,
    },
  };
}
export const parsePublicReviews = (v: unknown) => reviewPage(v, parsePublicReview);
export const parseOwnReviews = (v: unknown) => reviewPage(v, parseOwnReview);
export const parseAdminReviews = (v: unknown) => reviewPage(v, parseOwnReview);
export function parseEligibility(v: unknown) {
  return parsePage(v, (item) => {
    const r = record(item);
    if (typeof r.elegivel !== 'boolean' || !Array.isArray(r.alvos)) throw new InvalidResponse();
    const state = text(r.estadoEncomenda);
    if (r.elegivel && state !== 'concluida') throw new InvalidResponse();
    return {
      encomendaId: id(r.encomendaId),
      estadoEncomenda: state,
      elegivel: r.elegivel,
      alvos: r.alvos.map((value) => {
        const t = record(value);
        if (!['produto', 'produtor'].includes(String(t.alvoTipo))) throw new InvalidResponse();
        return {
          alvoTipo: t.alvoTipo as ReviewTarget,
          nome: text(t.nome),
          ...(t.alvoTipo === 'produto' ? { produtoId: id(t.produtoId) } : {}),
          avaliacaoId: t.avaliacaoId === null ? null : id(t.avaliacaoId),
        };
      }),
    };
  });
}
export function parseReviewHistory(v: unknown) {
  const r = record(v);
  return {
    ...parsePage(v, (value) => {
      const e = record(value);
      if (
        !['publicada', 'oculta'].includes(String(e.estado)) ||
        !['publicada', 'oculta'].includes(String(e.anterior))
      )
        throw new InvalidResponse();
      return {
        administradorId: id(e.administradorId),
        ocorridoEm: date(e.ocorridoEm),
        anterior: e.anterior as ReviewState,
        estado: e.estado as ReviewState,
        motivo: text(e.motivo),
        versao: number(e.versao, 1),
      };
    }),
    versaoSnapshot: number(r.versaoSnapshot),
  };
}
export type PublicReview = ReturnType<typeof parsePublicReview>;
export type OwnReview = ReturnType<typeof parseOwnReview>;
export type EligibleOrder = ReturnType<typeof parseEligibility>['itens'][number];
