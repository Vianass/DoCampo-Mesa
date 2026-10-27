export function orderDate(value: string, zone?: string) {
  try {
    return new Intl.DateTimeFormat('pt-PT', {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(zone ? { timeZone: zone } : {}),
    }).format(new Date(value));
  } catch {
    return 'Informação de data indisponível';
  }
}
