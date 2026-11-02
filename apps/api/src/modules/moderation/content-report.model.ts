import { Schema, type Connection, type Model } from 'mongoose';
import type { ContentReport } from './moderation.types.js';
import { evidenceSchema, reportStates, reportTargets } from './moderation.validation.js';
import { moderationHistorySchema } from './moderation.schema.js';
import { reviewText } from '../reviews/review.validation.js';
export function createContentReportModel(connection: Connection): Model<ContentReport> {
  if (connection.models.ContentReport)
    return connection.models.ContentReport as Model<ContentReport>;
  const schema = new Schema<ContentReport>(
    {
      autor: { type: Schema.Types.ObjectId, required: true, immutable: true },
      alvoTipo: { type: String, enum: reportTargets, required: true, immutable: true },
      alvoId: { type: Schema.Types.ObjectId, required: true, immutable: true },
      motivo: {
        type: String,
        required: true,
        immutable: true,
        validate: (v: string) => reviewText(1000).safeParse(v).success,
      },
      evidencia: {
        type: Schema.Types.Mixed,
        required: true,
        immutable: true,
        validate: (v: unknown) => evidenceSchema.safeParse(v).success,
      },
      estado: { type: String, enum: reportStates, default: 'pendente', required: true },
      versao: {
        type: Number,
        default: 0,
        required: true,
        min: 0,
        max: 1,
        cast: false,
        validate: Number.isSafeInteger,
      },
      historico: { type: [moderationHistorySchema(reportStates)], default: [] },
      conteudoNaDecisao: {
        type: new Schema(
          {
            disponivel: { type: Boolean, required: true, cast: false },
            estado: { type: String, enum: ['visivel', 'oculta'] },
            versao: { type: Number, min: 0, cast: false, validate: Number.isSafeInteger },
          },
          { _id: false, strict: 'throw' },
        ),
        default: undefined,
      },
    },
    {
      collection: 'content_reports',
      strict: 'throw',
      autoCreate: false,
      autoIndex: false,
      timestamps: true,
      versionKey: false,
    },
  );
  schema.pre('validate', function () {
    const event = this.historico[0];
    if (
      this.versao !== this.historico.length ||
      this.historico.length > 1 ||
      (this.versao === 0
        ? !!this.conteudoNaDecisao
        : !this.conteudoNaDecisao ||
          (this.conteudoNaDecisao.disponivel &&
            (!this.conteudoNaDecisao.estado || this.conteudoNaDecisao.versao === undefined))) ||
      (this.versao === 0
        ? this.estado !== 'pendente'
        : !event ||
          event.anterior !== 'pendente' ||
          event.estado === 'pendente' ||
          event.estado !== this.estado ||
          event.versao !== 1)
    )
      this.invalidate('historico', 'Histórico da denúncia incoerente.');
  });
  schema.pre('save', function () {
    if (!this.isNew) throw Error('Denúncia imutável; decisão apenas pelo serviço transacional.');
  });
  for (const op of [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'replaceOne',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ] as const)
    schema.pre(op, function () {
      throw Error('Não reescrever denúncias ou auditoria.');
    });
  schema.index({ autor: 1, alvoTipo: 1, alvoId: 1 }, { unique: true });
  schema.index({ estado: 1, alvoTipo: 1, createdAt: -1, _id: -1 });
  schema.index({ alvoTipo: 1, alvoId: 1, estado: 1 });
  schema.index({ createdAt: -1, _id: -1 });
  return connection.model<ContentReport>('ContentReport', schema);
}
