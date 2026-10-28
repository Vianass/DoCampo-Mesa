import { createHmac } from 'node:crypto';
import type { ProducerRecord } from '../producers/producer.model.js';
import type { ProducerApplicationHistory } from '../producers/producer-application-history.schema.js';

function fields(
  record: Pick<
    ProducerRecord,
    'nomePublico' | 'localidade' | 'concelho' | 'descricao' | 'telefone'
  >,
) {
  return {
    nomePublico: record.nomePublico,
    localidade: record.localidade,
    concelho: record.concelho,
    descricao: record.descricao,
    telefone: record.telefone,
  };
}
function decision(value: ProducerRecord['aprovacao']['decisao'], admin: boolean) {
  if (!value) return undefined;
  return {
    data: value.data.toISOString(),
    ...(value.justificacao ? { justificacao: value.justificacao } : {}),
    ...(admin ? { administradorId: value.autor.toHexString() } : {}),
  };
}
export function applicationDto(record: ProducerRecord, admin = false) {
  return {
    id: record._id.toHexString(),
    ...(admin ? { utilizadorId: record.userId.toHexString() } : {}),
    ...fields(record),
    estado: record.aprovacao.estado,
    submetidaEm: record.aprovacao.submetidaEm.toISOString(),
    ...(record.aprovacao.decisao ? { decisao: decision(record.aprovacao.decisao, admin) } : {}),
    historico: (record.historicoCandidaturas ?? []).map((attempt) => ({
      ...fields(attempt),
      estado: 'rejeitado' as const,
      submetidaEm: attempt.submetidaEm.toISOString(),
      decisao: decision(attempt.decisao, admin),
    })),
  };
}
export function rejectedSnapshot(record: ProducerRecord): ProducerApplicationHistory {
  const value = record.aprovacao.decisao;
  if (record.aprovacao.estado !== 'rejeitado' || !value?.justificacao)
    throw new Error('Só uma tentativa rejeitada completa pode entrar no histórico.');
  return {
    ...fields(record),
    submetidaEm: new Date(record.aprovacao.submetidaEm),
    decisao: { autor: value.autor, data: new Date(value.data), justificacao: value.justificacao },
  };
}
export function applicationTag(record: ProducerRecord, key: Uint8Array) {
  return (
    '"' +
    createHmac('sha256', key)
      .update(
        JSON.stringify([
          record._id.toHexString(),
          record.revisaoOperacional ?? 0,
          record.aprovacao,
        ]),
      )
      .digest('base64url') +
    '"'
  );
}
