import { Error as MongooseError, Schema } from 'mongoose';
import type { Connection, Model, Types } from 'mongoose';
import { dateField, requireDocumentValidation, textField } from '../shared/model-validation.js';
import { createUserModel } from '../users/user.model.js';
import { createProducerCommercialSchema } from './producer-commercial.schema.js';
import type { ProducerCommercialSettings } from './producer-commercial.types.js';
import { validateProducerCommercial } from './producer-commercial.validation.js';
import { redactProducerSerialization } from './producer.serialization.js';

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
  comercial?: ProducerCommercialSettings;
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
      comercial: { type: createProducerCommercialSchema(), default: undefined },
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
          return redactProducerSerialization(value);
        },
      },
      toObject: { transform: (_document, value) => redactProducerSerialization(value) },
    },
  );
  schema.pre('validate', function () {
    if (this.isNew || !this.isModified('comercial')) return;
    const fields = [
      'comercial',
      'comercial.modalidades.levantamento',
      'comercial.modalidades.entrega',
      'comercial.taxaEntregaCent',
      'comercial.concelhosEntregaIds',
      'comercial.catalogoConcelhosVersao',
      'comercial.disponibilidade.fusoHorario',
      'comercial.disponibilidade.levantamento',
      'comercial.disponibilidade.entrega',
      'comercial.metodosPagamento',
      'comercial.pagamentoPrivado',
      'comercial.disponibilidade.levantamento.diaSemana',
      'comercial.disponibilidade.levantamento.inicio',
      'comercial.disponibilidade.levantamento.fim',
      'comercial.disponibilidade.entrega.diaSemana',
      'comercial.disponibilidade.entrega.inicio',
      'comercial.disponibilidade.entrega.fim',
      'comercial.pagamentoPrivado.mbWay.contacto',
      'comercial.pagamentoPrivado.transferenciaBancaria.iban',
      'comercial.pagamentoPrivado.transferenciaBancaria.titular',
    ];
    if (fields.some((field) => !this.isSelected(field)))
      throw new Error(
        'Alterar configuração comercial exige leitura completa, incluindo dados privados selecionados explicitamente.',
      );
  });
  schema.post('validate', function (document) {
    const settings = document.toObject({ transform: false }).comercial;
    const issues = validateProducerCommercial(settings);
    if (!issues.length) return;
    const error = new MongooseError.ValidationError();
    for (const issue of issues)
      error.addError(
        issue.campo,
        new MongooseError.ValidatorError({ path: issue.campo, message: issue.mensagem }),
      );
    throw error;
  });
  schema.post(
    'validate',
    function (error: Error, _document: unknown, next: (error?: Error) => void) {
      if (!(error instanceof MongooseError.ValidationError)) {
        next(error);
        return;
      }
      const paths = Object.keys(error.errors);
      if (!paths.some((path) => path === 'comercial' || path.startsWith('comercial.'))) {
        next(error);
        return;
      }
      const safe = new MongooseError.ValidationError();
      for (const path of paths) {
        if (path === 'comercial' || path.startsWith('comercial.')) {
          safe.addError(
            path,
            new MongooseError.ValidatorError({
              path,
              message: 'Configuração comercial inválida; valor omitido.',
            }),
          );
        } else safe.addError(path, error.errors[path]!);
      }
      next(safe);
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
