import {
  InvalidResponse,
  objectId,
  parsePage,
  parseSale,
  type PageDto,
} from '../api/catalog-contract';
import type { SaleUnit } from '../../types/market';
export interface OrderPeriod {
  inicioEm: string;
  fimEm: string;
  fusoHorario: string;
}
export interface AcceptedLine {
  produtoId: string;
  produtorContaId: string;
  quantidade: number;
  ofertaAceite: {
    precoReferenciaCent: number;
    unidadeVenda: SaleUnit;
    revisaoProdutoObservada: number;
  };
}
export interface ProducerChoice {
  produtorContaId: string;
  modalidade: 'levantamento' | 'entrega';
  periodo: OrderPeriod;
  metodoPagamento: string;
  taxaEntregaAceiteCent: number;
  revisaoProdutorObservada: number;
  concelhoId?: string;
  morada?: string;
  contacto?: string;
}
export interface CheckoutRequest {
  linhas: AcceptedLine[];
  condicoesPorProdutor: ProducerChoice[];
}
export interface PreparedLine extends AcceptedLine {
  nome: string;
  stockDisponivel: number;
  subtotalCent: number;
}
export interface WeeklyPeriod {
  diaSemana: number;
  inicio: string;
  fim: string;
}
export interface PreparedProducer {
  produtorContaId: string;
  perfilId: string;
  nome: string;
  revisaoProdutorObservada: number;
  comercial: {
    modalidades: { levantamento: boolean; entrega: boolean };
    localLevantamento?: string;
    taxaEntregaCent?: number;
    concelhosEntregaIds: string[];
    metodosPagamento: string[];
    disponibilidade: { fusoHorario: string; levantamento: WeeklyPeriod[]; entrega: WeeklyPeriod[] };
  };
}
export interface Preparation {
  linhas: PreparedLine[];
  produtores: PreparedProducer[];
  moeda: 'EUR';
}
export interface Receipt {
  operacaoCompraId: string;
  criadaEm: string;
  encomendas: {
    orderId: string;
    produtorContaId: string;
    estadoInicial: 'pendente';
    totalCent: number;
  }[];
  totalCent: number;
  moeda: 'EUR';
  origem: 'nova' | 'replay';
}
export interface OwnOrder {
  id: string;
  operacaoCompraId: string;
  produtorContaId: string;
  produtor?: { perfilId: string; nomePublico: string };
  estado: string;
  linhas: {
    id: string;
    produtoId: string;
    nome: string;
    quantidade: number;
    precoReferenciaCent: number;
    unidadeVenda: SaleUnit;
    subtotalCent: number;
  }[];
  subtotalProdutosCent: number;
  taxaEntregaCent: number;
  totalCent: number;
  moeda: 'EUR';
  pagamento: { metodo: string; estado: string };
  criadaEm: string;
  atualizadaEm: string;
  entrega?: {
    modalidade: 'levantamento' | 'entrega';
    periodoInicial: OrderPeriod;
    taxaEntregaCent: number;
    localLevantamento?: string;
    concelhoId?: string;
    morada?: string;
    contacto?: string;
  };
  historicoEstado?: { tipo: string; de?: string; para?: string; ocorridoEm: string }[];
}
export interface Checkpoint {
  referencia: string;
  expiraEm: string;
}
export interface RecoveredAttempt extends Checkpoint {
  chaveIdempotencia: string;
  pedido: CheckoutRequest;
}
function fail(): never {
  throw new InvalidResponse();
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail();
  return v as Record<string, unknown>;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v.trim() || v.length > 20000) return fail();
  return v;
}
function num(v: unknown, min = 0): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min) return fail();
  return v;
}
function id(v: unknown): string {
  const value = text(v);
  if (!objectId(value)) return fail();
  return value;
}
function date(v: unknown): string {
  const value = text(v);
  if (!Number.isFinite(Date.parse(value))) return fail();
  return value;
}
function list<T>(v: unknown, parse: (v: unknown) => T, max = 100): T[] {
  if (!Array.isArray(v) || v.length > max) return fail();
  return v.map(parse);
}
function choice<T extends string>(v: unknown, values: readonly T[]): T {
  if (!values.includes(v as T)) return fail();
  return v as T;
}
export const orderStates = [
  'pendente',
  'confirmada',
  'em_preparacao',
  'pronta',
  'concluida',
  'cancelada',
] as const;
export const paymentMethods = ['dinheiro', 'mb_way', 'transferencia_bancaria'] as const;
export const paymentLabels: Record<string, string> = {
  dinheiro: 'Dinheiro',
  mb_way: 'MB WAY',
  transferencia_bancaria: 'Transferência bancária',
};
export const stateLabels: Record<string, string> = {
  pendente: 'Pendente',
  confirmada: 'Confirmada',
  em_preparacao: 'Em preparação',
  pronta: 'Pronta',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  por_pagar: 'Por pagar',
  pagamento_comunicado: 'Pagamento comunicado',
  pago: 'Pago',
};
function period(v: unknown): OrderPeriod {
  const r = record(v);
  return { inicioEm: date(r.inicioEm), fimEm: date(r.fimEm), fusoHorario: text(r.fusoHorario) };
}
export function parseAcceptedLine(v: unknown): AcceptedLine {
  const r = record(v),
    offer = record(r.ofertaAceite);
  return {
    produtoId: id(r.produtoId),
    produtorContaId: id(r.produtorContaId),
    quantidade: num(r.quantidade, 1),
    ofertaAceite: {
      precoReferenciaCent: num(offer.precoReferenciaCent, 1),
      unidadeVenda: parseSale(offer.unidadeVenda),
      revisaoProdutoObservada: num(offer.revisaoProdutoObservada),
    },
  };
}
function parseChoice(v: unknown): ProducerChoice {
  const r = record(v),
    mode = choice(r.modalidade, ['levantamento', 'entrega']);
  return {
    produtorContaId: id(r.produtorContaId),
    modalidade: mode,
    periodo: period(r.periodo),
    metodoPagamento: choice(r.metodoPagamento, paymentMethods),
    taxaEntregaAceiteCent: num(r.taxaEntregaAceiteCent),
    revisaoProdutorObservada: num(r.revisaoProdutorObservada),
    ...(mode === 'entrega'
      ? { concelhoId: text(r.concelhoId), morada: text(r.morada), contacto: text(r.contacto) }
      : {}),
  };
}
function parseProducer(v: unknown): PreparedProducer {
  const r = record(v),
    c = record(r.comercial),
    m = record(c.modalidades),
    d = record(c.disponibilidade);
  if (typeof m.levantamento !== 'boolean' || typeof m.entrega !== 'boolean') return fail();
  const windows = (v: unknown) =>
    list(
      v,
      (v) => {
        const w = record(v),
          day = num(w.diaSemana, 1);
        if (day > 7) return fail();
        const start = text(w.inicio),
          end = text(w.fim);
        if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return fail();
        return { diaSemana: day, inicio: start, fim: end };
      },
      1000,
    );
  return {
    produtorContaId: id(r.produtorContaId),
    perfilId: id(r.perfilId),
    nome: text(r.nome),
    revisaoProdutorObservada: num(r.revisaoProdutorObservada),
    comercial: {
      modalidades: { levantamento: m.levantamento, entrega: m.entrega },
      ...(c.localLevantamento !== undefined
        ? { localLevantamento: text(c.localLevantamento) }
        : {}),
      ...(c.taxaEntregaCent !== undefined ? { taxaEntregaCent: num(c.taxaEntregaCent) } : {}),
      concelhosEntregaIds: list(c.concelhosEntregaIds, text, 1000),
      metodosPagamento: list(c.metodosPagamento, (v) => choice(v, paymentMethods), 3),
      disponibilidade: {
        fusoHorario: text(d.fusoHorario),
        levantamento: windows(d.levantamento),
        entrega: windows(d.entrega),
      },
    },
  };
}
export function parsePreparation(v: unknown): Preparation {
  const r = record(v);
  const result = {
    linhas: list(r.linhas, (v) => {
      const r = record(v);
      return {
        ...parseAcceptedLine(v),
        nome: text(r.nome),
        stockDisponivel: num(r.stockDisponivel),
        subtotalCent: num(r.subtotalCent, 1),
      };
    }),
    produtores: list(r.produtores, parseProducer, 10),
    moeda: choice(r.moeda, ['EUR']),
  };
  if (
    !result.linhas.length ||
    !result.produtores.length ||
    new Set(result.linhas.map((l) => l.produtoId)).size !== result.linhas.length ||
    new Set(result.produtores.map((p) => p.produtorContaId)).size !== result.produtores.length ||
    result.linhas.some(
      (l) => !result.produtores.some((p) => p.produtorContaId === l.produtorContaId),
    )
  )
    return fail();
  return result;
}
export function parseReceipt(v: unknown): Receipt {
  const r = record(v);
  const result = {
    operacaoCompraId: text(r.operacaoCompraId),
    criadaEm: date(r.criadaEm),
    encomendas: list(
      r.encomendas,
      (v) => {
        const e = record(v);
        return {
          orderId: id(e.orderId),
          produtorContaId: id(e.produtorContaId),
          estadoInicial: choice(e.estadoInicial, ['pendente']),
          totalCent: num(e.totalCent, 1),
        };
      },
      10,
    ),
    totalCent: num(r.totalCent, 1),
    moeda: choice(r.moeda, ['EUR']),
    origem: choice(r.origem, ['nova', 'replay']),
  };
  if (
    !result.encomendas.length ||
    new Set(result.encomendas.map((o) => o.orderId)).size !== result.encomendas.length ||
    result.encomendas.reduce((t, o) => t + BigInt(o.totalCent), 0n) !== BigInt(result.totalCent)
  )
    return fail();
  return result;
}
export function parseOrder(v: unknown): OwnOrder {
  const r = record(v),
    p = record(r.pagamento);
  const result: OwnOrder = {
    id: id(r.id),
    operacaoCompraId: text(r.operacaoCompraId),
    produtorContaId: id(r.produtorContaId),
    estado: choice(r.estado, orderStates),
    linhas: list(r.linhas, (v) => {
      const l = record(v);
      return {
        id: text(l.id),
        produtoId: id(l.produtoId),
        nome: text(l.nome),
        quantidade: num(l.quantidade, 1),
        precoReferenciaCent: num(l.precoReferenciaCent, 1),
        unidadeVenda: parseSale(l.unidadeVenda),
        subtotalCent: num(l.subtotalCent, 1),
      };
    }),
    subtotalProdutosCent: num(r.subtotalProdutosCent, 1),
    taxaEntregaCent: num(r.taxaEntregaCent),
    totalCent: num(r.totalCent, 1),
    moeda: choice(r.moeda, ['EUR']),
    pagamento: {
      metodo: choice(p.metodo, paymentMethods),
      estado: choice(p.estado, ['por_pagar', 'pagamento_comunicado', 'pago']),
    },
    criadaEm: date(r.criadaEm),
    atualizadaEm: date(r.atualizadaEm),
  };
  if (
    result.linhas.reduce((t, l) => t + BigInt(l.subtotalCent), 0n) !==
      BigInt(result.subtotalProdutosCent) ||
    BigInt(result.subtotalProdutosCent) + BigInt(result.taxaEntregaCent) !==
      BigInt(result.totalCent)
  )
    return fail();
  if (r.produtor) {
    const producer = record(r.produtor);
    result.produtor = { perfilId: id(producer.perfilId), nomePublico: text(producer.nomePublico) };
  }
  return result;
}
export function parseOrderDetail(v: unknown): OwnOrder {
  const result = parseOrder(v),
    r = record(v),
    d = record(r.entrega),
    mode = choice(d.modalidade, ['levantamento', 'entrega']);
  result.entrega = {
    modalidade: mode,
    periodoInicial: period(d.periodoInicial),
    taxaEntregaCent: num(d.taxaEntregaCent),
    ...(mode === 'levantamento'
      ? { localLevantamento: text(d.localLevantamento) }
      : { concelhoId: text(d.concelhoId), morada: text(d.morada), contacto: text(d.contacto) }),
  };
  result.historicoEstado = list(
    r.historicoEstado,
    (v) => {
      const e = record(v);
      return {
        tipo: text(e.tipo),
        ocorridoEm: date(e.ocorridoEm),
        ...(e.de !== undefined ? { de: choice(e.de, orderStates) } : {}),
        ...(e.para !== undefined ? { para: choice(e.para, orderStates) } : {}),
      };
    },
    1000,
  );
  return result;
}
export const parseOrders = (v: unknown): PageDto<OwnOrder> => parsePage(v, parseOrder);
export function parseCheckpoint(v: unknown): Checkpoint {
  const r = record(v),
    reference = text(r.referencia);
  if (!/^[a-f0-9-]{36}$/i.test(reference)) return fail();
  return { referencia: reference, expiraEm: date(r.expiraEm) };
}
export function parseRecoveredAttempt(v: unknown): RecoveredAttempt {
  const r = record(v),
    p = record(r.pedido);
  return {
    ...parseCheckpoint(v),
    chaveIdempotencia: text(r.chaveIdempotencia),
    pedido: {
      linhas: list(p.linhas, parseAcceptedLine),
      condicoesPorProdutor: list(p.condicoesPorProdutor, parseChoice, 10),
    },
  };
}
