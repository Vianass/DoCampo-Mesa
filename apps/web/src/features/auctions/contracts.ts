import {
  InvalidResponse,
  objectId,
  parseSale,
  parsePage,
  type PageDto,
} from '../api/catalog-contract';
import type { JsonResponseMetadata } from '../api/client';
import type { SaleUnit } from '../../types/market';

export const auctionStates = ['agendado', 'ativo', 'terminado', 'cancelado'] as const;
export type AuctionState = (typeof auctionStates)[number];
export const auctionLabels: Record<AuctionState, string> = {
  agendado: 'Agendado',
  ativo: 'A decorrer',
  terminado: 'Terminado',
  cancelado: 'Cancelado',
};
export interface AuctionResult {
  tipo: 'sem_licitacoes' | 'vencedor';
  valorCent: number | null;
  bidId: string | null;
}
export interface AuctionSummary {
  id: string;
  produtoId: string;
  produtor: { perfilId: string; nome: string };
  titulo: string;
  descricao: string;
  lote: { nome: string; quantidade: number; unidadeVenda: SaleUnit };
  precoBaseCent: number;
  incrementoCent: number;
  iniciaEm: string;
  terminaEm: string;
  estado: AuctionState;
  licitacaoAtual: { valorCent: number; bidId: string | null };
  sequencia: number;
  versao: number;
  serverNow: string;
  resultado?: AuctionResult;
}
export interface AuctionDetail extends AuctionSummary {
  etag: string;
  lider: { referencia: string; proprio: boolean } | null;
  reserva?: { estado: string; reposta: number; pendente: number };
  historico?: { tipo: string; ocorridoEm: string }[];
}
export interface AuctionSnapshot {
  leilaoId: string;
  versao: number;
  sequencia: number;
  estado: AuctionState;
  valorAtualCent: number;
  incrementoCent: number;
  bidId: string | null;
  lider: { referencia: string } | null;
  iniciaEm: string;
  terminaEm: string;
  serverNow: string;
  resultado?: AuctionResult;
}
export interface AuctionBid {
  id: string;
  leilaoId: string;
  valorCent: number;
  sequencia: number;
  aceiteEm: string;
  participante: { referencia: string; proprio: boolean };
}
export interface BidReceipt {
  requestId: string;
  origem: 'nova' | 'replay';
  licitacao: AuctionBid;
  estado: AuctionSnapshot;
}
export interface BidHistory extends PageDto<AuctionBid> {
  sequenciaSnapshot: number;
  versaoSnapshot: number;
  serverNow: string;
}
export interface AuctionWrite {
  titulo: string;
  descricao: string;
  precoBaseCent: number;
  incrementoCent: number;
  iniciaEm?: string;
  terminaEm: string;
}
export interface AuctionCreate extends AuctionWrite {
  produtoId: string;
  quantidade: number;
}
export interface OwnProduct {
  id: string;
  nome: string;
  estadoPublicacao: string;
  stockDisponivel: number;
  unidadeVenda: SaleUnit;
  imagens: { url: string; alt?: string }[];
}
export function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new InvalidResponse();
  return v as Record<string, unknown>;
}
export function text(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw new InvalidResponse();
  return v;
}
export function number(v: unknown, min = 0): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min) throw new InvalidResponse();
  return v;
}
export function id(v: unknown): string {
  const s = text(v);
  if (!objectId(s)) throw new InvalidResponse();
  return s.toLowerCase();
}
function date(v: unknown): string {
  const s = text(v);
  if (!Number.isFinite(Date.parse(s))) throw new InvalidResponse();
  return s;
}
function state(v: unknown): AuctionState {
  if (!auctionStates.includes(v as AuctionState)) throw new InvalidResponse();
  return v as AuctionState;
}
function reference(v: unknown): string {
  const s = text(v);
  if (!/^p_[a-zA-Z0-9_-]{24}$/.test(s)) throw new InvalidResponse();
  return s;
}
function nullableId(v: unknown) {
  return v === null ? null : id(v);
}
function result(v: unknown): AuctionResult | undefined {
  if (v === undefined) return undefined;
  const r = record(v);
  if (r.tipo !== 'sem_licitacoes' && r.tipo !== 'vencedor') throw new InvalidResponse();
  const output = {
    tipo: r.tipo,
    valorCent: r.valorCent === null ? null : number(r.valorCent, 1),
    bidId: nullableId(r.bidId),
  };
  if (
    output.tipo === 'sem_licitacoes'
      ? output.valorCent !== null || output.bidId !== null
      : output.valorCent === null || output.bidId === null
  )
    throw new InvalidResponse();
  return output as AuctionResult;
}
export function parseAuction(v: unknown): AuctionSummary {
  const a = record(v),
    producer = record(a.produtor),
    lot = record(a.lote),
    current = record(a.licitacaoAtual);
  const data: AuctionSummary = {
    id: id(a.id),
    produtoId: id(a.produtoId),
    produtor: { perfilId: id(producer.perfilId), nome: text(producer.nome) },
    titulo: text(a.titulo),
    descricao: text(a.descricao),
    lote: {
      nome: text(lot.nome),
      quantidade: number(lot.quantidade, 1),
      unidadeVenda: parseSale(lot.unidadeVenda),
    },
    precoBaseCent: number(a.precoBaseCent),
    incrementoCent: number(a.incrementoCent, 1),
    iniciaEm: date(a.iniciaEm),
    terminaEm: date(a.terminaEm),
    estado: state(a.estado),
    licitacaoAtual: { valorCent: number(current.valorCent), bidId: nullableId(current.bidId) },
    sequencia: number(a.sequencia),
    versao: number(a.versao),
    serverNow: date(a.serverNow),
    resultado: result(a.resultado),
  };
  if (
    Date.parse(data.iniciaEm) >= Date.parse(data.terminaEm) ||
    data.sequencia > data.versao ||
    (data.sequencia === 0) !== (data.licitacaoAtual.bidId === null)
  )
    throw new InvalidResponse();
  return data;
}
export const parseAuctions = (v: unknown) => parsePage(v, parseAuction);
export function parseAuctionDetail(v: unknown, metadata: JsonResponseMetadata): AuctionDetail {
  const a = record(v),
    summary = parseAuction(v),
    leader = a.lider === null ? null : record(a.lider);
  if (leader && typeof leader.proprio !== 'boolean') throw new InvalidResponse();
  const detail: AuctionDetail = {
    ...summary,
    etag: text(metadata.etag),
    lider: leader
      ? { referencia: reference(leader.referencia), proprio: leader.proprio as boolean }
      : null,
  };
  if (a.reserva !== undefined) {
    const r = record(a.reserva);
    detail.reserva = {
      estado: text(r.estado),
      reposta: number(r.reposta),
      pendente: number(r.pendente),
    };
  }
  if (a.historico !== undefined) {
    if (!Array.isArray(a.historico)) throw new InvalidResponse();
    detail.historico = a.historico.map((v) => {
      const e = record(v);
      return { tipo: text(e.tipo), ocorridoEm: date(e.ocorridoEm) };
    });
  }
  return detail;
}
export function parseSnapshot(v: unknown): AuctionSnapshot {
  const s = record(v),
    l = s.lider === null ? null : record(s.lider);
  const data: AuctionSnapshot = {
    leilaoId: id(s.leilaoId),
    versao: number(s.versao),
    sequencia: number(s.sequencia),
    estado: state(s.estado),
    valorAtualCent: number(s.valorAtualCent),
    incrementoCent: number(s.incrementoCent, 1),
    bidId: nullableId(s.bidId),
    lider: l ? { referencia: reference(l.referencia) } : null,
    iniciaEm: date(s.iniciaEm),
    terminaEm: date(s.terminaEm),
    serverNow: date(s.serverNow),
    resultado: result(s.resultado),
  };
  if (
    data.sequencia > data.versao ||
    Date.parse(data.iniciaEm) >= Date.parse(data.terminaEm) ||
    (data.sequencia === 0) !== (data.bidId === null) ||
    (data.bidId === null) !== (data.lider === null)
  )
    throw new InvalidResponse();
  return data;
}
export function fromDetail(a: AuctionDetail): AuctionSnapshot {
  return {
    leilaoId: a.id,
    versao: a.versao,
    sequencia: a.sequencia,
    estado: a.estado,
    valorAtualCent: a.licitacaoAtual.valorCent,
    incrementoCent: a.incrementoCent,
    bidId: a.licitacaoAtual.bidId,
    lider: a.lider ? { referencia: a.lider.referencia } : null,
    iniciaEm: a.iniciaEm,
    terminaEm: a.terminaEm,
    serverNow: a.serverNow,
    resultado: a.resultado,
  };
}
export function parseBid(v: unknown): AuctionBid {
  const b = record(v),
    p = record(b.participante);
  if (typeof p.proprio !== 'boolean') throw new InvalidResponse();
  return {
    id: id(b.id),
    leilaoId: id(b.leilaoId),
    valorCent: number(b.valorCent, 1),
    sequencia: number(b.sequencia, 1),
    aceiteEm: date(b.aceiteEm),
    participante: { referencia: reference(p.referencia), proprio: p.proprio },
  };
}
export function parseReceipt(v: unknown): BidReceipt {
  const r = record(v);
  if (r.origem !== 'nova' && r.origem !== 'replay') throw new InvalidResponse();
  const value = {
    requestId: text(r.requestId),
    origem: r.origem,
    licitacao: parseBid(r.licitacao),
    estado: parseSnapshot(r.estado),
  } as BidReceipt;
  if (
    value.licitacao.leilaoId !== value.estado.leilaoId ||
    !value.licitacao.participante.proprio ||
    value.licitacao.sequencia > value.estado.sequencia
  )
    throw new InvalidResponse();
  return value;
}
export function parseHistory(v: unknown): BidHistory {
  const h = record(v);
  return {
    ...parsePage(v, parseBid),
    sequenciaSnapshot: number(h.sequenciaSnapshot),
    versaoSnapshot: number(h.versaoSnapshot),
    serverNow: date(h.serverNow),
  };
}
export function parseOwnProduct(v: unknown): OwnProduct {
  const p = record(v);
  return {
    id: id(p.id),
    nome: text(p.nome),
    estadoPublicacao: text(p.estadoPublicacao),
    stockDisponivel: number(p.stockDisponivel),
    unidadeVenda: parseSale(p.unidadeVenda),
    imagens: Array.isArray(p.imagens)
      ? p.imagens.map((v) => {
          const i = record(v),
            u = new URL(text(i.url));
          if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
            throw new InvalidResponse();
          return { url: u.href, alt: typeof i.alt === 'string' ? i.alt : undefined };
        })
      : [],
  };
}
