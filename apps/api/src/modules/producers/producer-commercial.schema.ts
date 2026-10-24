import { Error as MongooseError, Schema } from 'mongoose';
import { textField } from '../shared/model-validation.js';
import {
  producerCommercialTextLimits,
  producerPaymentMethods,
  producerWeekDays,
} from './producer-commercial.constants.js';
import type {
  ProducerCommercialSettings,
  ProducerPrivatePayment,
  ProducerWeeklyAvailability,
  ProducerWeeklyPeriod,
} from './producer-commercial.types.js';

const options = { _id: false, versionKey: false, strict: 'throw' } as const;
const privateOptions = {
  ...options,
  toJSON: { transform: () => ({}) },
  toObject: { transform: () => ({}) },
};

export function createProducerCommercialSchema(): Schema<ProducerCommercialSettings> {
  const modes = new Schema(
    {
      levantamento: { type: Boolean, cast: false, required: true },
      entrega: { type: Boolean, cast: false, required: true },
    },
    options,
  );
  const period = new Schema<ProducerWeeklyPeriod>(
    {
      diaSemana: { type: Number, cast: false, required: true, enum: producerWeekDays },
      inicio: { type: String, cast: false, required: true },
      fim: { type: String, cast: false, required: true },
    },
    options,
  );
  const availability = new Schema<ProducerWeeklyAvailability>(
    {
      fusoHorario: textField('fusoHorario', producerCommercialTextLimits.timeZone),
      levantamento: { type: [period], castNonArrays: false, default: () => [] },
      entrega: { type: [period], castNonArrays: false, default: () => [] },
    },
    options,
  );
  const mbWay = new Schema<NonNullable<ProducerPrivatePayment['mbWay']>>(
    { contacto: textField('contacto', producerCommercialTextLimits.contact) },
    privateOptions,
  );
  const bank = new Schema<NonNullable<ProducerPrivatePayment['transferenciaBancaria']>>(
    {
      iban: {
        ...textField('iban', 34),
        set(value: unknown) {
          if (value === undefined || value === null) return value;
          if (typeof value !== 'string')
            throw new MongooseError.CastError('String', '[valor privado omitido]', 'iban');
          return value.replaceAll(' ', '').toUpperCase();
        },
      },
      titular: textField('titular', producerCommercialTextLimits.accountHolder, false),
    },
    privateOptions,
  );
  const privatePayment = new Schema<ProducerPrivatePayment>(
    {
      mbWay: { type: mbWay, default: undefined },
      transferenciaBancaria: { type: bank, default: undefined },
    },
    privateOptions,
  );
  const opaqueIdentifier = {
    ...textField('concelhoId', producerCommercialTextLimits.identifier),
    set(value: unknown) {
      if (value === undefined || value === null || typeof value === 'string') return value;
      throw new MongooseError.CastError('String', '[tipo inválido]', 'concelhoId');
    },
  };
  return new Schema<ProducerCommercialSettings>(
    {
      modalidades: { type: modes, required: true },
      taxaEntregaCent: {
        type: Number,
        cast: false,
        default: undefined,
        validate: {
          validator: (value: number | undefined) =>
            value === undefined || (Number.isSafeInteger(value) && value >= 0),
          message: 'Taxa inteira segura não negativa.',
        },
      },
      concelhosEntregaIds: { type: [opaqueIdentifier], castNonArrays: false, default: () => [] },
      catalogoConcelhosVersao: { ...opaqueIdentifier, required: false },
      disponibilidade: { type: availability, required: true },
      metodosPagamento: {
        type: [{ type: String, enum: producerPaymentMethods, cast: false }],
        castNonArrays: false,
        required: true,
        default: undefined,
      },
      pagamentoPrivado: { type: privatePayment, default: undefined, select: false },
    },
    {
      ...options,
      toJSON: {
        transform: (_document, value) => {
          Reflect.deleteProperty(value, 'pagamentoPrivado');
          return value;
        },
      },
      toObject: {
        transform: (_document, value) => {
          Reflect.deleteProperty(value, 'pagamentoPrivado');
          return value;
        },
      },
    },
  );
}
