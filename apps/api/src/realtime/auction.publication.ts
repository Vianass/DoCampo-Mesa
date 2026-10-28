import type { AuctionService } from '../modules/auctions/auction.service.js';
import type { AuctionSnapshot } from '../modules/auctions/auction.snapshot.js';

/** Notificações substituíveis de estado, recuperáveis por leitura; não é uma fila durável de eventos. */
export function createAuctionPublication(
  service: AuctionService,
  hooks: {
    rooms: () => Iterable<string>;
    hasRoom: (id: string) => boolean;
    emit: (state: AuctionSnapshot) => Promise<void>;
    unavailable: (id: string) => void;
  },
  intervalMs: number,
) {
  const cache = new Map<string, AuctionSnapshot>(),
    published = new Map<string, number>();
  const pending = new Set<string>(),
    active = new Map<string, Promise<void>>(),
    failures = new Set<string>();
  let stopped = false;
  async function state(id: string) {
    const candidate = await service.snapshot(id),
      previous = cache.get(id);
    const latest = previous && previous.versao > candidate.versao ? previous : candidate;
    if (hooks.hasRoom(id)) cache.set(id, latest);
    return latest;
  }
  function notify(id: string) {
    if (stopped || !hooks.hasRoom(id)) return;
    pending.add(id);
    if (active.has(id)) return;
    const work = Promise.resolve()
      .then(async () => {
        while (!stopped && pending.delete(id) && hooks.hasRoom(id)) {
          try {
            const latest = await state(id);
            if (stopped || !hooks.hasRoom(id)) break;
            if (latest.versao > (published.get(id) ?? -1)) {
              await hooks.emit(latest);
              if (hooks.hasRoom(id)) published.set(id, latest.versao);
            }
            failures.delete(id);
          } catch {
            if (!stopped && hooks.hasRoom(id) && !failures.has(id)) {
              failures.add(id);
              hooks.unavailable(id);
            }
          }
        }
      })
      .finally(() => {
        active.delete(id);
        if (!hooks.hasRoom(id)) {
          cache.delete(id);
          published.delete(id);
          failures.delete(id);
          pending.delete(id);
        }
        if (pending.has(id)) notify(id);
      });
    active.set(id, work);
  }
  const unsubscribe = service.subscribeCommitted(notify);
  const timer = setInterval(() => {
    for (const id of hooks.rooms()) notify(id);
  }, intervalMs);
  timer.unref();
  return {
    state,
    latest(id: string, fallback: AuctionSnapshot) {
      const current = cache.get(id);
      return current && current.versao > fallback.versao ? current : fallback;
    },
    forget(id: string) {
      cache.delete(id);
      published.delete(id);
      failures.delete(id);
      pending.delete(id);
    },
    notify,
    async close() {
      stopped = true;
      clearInterval(timer);
      unsubscribe();
      pending.clear();
      await Promise.allSettled(active.values());
      cache.clear();
      published.clear();
      failures.clear();
    },
  };
}
