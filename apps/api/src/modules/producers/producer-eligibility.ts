import {
  ConcurrencyError,
  operationalRevision,
  revisionCondition,
} from '../concurrency/concurrency-error.js';
import { validateProducerCommercial } from './producer-commercial.validation.js';
import type {
  ProducerCommercialSettings,
  ProducerPaymentMethod,
  ProducerReceptionModality,
} from './producer-commercial.types.js';
import { Types } from 'mongoose';

export interface ProducerSelection {
  readonly modalidade: ProducerReceptionModality;
  readonly metodoPagamento: ProducerPaymentMethod;
  readonly concelhoId?: string;
  readonly taxaEntregaAceiteCent: number;
  readonly periodo: { readonly inicioEm: Date; readonly fimEm: Date; readonly fusoHorario: string };
}
export interface ProducerGuardInput {
  readonly produtorId: Types.ObjectId;
  readonly revisaoEsperada: number;
  readonly selecao: ProducerSelection;
}
export interface ProducerEligibilityRecord {
  readonly _id: Types.ObjectId;
  readonly userId: Types.ObjectId;
  readonly aprovacao: { readonly estado: string };
  readonly comercial?: ProducerCommercialSettings;
  readonly revisaoOperacional?: number;
}

/** Instantes UTC explícitos; verifica a união das janelas locais, incluindo mudanças de hora. */
export function producerPeriodFits(
  settings: ProducerCommercialSettings,
  selection: ProducerSelection,
): boolean {
  const { inicioEm, fimEm, fusoHorario } = selection.periodo;
  if (
    !(inicioEm instanceof Date) ||
    !(fimEm instanceof Date) ||
    !Number.isFinite(inicioEm.getTime()) ||
    !Number.isFinite(fimEm.getTime()) ||
    inicioEm >= fimEm ||
    fusoHorario !== settings.disponibilidade.fusoHorario
  )
    return false;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: fusoHorario,
    era: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  function local(time: number) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(time)).map((part) => [part.type, part.value]),
    );
    return {
      date: [parts.era, parts.year, parts.month, parts.day].join('-'),
      day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday!) + 1,
      time:
        Number(parts.hour) * 3_600_000 +
        Number(parts.minute) * 60_000 +
        Number(parts.second) * 1000 +
        new Date(time).getUTCMilliseconds(),
    };
  }
  const first = local(inicioEm.getTime());
  if (first.date !== local(fimEm.getTime()).date) return false;
  const windows = settings.disponibilidade[selection.modalidade];
  const fits = (time: number) => {
    const point = local(time);
    return (
      point.date === first.date &&
      windows.some((window) => {
        const start =
          Number(window.inicio.slice(0, 2)) * 3_600_000 + Number(window.inicio.slice(3)) * 60_000;
        const end =
          Number(window.fim.slice(0, 2)) * 3_600_000 + Number(window.fim.slice(3)) * 60_000;
        return point.day === window.diaSemana && point.time >= start && point.time < end;
      })
    );
  };
  // As janelas têm resolução de minuto; não verificar só os extremos (pausas/DST).
  for (let time = inicioEm.getTime(); time < fimEm.getTime(); time += 60_000)
    if (!fits(time)) return false;
  return fits(fimEm.getTime() - 1);
}

export function validateProducerGuardCandidate(
  record: ProducerEligibilityRecord | null,
  input: ProducerGuardInput,
): void {
  if (!input || !(input.produtorId instanceof Types.ObjectId))
    throw new ConcurrencyError('VALIDACAO', 'Identificador de produtor inválido.');
  revisionCondition(input.revisaoEsperada);
  if (
    !record ||
    !record.userId.equals(input.produtorId) ||
    record.aprovacao.estado !== 'aprovado' ||
    !record.comercial ||
    validateProducerCommercial(record.comercial).length
  ) {
    throw new ConcurrencyError(
      'PRODUTOR_INELEGIVEL',
      'Produtor sem aprovação/configuração comercial válida.',
    );
  }
  const settings = record.comercial;
  const selection = input.selecao;
  if (
    !selection ||
    !['levantamento', 'entrega'].includes(selection.modalidade) ||
    !settings.modalidades[selection.modalidade]
  )
    throw new ConcurrencyError('MODALIDADE_INDISPONIVEL', 'Modalidade indisponível.');
  if (!settings.metodosPagamento.includes(selection.metodoPagamento))
    throw new ConcurrencyError('METODO_NAO_ACEITE', 'Método de pagamento não aceite.');
  const fee = selection.modalidade === 'entrega' ? settings.taxaEntregaCent : 0;
  if (!Number.isSafeInteger(selection.taxaEntregaAceiteCent) || selection.taxaEntregaAceiteCent < 0)
    throw new ConcurrencyError('VALIDACAO', 'Taxa aceite inválida.');
  if (fee !== selection.taxaEntregaAceiteCent)
    throw new ConcurrencyError(
      'CONFIGURACAO_ALTERADA',
      'As condições comerciais devem ser reconfirmadas.',
    );
  if (
    selection.modalidade === 'entrega' &&
    (!selection.concelhoId || !settings.concelhosEntregaIds.includes(selection.concelhoId))
  )
    throw new ConcurrencyError('CONCELHO_NAO_ABRANGIDO', 'Concelho não abrangido.');
  if (!selection.periodo || !producerPeriodFits(settings, selection))
    throw new ConcurrencyError(
      'HORARIO_INCOMPATIVEL',
      'Período incompatível com a disponibilidade.',
    );
  if (operationalRevision(record.revisaoOperacional) !== input.revisaoEsperada)
    throw new ConcurrencyError('CONFLITO_VERSAO', 'A revisão da configuração/aprovação mudou.');
}
