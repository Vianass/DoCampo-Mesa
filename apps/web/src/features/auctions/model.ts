import type { AuctionSnapshot, AuctionSummary } from './contracts';
export function cents(input: string): number | undefined {
  if (!/^\d{1,14}(?:[,.]\d{1,2})?$/.test(input.trim())) return undefined;
  const [whole = '0', fraction = ''] = input.trim().replace(',', '.').split('.');
  const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined;
}
export const euros = (value: number) =>
  `${Math.floor(value / 100)},${String(value % 100).padStart(2, '0')}`;
export function nextMinimum(value: number, increment: number) {
  const n = BigInt(value) + BigInt(increment);
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : undefined;
}
export function mergeSnapshot(previous: AuctionSnapshot | undefined, next: AuctionSnapshot) {
  if (previous && previous.leilaoId !== next.leilaoId)
    return { state: previous, gap: false, invalid: true };
  if (previous && next.versao < previous.versao)
    return { state: previous, gap: false, invalid: false };
  if (
    previous &&
    next.versao === previous.versao &&
    (next.sequencia !== previous.sequencia ||
      next.valorAtualCent !== previous.valorAtualCent ||
      next.bidId !== previous.bidId ||
      next.estado !== previous.estado ||
      next.lider?.referencia !== previous.lider?.referencia ||
      next.incrementoCent !== previous.incrementoCent ||
      next.iniciaEm !== previous.iniciaEm ||
      next.terminaEm !== previous.terminaEm ||
      JSON.stringify(next.resultado) !== JSON.stringify(previous.resultado))
  )
    return { state: previous, gap: true, invalid: true };
  return { state: next, gap: !!previous && next.versao > previous.versao + 1, invalid: false };
}
export interface ClockSample {
  serverMs: number;
  monotonicMs: number;
}
export function sampleClock(
  serverNow: string,
  received = performance.now(),
  sent = received,
): ClockSample {
  return {
    serverMs: Date.parse(serverNow) + Math.max(0, received - sent) / 2,
    monotonicMs: received,
  };
}
export function serverTime(sample: ClockSample, monotonic = performance.now()) {
  return sample.serverMs + Math.max(0, monotonic - sample.monotonicMs);
}
export function remainingLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000)),
    days = Math.floor(seconds / 86400),
    hours = Math.floor((seconds % 86400) / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  return days
    ? `${days} d ${hours} h`
    : `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function localSearch(items: AuctionSummary[], query: string) {
  const terms = query
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return items.filter((a) =>
    terms.every((t) =>
      `${a.titulo} ${a.lote.nome} ${a.produtor.nome}`
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .includes(t),
    ),
  );
}
export function lotLabel(a: AuctionSummary) {
  return `${a.lote.quantidade.toLocaleString('pt-PT')} ${a.lote.unidadeVenda.modalidade === 'embalagem' ? 'embalagens' : a.lote.unidadeVenda.unidadeBase === 'un' ? 'unidades' : a.lote.unidadeVenda.unidadeBase}`;
}
export const auctionDate = (value: string) =>
  new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
