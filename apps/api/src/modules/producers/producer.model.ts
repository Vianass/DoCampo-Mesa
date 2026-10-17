import { Schema } from 'mongoose';
import type { Connection, Model, Types } from 'mongoose';
import { dateField, requireDocumentValidation, textField } from '../shared/model-validation.js';
import { createUserModel } from '../users/user.model.js';

export const applicationStatuses = ['pendente', 'aprovado', 'rejeitado'] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];

interface AdministrativeDecision {
  autor: Types.ObjectId;
  data: Date;
  justificacao?: string;
}

interface ProducerApplication {
  estado: ApplicationStatus;
  submetidaEm: Date;
  decisao?: AdministrativeDecision;
}

interface ProducerImage {
  url: string;
  alt?: string;
}

export interface ProducerRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  nomePublico: string;
  localidade: string;
  concelho: string;
  descricao: string;
  telefone: string;
  imagem?: ProducerImage;
  aprovacao: ProducerApplication;
  createdAt: Date;
  updatedAt: Date;
  /** Virtual de leitura: exige populate de userId com nome; nunca é persistido. */
  readonly nomeResponsavel?: string;
}

export function createProducerModel(connection: Connection): Model<ProducerRecord> {
  const existing = connection.models.ProducerProfile as Model<ProducerRecord> | undefined;
  if (existing) return existing;
  createUserModel(connection);

  const decisionSchema = new Schema<AdministrativeDecision>(
    {
      autor: { type: Schema.Types.ObjectId, ref: 'User', required: true, select: false },
      data: dateField('aprovacao.decisao.data'),
      justificacao: textField('aprovacao.decisao.justificacao', 2000, false),
    },
    { _id: false, strict: 'throw' },
  );
  const applicationSchema = new Schema<ProducerApplication>(
    {
      estado: { type: String, enum: applicationStatuses, required: true, default: 'pendente' },
      submetidaEm: { ...dateField('aprovacao.submetidaEm'), default: () => new Date() },
      decisao: {
        type: decisionSchema,
        default: undefined,
        required(this: ProducerApplication) {
          return this.estado === 'aprovado' || this.estado === 'rejeitado';
        },
      },
    },
    { _id: false, strict: 'throw' },
  );
  applicationSchema.path('decisao').validate({
    validator(this: ProducerApplication, decision: AdministrativeDecision | null | undefined) {
      if (this.estado === 'pendente') return decision === undefined;
      if (!decision) return false;
      if (this.estado === 'rejeitado' && !decision.justificacao) return false;
      return (
        decision.data instanceof Date &&
        this.submetidaEm instanceof Date &&
        decision.data.getTime() >= this.submetidaEm.getTime()
      );
    },
    message: 'Estado, decisão, justificação e datas da candidatura devem ser coerentes.',
  });
  const imageSchema = new Schema<ProducerImage>(
    {
      url: {
        ...textField('imagem.url'),
        validate: {
          validator(value: string) {
            try {
              const url = new URL(value);
              return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
            } catch {
              return false;
            }
          },
          message: 'A imagem exige um URL HTTP(S) sem credenciais.',
        },
      },
      alt: textField('imagem.alt', undefined, false),
    },
    { _id: false, strict: 'throw' },
  );
  const schema = new Schema<ProducerRecord>(
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
      nomePublico: textField('nomePublico', 160),
      localidade: textField('localidade', 120),
      concelho: textField('concelho'),
      descricao: textField('descricao', 5000),
      telefone: { ...textField('telefone'), select: false },
      imagem: { type: imageSchema, default: undefined },
      aprovacao: { type: applicationSchema, required: true, default: () => ({}) },
    },
    {
      collection: 'producers',
      timestamps: true,
      strict: 'throw',
      autoIndex: false,
      autoCreate: false,
      bufferCommands: false,
      toJSON: {
        virtuals: true,
        transform(_document, value) {
          Reflect.deleteProperty(value, 'telefone');
          if (value.aprovacao?.decisao) Reflect.deleteProperty(value.aprovacao.decisao, 'autor');
          // Um populate futuro nunca transforma a conta inteira num perfil público.
          const account: unknown = value.userId;
          if (account && typeof account === 'object' && '_id' in account) {
            value.userId = account._id as Types.ObjectId;
          }
          return value;
        },
      },
    },
  );
  schema.virtual('nomeResponsavel').get(function () {
    const account: unknown = this.userId;
    return account && typeof account === 'object' && 'nome' in account ? account.nome : undefined;
  });
  schema.index({ userId: 1 }, { unique: true });
  requireDocumentValidation(schema);
  return connection.model<ProducerRecord>('ProducerProfile', schema);
}
