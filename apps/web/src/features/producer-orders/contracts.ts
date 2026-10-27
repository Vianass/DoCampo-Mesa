import { InvalidResponse, parsePage, type PageDto } from '../api/catalog-contract';
import type { JsonResponseMetadata } from '../api/client';
import { orderStates, parseOrder, parseOrderDetail, type OwnOrder } from '../checkout/contracts';

export type OrderState = (typeof orderStates)[number];
export interface SalesIndicators {
  numeroEncomendas: number;
  porEstado: Record<OrderState, number>;
  valorConcluidasCent: number;
  estadoVendas: 'concluida';
}
export interface ProducerOrder extends OwnOrder {
  modalidade: 'levantamento' | 'entrega';
}
export interface ProducerOrderDetail extends OwnOrder {
  acoesPermitidas: OrderState[];
  etag: string;
}
export interface ProducerOrderPage extends PageDto<ProducerOrder> {
  indicadores: SalesIndicators;
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new InvalidResponse();
  return v as Record<string, unknown>;
}
function count(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new InvalidResponse();
  return v;
}
export function parseProducerOrders(value: unknown): ProducerOrderPage {
  const raw = object(value),
    summary = object(raw.indicadores),
    states = object(summary.porEstado);
  const page = parsePage<ProducerOrder>(value, (v) => {
    const row = object(v);
    if (row.modalidade !== 'levantamento' && row.modalidade !== 'entrega')
      throw new InvalidResponse();
    return { ...parseOrder(v), modalidade: row.modalidade };
  });
  const porEstado = Object.fromEntries(orderStates.map((s) => [s, count(states[s])])) as Record<
    OrderState,
    number
  >;
  const numeroEncomendas = count(summary.numeroEncomendas);
  if (
    summary.estadoVendas !== 'concluida' ||
    Object.values(porEstado).reduce((a, b) => a + BigInt(b), 0n) !== BigInt(numeroEncomendas) ||
    page.total > numeroEncomendas
  )
    throw new InvalidResponse();
  return {
    ...page,
    indicadores: {
      numeroEncomendas,
      porEstado,
      estadoVendas: 'concluida',
      valorConcluidasCent: count(summary.valorConcluidasCent),
    },
  };
}
export function parseProducerOrder(
  value: unknown,
  metadata: JsonResponseMetadata,
): ProducerOrderDetail {
  const raw = object(value),
    actions = raw.acoesPermitidas;
  if (
    !Array.isArray(actions) ||
    actions.length > 1 ||
    actions.some((a) => !['confirmada', 'em_preparacao', 'pronta'].includes(a)) ||
    !metadata.etag ||
    !/^"[A-Za-z0-9_-]{43}"$/.test(metadata.etag)
  )
    throw new InvalidResponse();
  return {
    ...parseOrderDetail(value),
    acoesPermitidas: actions as OrderState[],
    etag: metadata.etag,
  };
}
export const producerActionLabels: Partial<Record<OrderState, string>> = {
  confirmada: 'Confirmar encomenda',
  em_preparacao: 'Iniciar preparação',
  pronta: 'Marcar como pronta',
};
