import { Schema, type Types } from 'mongoose';
import { dateField, textField } from '../shared/model-validation.js';

/** Snapshot privado de uma tentativa rejeitada; a tentativa atual continua em aprovacao. */
export interface ProducerApplicationHistory {
  nomePublico: string;
  localidade: string;
  concelho: string;
  descricao: string;
  telefone: string;
  submetidaEm: Date;
  decisao: { autor: Types.ObjectId; data: Date; justificacao: string };
}

export function createApplicationHistorySchema() {
  const decision = new Schema<ProducerApplicationHistory['decisao']>(
    {
      autor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      data: dateField('historicoCandidaturas.decisao.data'),
      justificacao: textField('historicoCandidaturas.decisao.justificacao', 2000),
    },
    { _id: false, strict: 'throw' },
  );
  const schema = new Schema<ProducerApplicationHistory>(
    {
      nomePublico: textField('historicoCandidaturas.nomePublico', 160),
      localidade: textField('historicoCandidaturas.localidade', 120),
      concelho: textField('historicoCandidaturas.concelho'),
      descricao: textField('historicoCandidaturas.descricao', 5000),
      telefone: textField('historicoCandidaturas.telefone'),
      submetidaEm: dateField('historicoCandidaturas.submetidaEm'),
      decisao: {
        type: decision,
        required: true,
      },
    },
    { _id: false, strict: 'throw' },
  );
  schema.path('decisao').validate({
    validator(this: ProducerApplicationHistory, value: ProducerApplicationHistory['decisao']) {
      return value.data >= this.submetidaEm;
    },
    message: 'A decisão não pode preceder a submissão.',
  });
  return schema;
}
