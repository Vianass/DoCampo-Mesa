import type { AuctionService } from '../modules/auctions/auction.service.js';
import type { AdminAuctionsService } from '../modules/admin-auctions/admin-auctions.service.js';
/** Invalidações substituíveis, sem dados comerciais: o consumidor relê REST. */
export function createAdminAuctionPublication(
  service: Pick<AuctionService, 'subscribeCommitted'>,
  oversight: Pick<AdminAuctionsService, 'versions'>,
  hooks: { active: () => boolean; emit: () => Promise<void> },
  options: { debounceMs?: number; recoveryMs?: number } = {},
) {
  const pending = new Set<string>(),
    versions = new Map<string, number>();
  let timer: NodeJS.Timeout | undefined,
    running: Promise<void> | undefined,
    stopped = false;
  function schedule(id: string) {
    if (stopped || !hooks.active()) return;
    if (pending.size < 1000) pending.add(id);
    if (timer || running) return;
    timer = setTimeout(() => {
      timer = undefined;
      const ids = [...pending];
      pending.clear();
      running = (async () => {
        try {
          const rows = await oversight.versions(ids);
          let changed = false;
          for (const row of rows) {
            const key = row._id.toHexString(),
              previous = versions.get(key);
            if (previous === undefined || row.versao > previous) {
              versions.set(key, row.versao);
              changed = true;
            }
          }
          while (versions.size > 5000) versions.delete(versions.keys().next().value!);
          if (changed && !stopped && hooks.active()) await hooks.emit();
        } catch {
          if (!stopped && hooks.active()) await hooks.emit();
        }
      })()
        .catch(() => undefined)
        .finally(() => {
          running = undefined;
          if (pending.size && !stopped) schedule(pending.values().next().value!);
        });
    }, options.debounceMs ?? 250);
    timer.unref();
  }
  const unsubscribe = service.subscribeCommitted(schedule);
  // Recupera também commits de outra instância e notificações perdidas, sem agregar toda a coleção.
  const recovery = setInterval(() => {
    if (!stopped && hooks.active()) void hooks.emit().catch(() => undefined);
  }, options.recoveryMs ?? 15000);
  recovery.unref();
  return {
    async close() {
      stopped = true;
      clearTimeout(timer);
      clearInterval(recovery);
      unsubscribe();
      pending.clear();
      await running;
      versions.clear();
    },
  };
}
