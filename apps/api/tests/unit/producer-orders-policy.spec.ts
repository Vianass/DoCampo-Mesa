import { describe, expect, it } from 'vitest';
import {
  producerTransitions,
  producerStatusBody,
} from '../../src/modules/orders/producer-orders.policy.js';
import { orderStates } from '../../src/modules/orders/order.constants.js';
describe('percurso operacional do produtor', () => {
  it.each(orderStates)('capacidades fechadas para %s', (state) => {
    const expected = {
      pendente: ['confirmada'],
      confirmada: ['em_preparacao'],
      em_preparacao: ['pronta'],
      pronta: [],
      concluida: [],
      cancelada: [],
    };
    expect(producerTransitions(state)).toEqual(expected[state]);
  });
  it('o corpo recusa campos de pagamento, versões e snapshots', () => {
    for (const extra of ['pagamento', 'produtorId', 'versao', 'linhas'])
      expect(producerStatusBody.safeParse({ estado: 'confirmada', [extra]: 1 }).success).toBe(
        false,
      );
  });
});
