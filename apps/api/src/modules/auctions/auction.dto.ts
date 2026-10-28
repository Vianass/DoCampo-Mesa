import type { AuctionRecord } from './auction.types.js';
import type { BidRecord } from './bid.types.js';
import type { AuctionRepository } from './auction.repository.js';

export function auctionDto(a: AuctionRecord, now: Date) {
  return {
    id: a._id.toHexString(),
    produtoId: a.produto.toHexString(),
    produtor: { perfilId: a.produtorPublico.perfilId.toHexString(), nome: a.produtorPublico.nome },
    titulo: a.titulo,
    descricao: a.descricao,
    lote: { nome: a.lote.nome, quantidade: a.lote.quantidade, unidadeVenda: a.lote.unidadeVenda },
    precoBaseCent: a.precoBaseCent,
    incrementoCent: a.incrementoCent,
    iniciaEm: a.iniciaEm.toISOString(),
    terminaEm: a.terminaEm.toISOString(),
    estado: a.estado,
    licitacaoAtual: {
      valorCent: a.licitacaoAtual.valorCent,
      bidId: a.licitacaoAtual.bidId?.toHexString() ?? null,
    },
    sequencia: a.sequencia,
    versao: a.versao,
    ...(a.resultado
      ? {
          resultado: {
            tipo: a.resultado.tipo,
            valorCent: a.resultado.valorCent,
            bidId: a.resultado.bidId?.toHexString() ?? null,
          },
        }
      : {}),
    ...(a.encerradoEm ? { encerradoEm: a.encerradoEm.toISOString() } : {}),
    criadoEm: a.createdAt.toISOString(),
    atualizadoEm: a.updatedAt.toISOString(),
    serverNow: now.toISOString(),
    moeda: 'EUR' as const,
  };
}
export function auctionDetailDto(
  a: AuctionRecord,
  now: Date,
  user: string,
  repo: AuctionRepository,
) {
  const leader = a.licitacaoAtual.comprador;
  return {
    ...auctionDto(a, now),
    lider: leader
      ? { referencia: repo.participant(a, leader), proprio: leader.toHexString() === user }
      : null,
    ...(a.produtor.toHexString() === user
      ? {
          reserva: { ...a.reserva },
          historico: a.historico.map((e) => ({
            tipo: e.tipo,
            ocorridoEm: e.ocorridoEm.toISOString(),
          })),
        }
      : {}),
  };
}
export function bidDto(b: BidRecord, a: AuctionRecord, user: string, repo: AuctionRepository) {
  return {
    id: b._id.toHexString(),
    leilaoId: b.leilao.toHexString(),
    valorCent: b.valorCent,
    sequencia: b.sequencia,
    aceiteEm: b.aceiteEm.toISOString(),
    participante: {
      referencia: repo.participant(a, b.comprador),
      proprio: b.comprador.toHexString() === user,
    },
  };
}
