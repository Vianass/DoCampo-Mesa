import request from 'supertest';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { unauthorized, type AuthService } from '../../src/modules/auth/auth.service.js';
import type { AdminService } from '../../src/modules/admin/admin.service.js';
import type { AdminOrdersService } from '../../src/modules/admin-orders/admin-orders.service.js';
import { authConfiguration } from '../support/auth-fixtures.js';
const id = '000000000000000000000501',
  token = 'ZXhhbXBsZQ.dGVzdA.c2lnbmF0dXJl';
const list = vi.fn(),
  detail = vi.fn(),
  history = vi.fn();
let roles = ['administrador'];
const app = createApp({
  auth: {
    authenticate: vi.fn(async (value) => {
      if (value !== token) throw unauthorized();
      return { id, papeis: roles };
    }),
  } as unknown as AuthService,
  admin: {} as AdminService,
  adminOrders: { list, detail, history } as AdminOrdersService,
  adminLimits: { ipLimit: 10000, accountLimit: 10000 },
  security: authConfiguration(),
});
const paths = ['/orders', '/orders/' + id, '/orders/' + id + '/history'];
const get = (p: string) =>
  request(app)
    .get('/api/admin' + p)
    .set('Authorization', 'Bearer ' + token);
beforeEach(() => {
  roles = ['administrador'];
  vi.clearAllMocks();
  list.mockResolvedValue({ itens: [] });
  detail.mockResolvedValue({ id });
  history.mockResolvedValue({ itens: [] });
});
describe('fronteira HTTP de supervisão', () => {
  it.each(paths)('%s exige JWT', async (p) => {
    await request(app)
      .get('/api/admin' + p)
      .expect(401);
    expect(list).not.toHaveBeenCalled();
  });
  it.each(['comprador', 'produtor'])('%s não acede por rota direta', async (role) => {
    roles = [role];
    for (const p of paths) await get(p).expect(403);
    expect(list).not.toHaveBeenCalled();
  });
  it('encaminha filtros validados e impede cache', async () => {
    await get('/orders?estado=pronta&pagamento=por_pagar&pagina=2')
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ id }),
      expect.objectContaining({
        estado: 'pronta',
        pagamento: 'por_pagar',
        pagina: 2,
        porPagina: 12,
      }),
    );
    await get('/orders/' + id).expect(200);
    await get('/orders/' + id + '/history?dominio=pagamento').expect(200);
    expect(history).toHaveBeenCalledWith(
      expect.anything(),
      id,
      expect.objectContaining({ dominio: 'pagamento' }),
    );
  });
  it.each([
    '/orders?estado=x',
    '/orders?produtor=x',
    '/orders?desde=2026-02-30',
    '/orders?pagina=1001',
    '/orders?extra=1',
    '/orders/invalid',
    '/orders/' + id + '?extra=1',
    '/orders/' + id + '/history?dominio=x',
  ])('recusa %s', async (p) => {
    await get(p).expect(400);
    expect(list).not.toHaveBeenCalled();
  });
  it.each(['post', 'patch', 'delete'] as const)('não disponibiliza comando %s', async (method) => {
    const client = request(app);
    await client[method]('/api/admin/orders/' + id)
      .set('Authorization', 'Bearer ' + token)
      .send({ estado: 'cancelada' })
      .expect(404);
  });
});
