import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import {
  adminOrderQuery,
  adminOrderHistoryQuery,
} from '../../src/modules/admin-orders/admin-orders.validation.js';
import {
  adminOrderFilter,
  adminOrderEvent,
} from '../../src/modules/admin-orders/admin-orders.service.js';
import { orderEvent } from '../support/order-fixtures.js';
describe('supervisão: limites e projeções', () => {
  it.each([
    { pagina: '0' },
    { pagina: '1001' },
    { porPagina: '999' },
    { estado: 'entregue' },
    { pagamento: 'reembolsado' },
    { produtor: '.*' },
    { comprador: { $ne: null } },
    { identificador: '123' },
    { desde: '2026-02-30' },
    { desde: '1969-01-01' },
    { ate: '9999-12-31' },
    { desde: '2026-10-30', ate: '2026-10-29' },
    { extra: 'injetado' },
    { desde: ['2026-10-01', '2026-10-02'] },
  ])('recusa filtro inválido %j', (q) => expect(adminOrderQuery.safeParse(q).success).toBe(false));
  it('combina referências de contas, ID, estados e dias UTC inclusivos', () => {
    const id = '000000000000000000000111';
    const q = adminOrderQuery.parse({
      produtor: id,
      comprador: id,
      identificador: id.toUpperCase(),
      estado: 'pronta',
      pagamento: 'pago',
      desde: '2026-10-01',
      ate: '2026-10-30',
    });
    expect(adminOrderFilter(q)).toEqual({
      produtor: new Types.ObjectId(id),
      comprador: new Types.ObjectId(id),
      _id: new Types.ObjectId(id),
      estado: 'pronta',
      'pagamento.estado': 'pago',
      createdAt: { $gte: new Date('2026-10-01Z'), $lt: new Date('2026-10-31Z') },
    });
  });
  it('consulta vazia tem paginação limitada sem filtros implícitos', () => {
    expect(adminOrderQuery.parse({})).toEqual({ pagina: 1, porPagina: 12, ordem: 'recentes' });
    expect(adminOrderFilter(adminOrderQuery.parse({}))).toEqual({});
  });
  it('histórico não aceita fontes arbitrárias', () => {
    expect(adminOrderHistoryQuery.parse({})).toMatchObject({ dominio: 'operacional' });
    expect(adminOrderHistoryQuery.safeParse({ dominio: 'idempotencia' }).success).toBe(false);
  });
  it('evento mantém só evidência persistida e responsável, sem comandos/revisões/conteúdo', () => {
    const event = {
      ...orderEvent('evento', 'confirmada', 'produtor'),
      de: 'pendente',
      justificacao: 'Motivo registado',
      conteudo: 'privado',
    };
    const dto = adminOrderEvent(event);
    expect(dto).toMatchObject({
      de: 'pendente',
      para: 'confirmada',
      responsavel: { tipo: 'utilizador', papel: 'produtor' },
      justificacao: 'Motivo registado',
    });
    for (const f of ['comandoId', 'versaoObservada', 'id', 'conteudo'])
      expect(dto).not.toHaveProperty(f);
    expect(
      adminOrderEvent({ ...event, ator: { tipo: 'sistema', identificador: 'interno' } })
        .responsavel,
    ).toEqual({ tipo: 'sistema' });
  });
});
