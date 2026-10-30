import { InvalidResponse, objectId, type PageDto } from '../api/catalog-contract';
import { isRole, type Role } from '../auth/types';
import type { JsonResponseMetadata } from '../api/client';
import { applicationQuery, queryString } from '../admin-applications/contracts';
export const usersPath = '/area/administrador/utilizadores',
  adminApi = '/admin/users';
export const metricLabels = {
  totalUtilizadores: 'Utilizadores registados',
  compradoresAtivos: 'Compradores ativos',
  produtoresAprovados: 'Produtores aprovados',
  candidaturasPendentes: 'Candidaturas pendentes',
  produtosPublicados: 'Produtos publicados',
  encomendas: 'Encomendas registadas',
  leiloesAtivos: 'Leilões ativos',
} as const;
export type Dashboard = { observadoEm: string } & Record<keyof typeof metricLabels, number>;
export interface AdminUser {
  id: string;
  nome: string;
  email: string;
  papeis: Role[];
  ativo: boolean;
  registadoEm: string;
}
export interface AdminUserDetail extends AdminUser {
  capacidades: { comprar: boolean; vender: boolean; administrar: boolean };
  etag: string;
}
export interface AccountAudit {
  id: string;
  administradorId: string;
  ativoAnterior: boolean;
  ativoAtual: boolean;
  motivo: string;
  ocorridoEm: string;
}
export interface UserQuery {
  pagina: number;
  porPagina: 12 | 24 | 36;
  ordem: 'recentes' | 'antigas';
  pesquisa: string;
  estado: '' | 'ativo' | 'inativo';
  papel: '' | Role;
}
function check(condition: unknown): asserts condition {
  if (!condition) throw new InvalidResponse();
}
function record(value: unknown): Record<string, unknown> {
  check(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function text(value: unknown) {
  check(typeof value === 'string' && value.trim());
  return value;
}
function id(value: unknown) {
  const v = text(value);
  check(objectId(v));
  return v;
}
function date(value: unknown) {
  const v = text(value);
  check(Number.isFinite(Date.parse(v)));
  return v;
}
export function parseDashboard(value: unknown): Dashboard {
  const r = record(value),
    result = { observadoEm: date(r.observadoEm) } as Dashboard;
  for (const key of Object.keys(metricLabels) as (keyof typeof metricLabels)[]) {
    check(typeof r[key] === 'number' && Number.isSafeInteger(r[key]) && r[key] >= 0);
    result[key] = r[key];
  }
  return result;
}
export function parseUser(value: unknown): AdminUser {
  const r = record(value);
  check(
    Array.isArray(r.papeis) &&
      r.papeis.length > 0 &&
      r.papeis.every((p) => typeof p === 'string' && isRole(p)) &&
      new Set(r.papeis).size === r.papeis.length,
  );
  check(typeof r.ativo === 'boolean');
  return {
    id: id(r.id),
    nome: text(r.nome),
    email: text(r.email),
    papeis: r.papeis as Role[],
    ativo: r.ativo,
    registadoEm: date(r.registadoEm),
  };
}
export function parseUserDetail(value: unknown, meta: JsonResponseMetadata): AdminUserDetail {
  const r = record(value),
    caps = record(r.capacidades),
    base = parseUser(r);
  check(meta.etag && /^"[A-Za-z0-9_-]{43}"$/.test(meta.etag));
  for (const key of ['comprar', 'vender', 'administrar']) check(typeof caps[key] === 'boolean');
  check(base.ativo || !Object.values(caps).some(Boolean));
  check(caps.comprar === (base.ativo && base.papeis.includes('comprador')));
  check(caps.administrar === (base.ativo && base.papeis.includes('administrador')));
  check(!caps.vender || (base.ativo && base.papeis.includes('produtor')));
  return {
    ...base,
    capacidades: {
      comprar: caps.comprar as boolean,
      vender: caps.vender as boolean,
      administrar: caps.administrar as boolean,
    },
    etag: meta.etag,
  };
}
export function parseAudit(value: unknown): AccountAudit {
  const r = record(value);
  check(
    typeof r.ativoAnterior === 'boolean' &&
      typeof r.ativoAtual === 'boolean' &&
      r.ativoAnterior !== r.ativoAtual,
  );
  return {
    id: id(r.id),
    administradorId: id(r.administradorId),
    ativoAnterior: r.ativoAnterior,
    ativoAtual: r.ativoAtual,
    motivo: text(r.motivo),
    ocorridoEm: date(r.ocorridoEm),
  };
}
export function parsePage<T extends { id: string }>(
  value: unknown,
  parse: (v: unknown) => T,
): PageDto<T> {
  const r = record(value);
  for (const k of ['pagina', 'porPagina', 'total', 'totalPaginas'])
    check(typeof r[k] === 'number' && Number.isSafeInteger(r[k]) && r[k] >= 0);
  const pagina = r.pagina as number,
    porPagina = r.porPagina as number,
    total = r.total as number,
    totalPaginas = r.totalPaginas as number;
  check(
    pagina >= 1 &&
      pagina <= 1000 &&
      [12, 24, 36].includes(porPagina) &&
      totalPaginas === Math.ceil(total / porPagina) &&
      Array.isArray(r.itens),
  );
  const itens = r.itens.map(parse);
  check(
    itens.length === Math.max(0, Math.min(porPagina, total - (pagina - 1) * porPagina)) &&
      new Set(itens.map((i) => i.id)).size === itens.length,
  );
  return { itens, pagina, porPagina, total, totalPaginas };
}
export const parseUsers = (v: unknown) => parsePage(v, parseUser);
export const parseAudits = (v: unknown) => parsePage(v, parseAudit);
export function userQuery(params: URLSearchParams): UserQuery {
  const base = applicationQuery(params),
    state = params.get('estado'),
    role = params.get('papel');
  return {
    pagina: base.pagina,
    porPagina: base.porPagina,
    ordem: base.ordem,
    estado: state === 'ativo' || state === 'inativo' ? state : '',
    papel: role && isRole(role) ? role : '',
    pesquisa: (params.get('pesquisa') ?? '').normalize('NFC').trim().slice(0, 100),
  };
}
export function userSearch(q: UserQuery) {
  const p = new URLSearchParams(queryString({ ...q, estado: '' }));
  for (const k of ['estado', 'papel', 'pesquisa'] as const) if (q[k]) p.set(k, q[k]);
  return p.toString();
}
export function reasonError(value: string) {
  return !value.normalize('NFC').trim()
    ? 'Indica o motivo da alteração.'
    : [...value.normalize('NFC').trim()].length > 2000
      ? 'Utiliza até 2000 caracteres.'
      : undefined;
}

export function userPageParser(search: string) {
  const q = userQuery(new URLSearchParams(search));
  return (v: unknown) => {
    const d = parseUsers(v);
    if (
      d.pagina !== q.pagina ||
      d.porPagina !== q.porPagina ||
      d.itens.some(
        (i) =>
          (q.estado && i.ativo !== (q.estado === 'ativo')) ||
          (q.papel && !i.papeis.includes(q.papel)),
      )
    )
      throw new InvalidResponse();
    return d;
  };
}
