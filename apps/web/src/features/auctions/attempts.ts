export interface BidAttempt {
  requestId: string;
  leilaoId: string;
  valorCent: number;
}
export interface CreationAttempt {
  requestId: string;
  body: import('./contracts').AuctionCreate;
}
export function isCreationAttempt(value: unknown): value is CreationAttempt {
  if (!value || typeof value !== 'object') return false;
  const a = value as Partial<CreationAttempt>,
    b = a.body;
  return (
    typeof a.requestId === 'string' &&
    /^[!-~]{1,128}$/.test(a.requestId) &&
    !!b &&
    typeof b.produtoId === 'string' &&
    /^[a-f0-9]{24}$/i.test(b.produtoId) &&
    Number.isSafeInteger(b.quantidade) &&
    b.quantidade > 0 &&
    typeof b.titulo === 'string' &&
    !!b.titulo.trim() &&
    [...b.titulo].length <= 180 &&
    typeof b.descricao === 'string' &&
    !!b.descricao.trim() &&
    [...b.descricao].length <= 5000 &&
    Number.isSafeInteger(b.precoBaseCent) &&
    b.precoBaseCent >= 0 &&
    Number.isSafeInteger(b.incrementoCent) &&
    b.incrementoCent > 0 &&
    typeof b.terminaEm === 'string' &&
    Number.isFinite(Date.parse(b.terminaEm)) &&
    (b.iniciaEm === undefined ||
      (typeof b.iniciaEm === 'string' && Number.isFinite(Date.parse(b.iniciaEm))))
  );
}
const prefix = 'docampo.auction-attempt.v1.';
export async function accountFingerprint(id: string) {
  const data = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('docampo-auctions:' + id),
  );
  return Array.from(new Uint8Array(data), (v) => v.toString(16).padStart(2, '0')).join('');
}
export function attemptStore<T>(account: string, kind: string) {
  const key = prefix + account + '.' + kind;
  return {
    read(): T | undefined {
      try {
        const value = sessionStorage.getItem(key);
        if (!value) return;
        const parsed = JSON.parse(value);
        if (
          !parsed ||
          typeof parsed.requestId !== 'string' ||
          !/^[!-~]{1,128}$/.test(parsed.requestId)
        )
          return;
        return parsed as T;
      } catch {
        return;
      }
    },
    save(value: T) {
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    clear(requestId: string) {
      try {
        const current = this.read() as { requestId?: string } | undefined;
        if (current?.requestId === requestId) sessionStorage.removeItem(key);
      } catch {
        /* O bloqueio em memória permanece. */
      }
    },
  };
}
