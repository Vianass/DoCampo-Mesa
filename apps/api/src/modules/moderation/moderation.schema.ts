import { Schema } from 'mongoose';
import { reviewText } from '../reviews/review.validation.js';
import {
  visibilityStates,
  type ContentVisibility,
  type ModerationDecision,
} from './moderation.types.js';

/** O mesmo formato de decisões já utilizado nas avaliações; sem coleção de auditoria paralela. */
export function moderationHistorySchema(states: readonly string[]) {
  return new Schema<ModerationDecision<string>>(
    {
      administrador: { type: Schema.Types.ObjectId, required: true, immutable: true },
      ocorridoEm: { type: Date, required: true },
      anterior: { type: String, enum: states, required: true },
      estado: { type: String, enum: states, required: true },
      motivo: {
        type: String,
        required: true,
        validate: (v: string) => reviewText(2000).safeParse(v).success,
      },
      versao: { type: Number, required: true, min: 1, cast: false, validate: Number.isSafeInteger },
    },
    { _id: false, strict: 'throw' },
  );
}
export function contentVisibilitySchema() {
  const schema = new Schema<ContentVisibility>(
    {
      estado: { type: String, enum: visibilityStates, required: true },
      versao: { type: Number, min: 0, required: true, cast: false, validate: Number.isSafeInteger },
      historico: {
        type: [moderationHistorySchema(visibilityStates)],
        default: [],
        validate: (v: unknown[]) => v.length <= 1000,
      },
    },
    { _id: false, strict: 'throw' },
  );
  schema.pre('validate', function () {
    if (
      this.versao !== this.historico.length ||
      (this.historico.at(-1)?.estado ?? 'visivel') !== this.estado ||
      this.historico.some(
        (e, i) =>
          e.versao !== i + 1 ||
          e.anterior === e.estado ||
          e.anterior !== (this.historico[i - 1]?.estado ?? 'visivel'),
      )
    )
      this.invalidate('historico', 'Histórico de moderação incoerente.');
  });
  return schema;
}
