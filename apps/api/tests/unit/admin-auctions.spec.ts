import { describe, it, expect, vi } from 'vitest';
import { adminAuctionQuery } from '../../src/modules/admin-auctions/admin-auctions.validation.js';
import { adminAuctionFilter } from '../../src/modules/admin-auctions/admin-auctions.service.js';
import { createAdminAuctionPublication } from '../../src/realtime/admin-auction.publication.js';
import type { AdminAuctionsService } from '../../src/modules/admin-auctions/admin-auctions.service.js';
import { Types } from 'mongoose';
describe('supervisão de leilões: filtros', () => {
  it.each([
    { estado: 'concluido' },
    { produtor: 'perfil' },
    { produto: { $ne: null } },
    { identificador: '.*' },
    { pagina: '1001' },
    { porPagina: '1000' },
    { desde: '2026-02-30' },
    { ate: '9999-12-31' },
    { desde: '2026-10-30', ate: '2026-10-29' },
    { extra: true },
    { estado: ['ativo', 'cancelado'] },
  ])('recusa %j', (q) => expect(adminAuctionQuery.safeParse(q).success).toBe(false));
  it('combina filtros por contas/produtos/ID e dias de início UTC inclusivos', () => {
    const id = new Types.ObjectId().toHexString(),
      q = adminAuctionQuery.parse({
        estado: 'ativo',
        produtor: id,
        produto: id,
        identificador: id,
        desde: '2026-10-01',
        ate: '2026-10-30',
      });
    expect(adminAuctionFilter(q)).toEqual({
      estado: 'ativo',
      produtor: new Types.ObjectId(id),
      produto: new Types.ObjectId(id),
      _id: new Types.ObjectId(id),
      iniciaEm: { $gte: new Date('2026-10-01T00:00:00Z'), $lt: new Date('2026-10-31T00:00:00Z') },
    });
  });
  it('defaults e filtros vazios não inventam estados', () => {
    const q = adminAuctionQuery.parse({});
    expect(q).toEqual({ pagina: 1, porPagina: 12, ordem: 'recentes' });
    expect(adminAuctionFilter(q)).toEqual({});
  });
});
describe('publicador de invalidações substituíveis', () => {
  it('só notifica mudanças de versão, recupera periodicamente e limpa ao fechar', async () => {
    vi.useFakeTimers();
    let listener: (id: string) => void = () => undefined;
    let version = 1;
    const id = new Types.ObjectId(),
      emit = vi.fn(async () => undefined),
      unsubscribe = vi.fn();
    const versions = vi.fn(async () => [
      { _id: id, versao: version },
    ]) as unknown as AdminAuctionsService['versions'];
    const p = createAdminAuctionPublication(
      {
        subscribeCommitted: (fn) => {
          listener = fn;
          return unsubscribe;
        },
      },
      { versions },
      { active: () => true, emit },
      { debounceMs: 10, recoveryMs: 1000 },
    );
    try {
      listener(id.toHexString());
      listener(id.toHexString());
      await vi.advanceTimersByTimeAsync(20);
      expect(emit).toHaveBeenCalledTimes(1);
      listener(id.toHexString());
      await vi.advanceTimersByTimeAsync(20);
      expect(emit).toHaveBeenCalledTimes(1);
      version = 2;
      listener(id.toHexString());
      await vi.advanceTimersByTimeAsync(20);
      expect(emit).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(emit).toHaveBeenCalledTimes(3);
      await p.close();
      expect(unsubscribe).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(2000);
      expect(emit).toHaveBeenCalledTimes(3);
    } finally {
      await p.close();
      vi.useRealTimers();
    }
  });
  it('não consulta MongoDB nem publica sem administradores subscritos', async () => {
    vi.useFakeTimers();
    let fn: (id: string) => void = () => undefined;
    const versions = vi.fn(),
      emit = vi.fn();
    const p = createAdminAuctionPublication(
      {
        subscribeCommitted: (f) => {
          fn = f;
          return () => undefined;
        },
      },
      { versions },
      { active: () => false, emit },
    );
    try {
      fn(new Types.ObjectId().toHexString());
      await vi.advanceTimersByTimeAsync(16000);
      expect(versions).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    } finally {
      await p.close();
      vi.useRealTimers();
    }
  });
});
