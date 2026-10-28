import { Schema, Types } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { dateField, requireDocumentValidation, textField } from '../shared/model-validation.js';
import { requireOperationSession } from '../concurrency/operation-session.js';
import type { BidRecord } from './bid.types.js';

function positiveInteger() {
  return {
    type: Number,
    required: true,
    cast: false,
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    validate: {
      validator: Number.isSafeInteger,
      message: 'É necessário um inteiro positivo seguro.',
    },
  };
}
function summary(value: Record<string, unknown>) {
  return {
    ...(value._id instanceof Types.ObjectId ? { id: value._id.toHexString() } : {}),
    ...(value.leilao instanceof Types.ObjectId ? { leilaoId: value.leilao.toHexString() } : {}),
    ...(value.valorCent !== undefined ? { valorCent: value.valorCent } : {}),
    ...(value.sequencia !== undefined ? { sequencia: value.sequencia } : {}),
    ...(value.aceiteEm instanceof Date ? { aceiteEm: value.aceiteEm.toISOString() } : {}),
  };
}

/** Factory isolada: sem ligação automática ou operações de licitação fora de uma transação. */
export function createBidModel(connection: Connection): Model<BidRecord> {
  const existing = connection.models.Bid as Model<BidRecord> | undefined;
  if (existing) return existing;
  const schema = new Schema<BidRecord>(
    {
      leilao: { type: Schema.Types.ObjectId, ref: 'Auction', required: true },
      comprador: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      valorCent: positiveInteger(),
      sequencia: positiveInteger(),
      requestId: { ...textField('requestId', 128), match: /^[\x21-\x7e]{1,128}$/, select: false },
      requestHash: { ...textField('requestHash', 64), match: /^[a-f0-9]{64}$/, select: false },
      aceiteEm: dateField('aceiteEm'),
    },
    {
      collection: 'bids',
      strict: 'throw',
      versionKey: false,
      autoCreate: false,
      autoIndex: false,
      bufferCommands: false,
      toJSON: { transform: (_doc, value) => summary(value) },
      toObject: { transform: (_doc, value) => summary(value) },
    },
  );
  requireDocumentValidation(schema);
  schema.pre('save', function () {
    if (!this.isNew) throw new Error('Uma licitação aceite é imutável.');
    requireOperationSession(this.$session() ?? undefined, true);
  });
  schema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function () {
    throw new Error('Não eliminar o histórico de licitações.');
  });
  schema.pre('deleteOne', { document: true, query: false }, function () {
    throw new Error('Não eliminar o histórico de licitações.');
  });
  schema.index({ leilao: 1, sequencia: 1 }, { unique: true });
  schema.index({ leilao: 1, comprador: 1, requestId: 1 }, { unique: true });
  return connection.model<BidRecord>('Bid', schema);
}
