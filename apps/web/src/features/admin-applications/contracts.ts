import { InvalidResponse, objectId, type PageDto } from '../api/catalog-contract';
import type { JsonResponseMetadata } from '../api/client';
import {
  parseApplication,
  type ApplicationAttempt,
  type ProducerApplication,
} from '../producer-application/model';

export const adminApplicationsPath = '/area/administrador/candidaturas';
export const adminApplicationsApi = '/admin/producer-applications';
export type ApplicationStatus = ProducerApplication['estado'];
export type Decision = Exclude<ApplicationStatus, 'pendente'>;
export interface ApplicationSummary {
  id: string;
  utilizadorId: string;
  nomePublico: string;
  estado: ApplicationStatus;
  submetidaEm: string;
}
export type AdministrativeAttempt = ApplicationAttempt & { administradorId?: string };
export interface AdministrativeApplication extends ProducerApplication {
  utilizadorId: string;
  administradorId?: string;
  historico: AdministrativeAttempt[];
  etag: string;
}
export type ApplicationList = PageDto<ApplicationSummary>;
export interface ApplicationQuery {
  pagina: number;
  porPagina: 12 | 24 | 36;
  estado: ApplicationStatus | '';
  ordem: 'recentes' | 'antigas';
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidResponse();
  return value as Record<string, unknown>;
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new InvalidResponse();
  return value;
}
function id(value: unknown) {
  const result = text(value);
  if (!objectId(result)) throw new InvalidResponse();
  return result;
}
function integer(value: unknown, minimum = 0) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum)
    throw new InvalidResponse();
  return value;
}
export function parseApplicationList(value: unknown): ApplicationList {
  const source = record(value);
  if (!Array.isArray(source.itens)) throw new InvalidResponse();
  const pagina = integer(source.pagina, 1),
    porPagina = integer(source.porPagina, 1),
    total = integer(source.total),
    totalPaginas = integer(source.totalPaginas);
  if (
    pagina > 1000 ||
    ![12, 24, 36].includes(porPagina) ||
    totalPaginas !== Math.ceil(total / porPagina)
  )
    throw new InvalidResponse();
  const itens = source.itens.map((raw): ApplicationSummary => {
    const item = record(raw),
      estado = item.estado;
    if (estado !== 'pendente' && estado !== 'aprovado' && estado !== 'rejeitado')
      throw new InvalidResponse();
    const submetidaEm = text(item.submetidaEm);
    if (!Number.isFinite(Date.parse(submetidaEm))) throw new InvalidResponse();
    return {
      id: id(item.id),
      utilizadorId: id(item.utilizadorId),
      nomePublico: text(item.nomePublico),
      estado,
      submetidaEm,
    };
  });
  const expected = Math.max(0, Math.min(porPagina, total - (pagina - 1) * porPagina));
  if (itens.length !== expected || new Set(itens.map((item) => item.id)).size !== itens.length)
    throw new InvalidResponse();
  return { itens, pagina, porPagina, total, totalPaginas };
}
export function parseAdministrativeApplication(
  value: unknown,
  metadata: JsonResponseMetadata,
): AdministrativeApplication {
  const source = record(value),
    projected = parseApplication(value);
  if (!metadata.etag || !/^"[A-Za-z0-9_-]{43}"$/.test(metadata.etag)) throw new InvalidResponse();
  const actor = (raw: unknown) => (raw === undefined ? undefined : id(record(raw).administradorId));
  return {
    ...projected,
    utilizadorId: id(source.utilizadorId),
    administradorId: actor(source.decisao),
    historico: projected.historico.map((attempt, index) => ({
      ...attempt,
      administradorId: actor(record((source.historico as unknown[])[index]).decisao),
    })),
    etag: metadata.etag,
  };
}
export function applicationQuery(params: URLSearchParams): ApplicationQuery {
  const raw = params.get('pagina') ?? '1',
    size = Number(params.get('porPagina') ?? 12),
    state = params.get('estado');
  return {
    pagina: /^[1-9]\d{0,3}$/.test(raw) && Number(raw) <= 1000 ? Number(raw) : 1,
    porPagina: size === 24 || size === 36 ? size : 12,
    estado: state === 'pendente' || state === 'aprovado' || state === 'rejeitado' ? state : '',
    ordem: params.get('ordem') === 'antigas' ? 'antigas' : 'recentes',
  };
}
export function queryString(query: ApplicationQuery) {
  const params = new URLSearchParams({
    pagina: String(query.pagina),
    porPagina: String(query.porPagina),
    ordem: query.ordem,
  });
  if (query.estado) params.set('estado', query.estado);
  return params.toString();
}
export function rejectionReason(value: string) {
  return value.normalize('NFC').trim();
}
export function validateRejection(value: string) {
  const reason = rejectionReason(value);
  return !reason
    ? 'Explica o motivo da rejeição.'
    : [...reason].length > 2000
      ? 'Utiliza até 2000 caracteres no motivo.'
      : undefined;
}
