import type { AuctionRecord } from './auction.types.js';
import type { AuctionRepository } from './auction.repository.js';

/** Projeção comum a todos os observadores: nunca inclui campos privados ou `proprio`. */
export function auctionSnapshot(a: AuctionRecord, now: Date, repo: AuctionRepository) {
  return {
    leilaoId: a._id.toHexString(),
    versao: a.versao,
    sequencia: a.sequencia,
    estado: a.estado,
    valorAtualCent: a.licitacaoAtual.valorCent,
    incrementoCent: a.incrementoCent,
    bidId: a.licitacaoAtual.bidId?.toHexString() ?? null,
    lider: a.licitacaoAtual.comprador
      ? { referencia: repo.participant(a, a.licitacaoAtual.comprador) }
      : null,
    iniciaEm: a.iniciaEm.toISOString(),
    terminaEm: a.terminaEm.toISOString(),
    serverNow: now.toISOString(),
    ...(a.resultado
      ? {
          resultado: {
            tipo: a.resultado.tipo,
            valorCent: a.resultado.valorCent,
            bidId: a.resultado.bidId?.toHexString() ?? null,
          },
        }
      : {}),
  };
}
export type AuctionSnapshot = ReturnType<typeof auctionSnapshot>;
