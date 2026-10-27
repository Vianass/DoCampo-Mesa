import type { CartItem, CartPurchaseLine } from '../cart/types';
import { cartSignature } from '../cart/model';
export { cartSignature } from '../cart/model';
import type {
  CheckoutRequest,
  Preparation,
  PreparedProducer,
  ProducerChoice,
  WeeklyPeriod,
} from './contracts';
export type PurchaseLine = CartPurchaseLine;
export interface PendingPurchase {
  referencia: string;
  baseline: PurchaseLine[];
  submitted: boolean;
  confirmed: boolean;
  cleaned: boolean;
}
export const pendingPurchaseKey = 'docampo.checkout.pending.v1';
export function cartKey(items: readonly CartItem[]) {
  return JSON.stringify(items.map(cartSignature));
}
export function readPending(): PendingPurchase | undefined {
  try {
    const raw = localStorage.getItem(pendingPurchaseKey);
    if (!raw) return;
    const v = JSON.parse(raw);
    if (
      !v ||
      typeof v !== 'object' ||
      !/^[a-f0-9-]{36}$/i.test(v.referencia) ||
      !Array.isArray(v.baseline) ||
      v.baseline.length > 100 ||
      !['submitted', 'confirmed', 'cleaned'].every((k) => typeof v[k] === 'boolean')
    )
      return;
    const baseline = v.baseline.map((l: unknown) => {
      if (!l || typeof l !== 'object') throw Error();
      const r = l as Record<string, unknown>;
      if (
        typeof r.productId !== 'string' ||
        typeof r.quantity !== 'number' ||
        !Number.isSafeInteger(r.quantity) ||
        r.quantity < 1 ||
        typeof r.stamp !== 'string' ||
        r.stamp.length > 100 ||
        typeof r.signature !== 'string' ||
        r.signature.length > 10000
      )
        throw Error();
      return {
        productId: r.productId,
        quantity: r.quantity,
        stamp: r.stamp,
        signature: r.signature,
      };
    });
    return {
      referencia: v.referencia,
      baseline,
      submitted: v.submitted,
      confirmed: v.confirmed,
      cleaned: v.cleaned,
    };
  } catch {
    return;
  }
}
export function savePending(value: PendingPurchase): boolean {
  try {
    localStorage.setItem(
      pendingPurchaseKey,
      JSON.stringify({
        referencia: value.referencia,
        submitted: value.submitted,
        confirmed: value.confirmed,
        cleaned: value.cleaned,
        baseline: value.baseline.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          stamp: line.stamp,
          signature: line.signature,
        })),
      }),
    );
    return readPending()?.referencia === value.referencia;
  } catch {
    return false;
  }
}
export function clearPending(reference: string) {
  try {
    if (readPending()?.referencia === reference) localStorage.removeItem(pendingPurchaseKey);
  } catch {
    /* Mantém a referência se o browser recusar a escrita. */
  }
}
export function checkoutBody(preparation: Preparation, choices: ProducerChoice[]): CheckoutRequest {
  if (
    choices.length !== preparation.produtores.length ||
    new Set(choices.map((c) => c.produtorContaId)).size !== choices.length ||
    choices.some(
      (choice) => !preparation.produtores.some((p) => p.produtorContaId === choice.produtorContaId),
    )
  )
    throw Error('Condições incompletas.');
  return {
    linhas: preparation.linhas.map(({ produtoId, produtorContaId, quantidade, ofertaAceite }) => ({
      produtoId,
      produtorContaId,
      quantidade,
      ofertaAceite,
    })),
    condicoesPorProdutor: choices,
  };
}
export function defaultModality(producer: PreparedProducer): 'levantamento' | 'entrega' {
  return producer.comercial.modalidades.levantamento && producer.comercial.localLevantamento
    ? 'levantamento'
    : 'entrega';
}
/** Soma apenas subtotais e taxas já devolvidos pelo servidor; não recalcula preços ou arredondamentos. */
export function estimatedCheckoutTotal(preparation: Preparation, draft: Record<string, string>) {
  const products = preparation.linhas.reduce((sum, line) => sum + BigInt(line.subtotalCent), 0n);
  const fees = preparation.produtores.reduce((sum, producer) => {
    const mode = draft[producer.produtorContaId + '.modalidade'] ?? defaultModality(producer);
    return sum + (mode === 'entrega' ? BigInt(producer.comercial.taxaEntregaCent ?? 0) : 0n);
  }, 0n);
  if (products + fees > BigInt(Number.MAX_SAFE_INTEGER)) return;
  return {
    produtosCent: Number(products),
    taxasCent: Number(fees),
    totalCent: Number(products + fees),
  };
}
/** Converte horas declaradas no fuso do produtor sem depender do fuso do browser.
 * Horas inexistentes/ambíguas não são escolhidas implicitamente. */
export function localInstant(date: string, time: string, zone: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return;
  const nominal = Date.parse(date + 'T' + time + ':00.000Z');
  if (!Number.isFinite(nominal)) return;
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const target = date + 'T' + time;
    const candidates = new Set<number>();
    const local = (t: number) => {
      const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
      return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
    };
    // Fusos IANA modernos podem ter offsets de 15 minutos; verificar offsets adjacentes à data, não supor UTC+0/1.
    const offsets = new Set<number>();
    for (const delta of [-86400000, 0, 86400000]) {
      const t = nominal + delta,
        p = local(t);
      const projected = Date.parse(p + ':00.000Z');
      offsets.add(projected - t);
    }
    for (const offset of offsets) {
      const instant = nominal - offset;
      if (local(instant) === target) candidates.add(instant);
    }
    if (candidates.size === 1) return new Date([...candidates][0]!).toISOString();
  } catch {
    return;
  }
}
export function declaredWindows(date: string, windows: readonly WeeklyPeriod[], zone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const d = new Date(date + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date) return [];
  const day = d.getUTCDay() || 7;
  return windows
    .filter((w) => w.diaSemana === day)
    .flatMap((w) => {
      const start = localInstant(date, w.inicio, zone),
        end = localInstant(date, w.fim, zone);
      if (!start || !end || start >= end) return [];
      return [
        {
          label: `${w.inicio}–${w.fim}`,
          periodo: { inicioEm: start, fimEm: end, fusoHorario: zone },
        },
      ];
    });
}
