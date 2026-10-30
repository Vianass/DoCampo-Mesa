import { InvalidResponse, objectId, parsePage } from '../api/catalog-contract';
import { orderStates, parseOrder, type OwnOrder } from '../checkout/contracts';
export const ordersPath = '/area/administrador/encomendas';
export const ordersApi = '/admin/orders';
export const paymentStates = ['por_pagar', 'pagamento_comunicado', 'pago'] as const;
export type State = (typeof orderStates)[number];
export interface Participant {
  contaId: string;
  nomeAtual: string | null;
}
export interface Summary {
  id: string;
  criadaEm: string;
  comprador: Participant;
  produtor: Participant;
  totalCent: number;
  moeda: 'EUR';
  estado: State;
  pagamento: { metodo: string; estado: (typeof paymentStates)[number] };
  modalidade: 'levantamento' | 'entrega';
}
export interface Query {
  pagina: number;
  porPagina: 12 | 24 | 36;
  ordem: 'recentes' | 'antigas';
  estado: string;
  pagamento: string;
  produtor: string;
  comprador: string;
  identificador: string;
  desde: string;
  ate: string;
}
export const queryKeys = [
  'estado',
  'pagamento',
  'produtor',
  'comprador',
  'identificador',
  'desde',
  'ate',
] as const;
export function orderQuery(params: URLSearchParams): Query {
  const page = params.get('pagina') ?? '1',
    per = params.get('porPagina');
  return {
    pagina: /^[1-9]\d{0,3}$/.test(page) && Number(page) <= 1000 ? Number(page) : 1,
    porPagina: per === '24' ? 24 : per === '36' ? 36 : 12,
    ordem: params.get('ordem') === 'antigas' ? 'antigas' : 'recentes',
    ...(Object.fromEntries(queryKeys.map((k) => [k, params.get(k) ?? ''])) as Pick<
      Query,
      (typeof queryKeys)[number]
    >),
  };
}
export function orderSearch(query: Query) {
  const p = new URLSearchParams({
    pagina: String(query.pagina),
    porPagina: String(query.porPagina),
    ordem: query.ordem,
  });
  for (const key of queryKeys) if (query[key]) p.set(key, query[key]);
  return p.toString();
}
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new InvalidResponse();
  return v as Record<string, unknown>;
}
function text(v: unknown) {
  if (typeof v !== 'string' || !v.trim() || v.length > 20000) throw new InvalidResponse();
  return v;
}
function date(v: unknown) {
  const s = text(v);
  if (!Number.isFinite(Date.parse(s))) throw new InvalidResponse();
  return s;
}
function id(v: unknown) {
  const s = text(v);
  if (!objectId(s)) throw new InvalidResponse();
  return s;
}
function count(v: unknown) {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new InvalidResponse();
  return v;
}
function choice<T extends string>(v: unknown, choices: readonly T[]): T {
  if (!choices.includes(v as T)) throw new InvalidResponse();
  return v as T;
}
function participant(v: unknown): Participant {
  const r = obj(v);
  return { contaId: id(r.contaId), nomeAtual: r.nomeAtual === null ? null : text(r.nomeAtual) };
}
function payment(v: unknown) {
  const r = obj(v);
  return {
    metodo: choice(r.metodo, ['dinheiro', 'mb_way', 'transferencia_bancaria']),
    estado: choice(r.estado, paymentStates),
  };
}
export function parseSummary(v: unknown): Summary {
  const r = obj(v);
  if (r.moeda !== 'EUR') throw new InvalidResponse();
  return {
    id: id(r.id),
    criadaEm: date(r.criadaEm),
    comprador: participant(r.comprador),
    produtor: participant(r.produtor),
    totalCent: count(r.totalCent),
    moeda: 'EUR',
    estado: choice(r.estado, orderStates),
    pagamento: payment(r.pagamento),
    modalidade: choice(r.modalidade, ['levantamento', 'entrega']),
  };
}
export function parseAdminOrders(v: unknown) {
  const r = obj(v),
    page = parsePage(v, parseSummary),
    metrics = obj(r.indicadores),
    s = obj(metrics.porEstado);
  const porEstado = Object.fromEntries(orderStates.map((k) => [k, count(s[k])])) as Record<
    State,
    number
  >;
  if (
    count(metrics.numeroEncomendas) !== page.total ||
    Object.values(porEstado).reduce((a, b) => a + BigInt(b), 0n) !== BigInt(page.total)
  )
    throw new InvalidResponse();
  return { ...page, indicadores: { numeroEncomendas: page.total, porEstado } };
}
export interface AdminDetail {
  order: OwnOrder;
  comprador: Participant;
  produtor: Participant;
  entrega: {
    modalidade: 'levantamento' | 'entrega';
    inicioEm: string;
    fimEm: string;
    fusoHorario: string;
    local: string;
    concelhoId?: string;
  };
}
export function parseAdminOrder(v: unknown): AdminDetail {
  const r = obj(v),
    d = obj(r.entrega),
    p = obj(d.periodoInicial),
    mode = choice(d.modalidade, ['levantamento', 'entrega']);
  return {
    order: parseOrder(v),
    comprador: participant(r.comprador),
    produtor: participant(r.participanteProdutor),
    entrega: {
      modalidade: mode,
      inicioEm: date(p.inicioEm),
      fimEm: date(p.fimEm),
      fusoHorario: text(p.fusoHorario),
      local: text(mode === 'levantamento' ? d.localLevantamento : d.morada),
      ...(mode === 'entrega' ? { concelhoId: text(d.concelhoId) } : {}),
    },
  };
}
export type Domain = 'operacional' | 'pagamento';
export interface HistoryEvent {
  tipo: string;
  ocorridoEm: string;
  de?: string;
  para?: string;
  responsavel?: { tipo: 'sistema' | 'utilizador'; contaId?: string; papel?: string };
  justificacao?: string;
}
export function parseAdminHistory(v: unknown) {
  const r = obj(v),
    dominio = choice(r.dominio, ['operacional', 'pagamento']);
  const page = parsePage(v, (v): HistoryEvent => {
    const e = obj(v),
      actor = e.responsavel === undefined ? undefined : obj(e.responsavel),
      values = dominio === 'operacional' ? orderStates : paymentStates;
    return {
      tipo: text(e.tipo),
      ocorridoEm: date(e.ocorridoEm),
      ...(e.de !== undefined ? { de: choice(e.de, values) } : {}),
      ...(e.para !== undefined ? { para: choice(e.para, values) } : {}),
      ...(actor
        ? {
            responsavel:
              actor.tipo === 'sistema'
                ? { tipo: 'sistema' as const }
                : {
                    tipo: choice(actor.tipo, ['utilizador']),
                    contaId: id(actor.contaId),
                    papel: choice(actor.papel, ['comprador', 'produtor', 'administrador']),
                  },
          }
        : {}),
      ...(e.justificacao ? { justificacao: text(e.justificacao) } : {}),
    };
  });
  return { ...page, dominio };
}
