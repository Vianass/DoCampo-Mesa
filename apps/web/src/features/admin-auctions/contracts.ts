import { InvalidResponse, parsePage, objectId } from '../api/catalog-contract';
import {
  parseAuction,
  parseSnapshot,
  record,
  number,
  text,
  auctionStates,
  type AuctionSummary,
  type AuctionSnapshot,
} from '../auctions/contracts';
export const adminAuctionsPath = '/area/administrador/leiloes',
  adminAuctionsApi = '/admin/auctions';
export interface AdminAuction extends AuctionSummary {
  produtorContaId: string;
  numeroLicitacoes: number;
  estadoEmAtualizacao: boolean;
  lider: { referencia: string } | null;
  vencedor?: { referencia: string };
}
export interface AuctionQuery {
  pagina: number;
  porPagina: 12 | 24 | 36;
  ordem: 'recentes' | 'antigas';
  estado: string;
  produtor: string;
  produto: string;
  identificador: string;
  desde: string;
  ate: string;
}
export const filterKeys = [
  'estado',
  'produtor',
  'produto',
  'identificador',
  'desde',
  'ate',
] as const;
export function auctionQuery(p: URLSearchParams): AuctionQuery {
  const page = p.get('pagina') ?? '1';
  return {
    pagina: /^[1-9]\d{0,3}$/.test(page) && Number(page) <= 1000 ? Number(page) : 1,
    porPagina: p.get('porPagina') === '36' ? 36 : p.get('porPagina') === '24' ? 24 : 12,
    ordem: p.get('ordem') === 'antigas' ? 'antigas' : 'recentes',
    ...(Object.fromEntries(filterKeys.map((k) => [k, p.get(k) ?? ''])) as Pick<
      AuctionQuery,
      (typeof filterKeys)[number]
    >),
  };
}
export function auctionSearch(q: AuctionQuery) {
  const p = new URLSearchParams({
    pagina: String(q.pagina),
    porPagina: String(q.porPagina),
    ordem: q.ordem,
  });
  for (const k of filterKeys) if (q[k]) p.set(k, q[k]);
  return p.toString();
}
export function toSnapshot(a: AdminAuction): AuctionSnapshot {
  return {
    leilaoId: a.id,
    versao: a.versao,
    sequencia: a.sequencia,
    estado: a.estado,
    valorAtualCent: a.licitacaoAtual.valorCent,
    incrementoCent: a.incrementoCent,
    bidId: a.licitacaoAtual.bidId,
    lider: a.lider,
    iniciaEm: a.iniciaEm,
    terminaEm: a.terminaEm,
    serverNow: a.serverNow,
    ...(a.resultado ? { resultado: a.resultado } : {}),
  };
}
export function parseAdminAuction(v: unknown): AdminAuction {
  const r = record(v),
    a = parseAuction(v);
  if (
    !objectId(String(r.produtorContaId)) ||
    typeof r.estadoEmAtualizacao !== 'boolean' ||
    number(r.numeroLicitacoes) !== a.sequencia
  )
    throw new InvalidResponse();
  const snap = parseSnapshot({
    ...toSnapshot({
      ...a,
      produtorContaId: String(r.produtorContaId),
      numeroLicitacoes: a.sequencia,
      estadoEmAtualizacao: r.estadoEmAtualizacao,
      lider: r.lider as AdminAuction['lider'],
    }),
  });
  const result: AdminAuction = {
    ...a,
    produtorContaId: String(r.produtorContaId),
    numeroLicitacoes: a.sequencia,
    estadoEmAtualizacao: r.estadoEmAtualizacao,
    lider: snap.lider,
  };
  if (r.vencedor !== undefined) {
    const w = record(r.vencedor);
    if (
      a.estado !== 'terminado' ||
      a.resultado?.tipo !== 'vencedor' ||
      w.referencia !== snap.lider?.referencia
    )
      throw new InvalidResponse();
    result.vencedor = { referencia: text(w.referencia) };
  }
  return result;
}
export function parseAdminAuctions(v: unknown) {
  const r = record(v),
    p = parsePage(v, parseAdminAuction),
    m = record(r.indicadores),
    s = record(m.porEstado);
  const porEstado = Object.fromEntries(auctionStates.map((k) => [k, number(s[k])])) as Record<
    (typeof auctionStates)[number],
    number
  >;
  if (
    number(m.numeroLeiloes) !== p.total ||
    Object.values(porEstado).reduce((a, b) => a + BigInt(b), 0n) !== BigInt(p.total)
  )
    throw new InvalidResponse();
  return {
    ...p,
    indicadores: {
      numeroLeiloes: p.total,
      porEstado,
      numeroLicitacoes: number(m.numeroLicitacoes),
      valorOfertasVencedorasCent: number(m.valorOfertasVencedorasCent),
    },
  };
}
export function parseAdminBids(v: unknown) {
  const raw = record(v),
    seq = number(raw.sequenciaSnapshot),
    version = number(raw.versaoSnapshot);
  if (seq > version) throw new InvalidResponse();
  const page = parsePage(v, (v) => {
    const r = record(v),
      p = record(r.participante);
    if (
      !objectId(String(r.id)) ||
      !objectId(String(r.leilaoId)) ||
      r.confirmada !== true ||
      !/^p_[a-zA-Z0-9_-]{24}$/.test(text(p.referencia)) ||
      !Number.isFinite(Date.parse(text(r.aceiteEm)))
    )
      throw new InvalidResponse();
    return {
      id: String(r.id),
      leilaoId: String(r.leilaoId),
      valorCent: number(r.valorCent, 1),
      sequencia: number(r.sequencia, 1),
      aceiteEm: String(r.aceiteEm),
      participante: { referencia: String(p.referencia) },
      confirmada: true as const,
    };
  });
  if (page.total !== seq || page.itens.some((b) => b.sequencia > seq)) throw new InvalidResponse();
  return {
    ...page,
    sequenciaSnapshot: seq,
    versaoSnapshot: version,
    serverNow: text(raw.serverNow),
  };
}
