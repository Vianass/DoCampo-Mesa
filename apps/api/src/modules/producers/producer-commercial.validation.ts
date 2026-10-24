import {
  maximumProducerDeliveryFeeCents,
  producerCommercialTextLimits,
  producerPaymentMethods,
  producerReceptionModalities,
  producerWeekDays,
} from './producer-commercial.constants.js';
import type {
  ProducerCommercialIssue,
  ProducerCommercialReadiness,
} from './producer-commercial.types.js';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && [...value].length <= maximum;
}
function identifier(value: unknown): value is string {
  return text(value, producerCommercialTextLimits.identifier) && !/[\s\p{Cc}]/u.test(value);
}
function minute(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return undefined;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

/** Verifica representação e checksum, não país/banco, titularidade ou existência de conta. */
export function validProducerIban(value: unknown): boolean {
  if (typeof value !== 'string' || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false;
  const rotated = value.slice(4) + value.slice(0, 4);
  const numeric = [...rotated]
    .map((character) =>
      /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character,
    )
    .join('');
  return BigInt(numeric) % 97n === 1n;
}

export function validateProducerCommercial(value: unknown): readonly ProducerCommercialIssue[] {
  if (value === undefined) return [];
  const issues: ProducerCommercialIssue[] = [];
  const fail = (campo: string, mensagem: string) =>
    issues.push({ campo: 'comercial.' + campo, mensagem });
  if (!object(value))
    return [
      {
        campo: 'comercial',
        mensagem: 'Configuração comercial estruturada obrigatória quando fornecida.',
      },
    ];
  const modes = value.modalidades;
  const modesValid =
    object(modes) && typeof modes.levantamento === 'boolean' && typeof modes.entrega === 'boolean';
  if (!modesValid) fail('modalidades', 'Indicar explicitamente as duas modalidades.');
  else if (!modes.levantamento && !modes.entrega)
    fail('modalidades', 'É necessária pelo menos uma modalidade ativa.');

  if (
    value.taxaEntregaCent !== undefined &&
    (typeof value.taxaEntregaCent !== 'number' ||
      !Number.isSafeInteger(value.taxaEntregaCent) ||
      value.taxaEntregaCent < 0 ||
      value.taxaEntregaCent > maximumProducerDeliveryFeeCents)
  ) {
    fail('taxaEntregaCent', 'Taxa em cêntimos inteiros seguros, não negativos.');
  }
  if (modesValid && modes.entrega && value.taxaEntregaCent === undefined)
    fail('taxaEntregaCent', 'Entrega ativa exige taxa explícita, que pode ser zero.');
  const municipalities = value.concelhosEntregaIds;
  if (!Array.isArray(municipalities) || municipalities.some((item) => !identifier(item)))
    fail('concelhosEntregaIds', 'Lista de identificadores estáveis inválida.');
  else if (new Set(municipalities).size !== municipalities.length)
    fail('concelhosEntregaIds', 'Concelhos sem duplicações.');
  if (modesValid && modes.entrega && Array.isArray(municipalities) && municipalities.length === 0)
    fail('concelhosEntregaIds', 'Entrega ativa exige concelhos abrangidos.');
  if (value.catalogoConcelhosVersao !== undefined && !identifier(value.catalogoConcelhosVersao))
    fail('catalogoConcelhosVersao', 'Referência de catálogo inválida.');

  const availability = value.disponibilidade;
  if (!object(availability)) fail('disponibilidade', 'Disponibilidade semanal obrigatória.');
  else {
    if (!text(availability.fusoHorario, producerCommercialTextLimits.timeZone))
      fail('disponibilidade.fusoHorario', 'Fuso horário obrigatório.');
    else {
      try {
        new Intl.DateTimeFormat('pt-PT', { timeZone: availability.fusoHorario });
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        fail('disponibilidade.fusoHorario', 'Fuso horário IANA inválido.');
      }
    }
    for (const mode of producerReceptionModalities) {
      const periods = availability[mode];
      const path = 'disponibilidade.' + mode;
      if (!Array.isArray(periods)) {
        fail(path, 'Os períodos devem ser uma lista.');
        continue;
      }
      if (modesValid && modes[mode] && periods.length === 0)
        fail(path, 'Modalidade ativa exige disponibilidade explícita.');
      const valid: { day: number; start: number; end: number }[] = [];
      for (const period of periods) {
        if (!object(period)) {
          fail(path, 'Intervalo estruturado inválido.');
          continue;
        }
        const start = minute(period.inicio);
        const end = minute(period.fim);
        if (
          !producerWeekDays.some((day) => day === period.diaSemana) ||
          start === undefined ||
          end === undefined ||
          start >= end
        ) {
          fail(path, 'Dia ISO, horas HH:mm ou ordem do intervalo inválidos.');
        } else valid.push({ day: period.diaSemana as number, start, end });
      }
      // Comparação numa cópia; horários das duas modalidades são independentes.
      valid.sort((a, b) => a.day - b.day || a.start - b.start || a.end - b.end);
      for (let index = 1; index < valid.length; index++) {
        const current = valid[index]!;
        const previous = valid[index - 1]!;
        if (current.day === previous.day && current.start < previous.end)
          fail(path, 'Intervalos duplicados ou sobrepostos na mesma modalidade/dia.');
      }
    }
  }
  const methods = value.metodosPagamento;
  if (
    !Array.isArray(methods) ||
    methods.length === 0 ||
    methods.some((method) => !producerPaymentMethods.some((allowed) => allowed === method))
  )
    fail('metodosPagamento', 'É necessário pelo menos um método suportado.');
  else if (new Set(methods).size !== methods.length)
    fail('metodosPagamento', 'Métodos sem duplicações.');

  const payment = value.pagamentoPrivado;
  if (payment !== undefined) {
    if (!object(payment)) fail('pagamentoPrivado', 'Dados privados de pagamento inválidos.');
    else {
      if (
        payment.mbWay !== undefined &&
        (!object(payment.mbWay) ||
          !text(payment.mbWay.contacto, producerCommercialTextLimits.contact))
      )
        fail('pagamentoPrivado.mbWay', 'Contacto privado inválido.');
      if (payment.transferenciaBancaria !== undefined) {
        const bank = payment.transferenciaBancaria;
        if (
          !object(bank) ||
          !validProducerIban(bank.iban) ||
          (bank.titular !== undefined &&
            !text(bank.titular, producerCommercialTextLimits.accountHolder))
        )
          fail(
            'pagamentoPrivado.transferenciaBancaria',
            'Dados privados de transferência inválidos.',
          );
      }
    }
  }
  return issues;
}

export function assessProducerCommercial(value: unknown): ProducerCommercialReadiness {
  const approved =
    object(value) && object(value.aprovacao) && value.aprovacao.estado === 'aprovado';
  const configured =
    object(value) &&
    value.comercial !== undefined &&
    validateProducerCommercial(value.comercial).length === 0;
  return { aprovado: approved, configurado: configured, prontoLocalmente: approved && configured };
}
