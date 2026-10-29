import { InvalidResponse, objectId } from '../api/catalog-contract';

export const applicationPath = '/area/candidatura-produtor';
export const applicationFields = {
  nomePublico: { label: 'Nome público do produtor', maximum: 160 },
  localidade: { label: 'Localidade', maximum: 120 },
  concelho: { label: 'Concelho', maximum: 120 },
  descricao: { label: 'Descrição da atividade', maximum: 5000 },
  telefone: { label: 'Telefone de contacto', maximum: 120 },
} as const;
export type ApplicationField = keyof typeof applicationFields;
export type ApplicationInput = Record<ApplicationField, string>;
export type ApplicationErrors = Partial<Record<ApplicationField, string>>;
export interface ApplicationDecision {
  data: string;
  justificacao?: string;
}
export interface ApplicationAttempt extends ApplicationInput {
  estado: 'pendente' | 'aprovado' | 'rejeitado';
  submetidaEm: string;
  decisao?: ApplicationDecision;
}
export interface ProducerApplication extends ApplicationAttempt {
  id: string;
  historico: ApplicationAttempt[];
}
export const stateLabels = { pendente: 'Em análise', aprovado: 'Aprovada', rejeitado: 'Rejeitada' };
export function emptyInput(): ApplicationInput {
  return { nomePublico: '', localidade: '', concelho: '', descricao: '', telefone: '' };
}
export function applicationInput(value: ApplicationInput): ApplicationInput {
  return Object.fromEntries(
    Object.keys(applicationFields).map((key) => [
      key,
      value[key as ApplicationField].normalize('NFC').trim(),
    ]),
  ) as ApplicationInput;
}
export function validateApplication(value: ApplicationInput): ApplicationErrors {
  const input = applicationInput(value),
    errors: ApplicationErrors = {};
  for (const field of Object.keys(applicationFields) as ApplicationField[]) {
    const { label, maximum } = applicationFields[field];
    if (!input[field]) errors[field] = `${label}: preenche este campo.`;
    else if ([...input[field]].length > maximum)
      errors[field] = `${label}: utiliza até ${maximum} caracteres.`;
  }
  return errors;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidResponse();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new InvalidResponse();
  return value;
}
function instant(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new InvalidResponse();
  return result;
}
function attempt(value: unknown): ApplicationAttempt {
  const source = record(value),
    state = source.estado;
  if (typeof state !== 'string' || !['pendente', 'aprovado', 'rejeitado'].includes(state))
    throw new InvalidResponse();
  const input = Object.fromEntries(
    Object.keys(applicationFields).map((key) => [key, text(source[key])]),
  ) as ApplicationInput;
  const result: ApplicationAttempt = {
    ...input,
    estado: state as ApplicationAttempt['estado'],
    submetidaEm: instant(source.submetidaEm),
  };
  if (state === 'pendente') {
    if (source.decisao !== undefined) throw new InvalidResponse();
  } else {
    const decision = record(source.decisao);
    const data = instant(decision.data);
    if (Date.parse(data) < Date.parse(result.submetidaEm)) throw new InvalidResponse();
    const justificacao =
      decision.justificacao === undefined ? undefined : text(decision.justificacao);
    if (state === 'rejeitado' && !justificacao) throw new InvalidResponse();
    result.decisao = { data, ...(justificacao ? { justificacao } : {}) };
  }
  return result;
}
/** Projeção própria: não guarda campos administrativos ou extras devolvidos pelo serviço. */
export function parseApplication(value: unknown): ProducerApplication {
  const source = record(value),
    id = text(source.id);
  if (!objectId(id) || !Array.isArray(source.historico)) throw new InvalidResponse();
  const historico = source.historico.map((entry) => {
    const result = attempt(entry);
    if (result.estado !== 'rejeitado') throw new InvalidResponse();
    return result;
  });
  return { ...attempt(source), id, historico };
}
