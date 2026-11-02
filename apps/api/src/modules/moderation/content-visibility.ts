import type { ClientSession, Connection } from 'mongoose';
import type { AuctionRecord } from '../auctions/auction.types.js';
/** Apenas apresentação/descoberta; nunca muda bids, stock, prazos ou resultados. */
export function auctionDiscoveryVisibility() {
  return [
    {
      $lookup: {
        from: 'products',
        localField: 'produto',
        foreignField: '_id',
        pipeline: [{ $match: { 'moderacao.estado': 'oculta' } }, { $project: { _id: 1 } }],
        as: 'produtoModerado',
      },
    },
    {
      $lookup: {
        from: 'producers',
        localField: 'produtor',
        foreignField: 'userId',
        pipeline: [{ $match: { 'moderacao.estado': 'oculta' } }, { $project: { _id: 1 } }],
        as: 'perfilModerado',
      },
    },
    { $match: { 'produtoModerado.0': { $exists: false }, 'perfilModerado.0': { $exists: false } } },
    { $project: { produtoModerado: 0, perfilModerado: 0 } },
  ];
}
export async function auctionContentHidden(
  connection: Connection,
  auction: AuctionRecord,
  session?: ClientSession,
) {
  const product = await connection
    .db!.collection('products')
    .findOne(
      { _id: auction.produto, 'moderacao.estado': 'oculta' },
      { session, projection: { _id: 1 }, maxTimeMS: 5000 },
    );
  if (product) return true;
  return !!(await connection
    .db!.collection('producers')
    .findOne(
      { userId: auction.produtor, 'moderacao.estado': 'oculta' },
      { session, projection: { _id: 1 }, maxTimeMS: 5000 },
    ));
}
