import { it, expect } from 'vitest';
import { confirmReceiptInput } from '../../src/modules/orders/order-receipt.service.js';
import { orderUpdate, orderWatchInput } from '../../src/realtime/order.protocol.js';
it.each([
  {},
  { confirmarRececao: false },
  { confirmarRececao: 'true' },
  { confirmarRececao: true, estado: 'concluida' },
  { confirmarRececao: true, comprador: 'outro' },
])('exige confirmação explícita estrita %j', (body) =>
  expect(confirmReceiptInput.safeParse(body).success).toBe(false),
);
it('aceita apenas confirmação explícita sem autoridade do cliente', () => {
  expect(confirmReceiptInput.parse({ confirmarRececao: true })).toEqual({ confirmarRececao: true });
});
it.each([{ sala: 'outra' }, { encomendaId: '000000000000000000000001' }, { userId: 'outro' }])(
  'a subscrição não aceita identidades nem rooms %j',
  (v) => expect(orderWatchInput.safeParse(v).success).toBe(false),
);
it('evento contém exclusivamente estado confirmado mínimo', () => {
  const v = {
    encomendaId: '000000000000000000000001',
    estado: 'concluida',
    versao: 4,
    atualizadaEm: '2026-10-31T10:00:00Z',
  };
  expect(orderUpdate.safeParse(v).success).toBe(true);
  for (const extra of [{ morada: 'privada' }, { token: 'privado' }, { historico: [] }])
    expect(orderUpdate.safeParse({ ...v, ...extra }).success).toBe(false);
  expect(orderUpdate.safeParse({ ...v, versao: -1 }).success).toBe(false);
});
