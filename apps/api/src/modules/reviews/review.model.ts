import { Schema, type Model, type Connection } from 'mongoose';
import type { ReviewRecord, ReviewDecision } from './review.types.js';
import { reviewStates, reviewTargets, reviewText } from './review.validation.js';
export function createReviewModel(connection: Connection): Model<ReviewRecord> {
  if (connection.models.Review) return connection.models.Review as Model<ReviewRecord>;
  const id = { type: Schema.Types.ObjectId, required: true, immutable: true };
  const event = new Schema<ReviewDecision>(
    {
      administrador: id,
      ocorridoEm: { type: Date, required: true },
      anterior: { type: String, enum: reviewStates, required: true },
      estado: { type: String, enum: reviewStates, required: true },
      motivo: {
        type: String,
        required: true,
        validate: (v: string) => reviewText(2000).safeParse(v).success,
      },
      versao: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, cast: false },
    },
    { _id: false, strict: 'throw' },
  );
  const schema = new Schema<ReviewRecord>(
    {
      autor: id,
      encomenda: id,
      vendedor: id,
      perfilProdutor: id,
      alvoTipo: { type: String, enum: reviewTargets, required: true, immutable: true },
      produto: { type: Schema.Types.ObjectId, immutable: true },
      produtor: { type: Schema.Types.ObjectId, immutable: true },
      alvoNome: { type: String, required: true, maxlength: 300, immutable: true },
      classificacao: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
        cast: false,
        immutable: true,
        validate: Number.isInteger,
      },
      comentario: {
        type: String,
        required: true,
        immutable: true,
        validate: (v: string) => reviewText(1000).safeParse(v).success,
      },
      estado: { type: String, enum: reviewStates, required: true, default: 'publicada' },
      versao: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
        cast: false,
        validate: Number.isSafeInteger,
      },
      historico: {
        type: [event],
        default: [],
        validate: (v: ReviewDecision[]) => v.length <= 1000,
      },
    },
    {
      collection: 'reviews',
      strict: 'throw',
      autoCreate: false,
      autoIndex: false,
      timestamps: true,
      versionKey: false,
    },
  );
  schema.pre('validate', function () {
    if (
      this.alvoTipo === 'produto'
        ? !this.produto || !!this.produtor
        : !this.produtor || !!this.produto || !this.produtor.equals(this.vendedor)
    )
      this.invalidate('alvoTipo', 'Seleciona exatamente um alvo coerente.');
    if (
      this.versao !== this.historico.length ||
      this.historico.some(
        (e, i) =>
          e.versao !== i + 1 ||
          e.anterior == e.estado ||
          (i > 0 && e.anterior !== this.historico[i - 1]!.estado),
      ) ||
      (this.historico.at(-1)?.estado ?? 'publicada') !== this.estado
    )
      this.invalidate('historico', 'Histórico incoerente.');
  });
  schema.pre('save', function () {
    if (!this.isNew) throw Error('Avaliação imutável; decisões apenas pelo serviço transacional.');
  });
  for (const operation of [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
    'replaceOne',
  ] as const)
    schema.pre(operation, function () {
      throw Error('Não reescrever avaliações ou decisões.');
    });
  schema.index(
    { autor: 1, encomenda: 1, produto: 1 },
    { unique: true, partialFilterExpression: { alvoTipo: 'produto' } },
  );
  schema.index(
    { autor: 1, encomenda: 1, produtor: 1 },
    { unique: true, partialFilterExpression: { alvoTipo: 'produtor' } },
  );
  schema.index({ produto: 1, estado: 1, createdAt: -1, _id: -1 });
  schema.index({ perfilProdutor: 1, alvoTipo: 1, estado: 1, createdAt: -1, _id: -1 });
  schema.index({ autor: 1, createdAt: -1, _id: -1 });
  schema.index({ encomenda: 1 });
  schema.index({ estado: 1, createdAt: -1, _id: -1 });
  schema.index({ classificacao: 1, createdAt: -1, _id: -1 });
  schema.index({ createdAt: -1, _id: -1 });
  return connection.model<ReviewRecord>('Review', schema);
}
