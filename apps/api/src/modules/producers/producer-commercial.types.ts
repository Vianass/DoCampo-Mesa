import type {
  producerPaymentMethods,
  producerReceptionModalities,
  producerWeekDays,
} from './producer-commercial.constants.js';

export type ProducerPaymentMethod = (typeof producerPaymentMethods)[number];
export type ProducerReceptionModality = (typeof producerReceptionModalities)[number];
export type ProducerWeekDay = (typeof producerWeekDays)[number];

export interface ProducerWeeklyPeriod {
  readonly diaSemana: ProducerWeekDay;
  readonly inicio: string;
  readonly fim: string;
}

export interface ProducerWeeklyAvailability {
  readonly fusoHorario: string;
  readonly levantamento: readonly ProducerWeeklyPeriod[];
  readonly entrega: readonly ProducerWeeklyPeriod[];
}

export interface ProducerPrivatePayment {
  readonly mbWay?: { readonly contacto: string };
  readonly transferenciaBancaria?: { readonly iban: string; readonly titular?: string };
}

/** Configuração completa opcional no perfil; não é uma ativação de vendas ou DTO HTTP. */
export interface ProducerCommercialSettings {
  readonly modalidades: { readonly levantamento: boolean; readonly entrega: boolean };
  readonly taxaEntregaCent?: number;
  readonly concelhosEntregaIds: readonly string[];
  readonly catalogoConcelhosVersao?: string;
  readonly disponibilidade: ProducerWeeklyAvailability;
  readonly metodosPagamento: readonly ProducerPaymentMethod[];
  readonly pagamentoPrivado?: ProducerPrivatePayment;
}

export interface ProducerCommercialIssue {
  readonly campo: string;
  readonly mensagem: string;
}

export interface ProducerCommercialReadiness {
  readonly aprovado: boolean;
  readonly configurado: boolean;
  /** Apenas condições locais: falta verificar conta, concorrência e restante checkout. */
  readonly prontoLocalmente: boolean;
}
