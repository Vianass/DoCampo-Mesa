import type { Types } from 'mongoose';

/** Registo privado e imutável de uma oferta aceite; recusas não são bids. */
export interface BidRecord {
  readonly _id: Types.ObjectId;
  readonly leilao: Types.ObjectId;
  readonly comprador: Types.ObjectId;
  readonly valorCent: number;
  readonly sequencia: number;
  readonly requestId: string;
  readonly requestHash: string;
  readonly aceiteEm: Date;
}
