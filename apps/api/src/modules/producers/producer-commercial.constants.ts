export const producerReceptionModalities = ['levantamento', 'entrega'] as const;
export const producerPaymentMethods = ['dinheiro', 'mb_way', 'transferencia_bancaria'] as const;
// ISO: segunda-feira = 1; domingo = 7. Horas locais HH:mm, na zona configurada.
export const producerWeekDays = [1, 2, 3, 4, 5, 6, 7] as const;
export const maximumProducerDeliveryFeeCents = Number.MAX_SAFE_INTEGER;
export const producerCommercialTextLimits = {
  identifier: 128,
  contact: 64,
  accountHolder: 160,
  timeZone: 100,
} as const;
