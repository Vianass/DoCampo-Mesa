import { record, text, id, number } from '../auctions/contracts';
import { InvalidResponse, parsePage } from '../api/catalog-contract';
import type { JsonResponseMetadata } from '../api/client';
export type TargetKind = 'produto' | 'produtor' | 'avaliacao';
export type VisibilityState = 'visivel' | 'oculta';
export type ReportState = 'pendente' | 'resolvida' | 'rejeitada';
export const targetLabels = {
  produto: 'Produto',
  produtor: 'Perfil do produtor',
  avaliacao: 'Avaliação',
};
export const reportLabels = {
  pendente: 'Pendente',
  resolvida: 'Resolvida',
  rejeitada: 'Rejeitada',
};
export const moderationBase = '/area/administrador/moderacao';
export interface Evidence {
  nome: string;
  descricao: string;
  imagens: { url: string; alt?: string }[];
  ingredientes?: string[];
  etiquetas?: string[];
  modoProducao?: string;
  classificacao?: number;
}
export interface OwnReport {
  id: string;
  alvoTipo: TargetKind;
  alvoId: string;
  motivo: string;
  estado: ReportState;
  criadaEm: string;
  atualizadaEm: string;
}
export interface Decision {
  administradorId: string;
  ocorridoEm: string;
  anterior: string;
  estado: string;
  motivo: string;
  versao: number;
}
export interface ContentView {
  id: string;
  tipo: TargetKind;
  evidencia: Evidence;
  estadoModeracao: VisibilityState;
  versao: number;
  etag: string;
  estadoComercial: string | null;
  perfilId: string | null;
}
export interface AdminReport extends OwnReport {
  autorId: string;
  evidencia: Evidence;
  versao: number;
  historico: Decision[];
  conteudoNaDecisao: { disponivel: boolean; estado?: VisibilityState; versao?: number } | null;
}
export interface ReportDetail extends AdminReport {
  conteudo: ContentView | null;
  etag: string;
}
const date = (v: unknown) => {
  const d = text(v);
  if (!Number.isFinite(Date.parse(d))) throw new InvalidResponse();
  return d;
};
const enumValue = <T extends string>(v: unknown, allowed: readonly T[]): T => {
  if (!allowed.includes(v as T)) throw new InvalidResponse();
  return v as T;
};
export const parseVisibility = (v: unknown): VisibilityState =>
  v === undefined ? 'visivel' : enumValue(v, ['visivel', 'oculta']);
function tag(v: unknown) {
  const t = text(v);
  if (!/^"[A-Za-z0-9_-]{43}"$/.test(t)) throw new InvalidResponse();
  return t;
}
export function parseEvidence(v: unknown): Evidence {
  const r = record(v);
  if (typeof r.descricao !== 'string' || !Array.isArray(r.imagens) || r.imagens.length > 2)
    throw new InvalidResponse();
  const value: Evidence = {
    nome: text(r.nome),
    descricao: r.descricao,
    imagens: r.imagens.map((v) => {
      const p = record(v),
        url = text(p.url),
        u = new URL(url);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
        throw new InvalidResponse();
      return { url, ...(p.alt === undefined ? {} : { alt: text(p.alt) }) };
    }),
  };
  for (const field of ['ingredientes', 'etiquetas'] as const)
    if (r[field] !== undefined) {
      if (!Array.isArray(r[field])) throw new InvalidResponse();
      value[field] = r[field].map(text);
    }
  if (r.modoProducao !== undefined) value.modoProducao = text(r.modoProducao);
  if (r.classificacao !== undefined) {
    value.classificacao = number(r.classificacao, 1);
    if (value.classificacao > 5) throw new InvalidResponse();
  }
  return value;
}
export function parseOwnReport(v: unknown): OwnReport {
  const r = record(v);
  return {
    id: id(r.id),
    alvoTipo: enumValue(r.alvoTipo, ['produto', 'produtor', 'avaliacao']),
    alvoId: id(r.alvoId),
    motivo: text(r.motivo),
    estado: enumValue(r.estado, ['pendente', 'resolvida', 'rejeitada']),
    criadaEm: date(r.criadaEm),
    atualizadaEm: date(r.atualizadaEm),
  };
}
export function parseOwnLookup(v: unknown) {
  const r = record(v);
  return { denuncia: r.denuncia === null ? null : parseOwnReport(r.denuncia) };
}
export function parseDecision(v: unknown): Decision {
  const r = record(v);
  return {
    administradorId: id(r.administradorId),
    ocorridoEm: date(r.ocorridoEm),
    anterior: text(r.anterior),
    estado: text(r.estado),
    motivo: text(r.motivo),
    versao: number(r.versao, 1),
  };
}
export function parseAdminReport(v: unknown): AdminReport {
  const r = record(v),
    own = parseOwnReport(r);
  if (!Array.isArray(r.historico) || r.historico.length > 1) throw new InvalidResponse();
  const historico = r.historico.map(parseDecision),
    versao = number(r.versao);
  if (
    versao !== historico.length ||
    (own.estado === 'pendente'
      ? versao !== 0
      : historico[0]?.estado !== own.estado ||
        historico[0]?.anterior !== 'pendente' ||
        historico[0]?.versao !== 1)
  )
    throw new InvalidResponse();
  let context: AdminReport['conteudoNaDecisao'] = null;
  if (r.conteudoNaDecisao !== null && r.conteudoNaDecisao !== undefined) {
    const c = record(r.conteudoNaDecisao);
    if (typeof c.disponivel !== 'boolean') throw new InvalidResponse();
    context = c.disponivel
      ? {
          disponivel: true,
          estado: enumValue<VisibilityState>(c.estado, ['visivel', 'oculta']),
          versao: number(c.versao),
        }
      : { disponivel: false };
  }
  if (own.estado !== 'pendente' && !context) throw new InvalidResponse();
  return {
    ...own,
    autorId: id(r.autorId),
    evidencia: parseEvidence(r.evidencia),
    versao,
    historico,
    conteudoNaDecisao: context,
  };
}
export function parseContent(v: unknown): ContentView {
  const r = record(v);
  return {
    id: id(r.id),
    tipo: enumValue(r.tipo, ['produto', 'produtor', 'avaliacao']),
    evidencia: parseEvidence(r.evidencia),
    estadoModeracao: enumValue(r.estadoModeracao, ['visivel', 'oculta']),
    versao: number(r.versao),
    etag: tag(r.etag),
    estadoComercial: r.estadoComercial === null ? null : text(r.estadoComercial),
    perfilId: r.perfilId === null ? null : id(r.perfilId),
  };
}
export function parseContentDetail(v: unknown, m: JsonResponseMetadata) {
  const c = parseContent(v);
  if (tag(m.etag) !== c.etag) throw new InvalidResponse();
  return c;
}
export function parseReportDetail(v: unknown, m: JsonResponseMetadata): ReportDetail {
  const r = record(v),
    result = parseAdminReport(r),
    content = r.conteudo === null ? null : parseContent(r.conteudo);
  if (content && (content.id !== result.alvoId || content.tipo !== result.alvoTipo))
    throw new InvalidResponse();
  const etag = tag(m.etag);
  if (etag !== tag(r.etag)) throw new InvalidResponse();
  return { ...result, conteudo: content, etag };
}
export const parseReports = (v: unknown) => parsePage(v, parseAdminReport);
export const parseContents = (v: unknown) => parsePage(v, parseContent);
export function parseContentHistory(v: unknown) {
  const r = record(v),
    p = parsePage(v, parseDecision),
    versao = number(r.versao);
  if (
    p.total !== versao ||
    p.itens.some(
      (e) =>
        e.versao > versao ||
        !['visivel', 'oculta'].includes(e.anterior) ||
        !['visivel', 'oculta'].includes(e.estado) ||
        e.anterior === e.estado,
    )
  )
    throw new InvalidResponse();
  return { ...p, versao };
}
export const contentPath = (kind: TargetKind, id: string) =>
  kind === 'avaliacao'
    ? moderationBase + '/' + id
    : moderationBase + '/' + (kind === 'produto' ? 'produtos' : 'perfis') + '/' + id;
