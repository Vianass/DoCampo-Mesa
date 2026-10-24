import type { ProducerCommercialSettings } from '../../src/modules/producers/producer-commercial.types.js';

// BBAN totalmente nulo, checksum calculado apenas para testar formato; não é conta real.
export const fictitiousProducerIban = 'PT77000000000000000000000';
export const fictitiousMbWayContact = '+351 000 000 000';

export function producerCommercialInput(
  overrides: Partial<ProducerCommercialSettings> = {},
): ProducerCommercialSettings {
  return {
    modalidades: { levantamento: true, entrega: true },
    taxaEntregaCent: 250,
    concelhosEntregaIds: ['concelho-ficticio-001', 'concelho-ficticio-002'],
    catalogoConcelhosVersao: 'catalogo-ficticio-v1',
    disponibilidade: {
      fusoHorario: 'Europe/Lisbon',
      levantamento: [{ diaSemana: 1, inicio: '09:00', fim: '12:00' }],
      entrega: [{ diaSemana: 1, inicio: '14:00', fim: '18:00' }],
    },
    metodosPagamento: ['dinheiro', 'mb_way', 'transferencia_bancaria'],
    pagamentoPrivado: {
      mbWay: { contacto: fictitiousMbWayContact },
      transferenciaBancaria: { iban: fictitiousProducerIban, titular: 'Titular fictício' },
    },
    ...overrides,
  };
}

export function pickupCommercialInput(): ProducerCommercialSettings {
  return {
    modalidades: { levantamento: true, entrega: false },
    concelhosEntregaIds: [],
    disponibilidade: {
      fusoHorario: 'Europe/Lisbon',
      levantamento: [{ diaSemana: 7, inicio: '10:00', fim: '12:00' }],
      entrega: [],
    },
    metodosPagamento: ['dinheiro'],
  };
}
