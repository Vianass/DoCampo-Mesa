import request from 'supertest';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { unauthorized, type AuthService } from '../../src/modules/auth/auth.service.js';
import type { AdminService } from '../../src/modules/admin/admin.service.js';
import { authConfiguration } from '../support/auth-fixtures.js';
const id = '000000000000000000000501',
  token = 'ZXhhbXBsZQ.dGVzdA.c2lnbmF0dXJl';
const dashboard = vi.fn(),
  list = vi.fn(),
  detail = vi.fn(),
  audit = vi.fn(),
  changeState = vi.fn();
let roles = ['administrador'];
const service = { dashboard, list, detail, audit, changeState } as unknown as AdminService;
const auth = {
  authenticate: vi.fn(async (value: string) => {
    if (value !== token) throw unauthorized();
    return { id, nome: 'Pessoa fictícia', email: 'a@example.invalid', papeis: roles };
  }),
} as unknown as AuthService;
const app = createApp({
  auth,
  admin: service,
  adminLimits: { ipLimit: 10000, accountLimit: 10000 },
  security: authConfiguration(),
});
const bearer = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
beforeEach(() => {
  vi.clearAllMocks();
  roles = ['administrador'];
  dashboard.mockResolvedValue({ totalUtilizadores: 1 });
  list.mockResolvedValue({ itens: [], total: 0 });
  audit.mockResolvedValue({ itens: [], total: 0 });
  for (const fn of [detail, changeState])
    fn.mockResolvedValue({ body: { id, ativo: true }, etag: '"' + 'a'.repeat(43) + '"' });
});
const paths = ['/dashboard', '/users', '/users/' + id, '/users/' + id + '/audit'];
describe('fronteira HTTP administrativa', () => {
  it.each(paths)('%s exige autenticação', async (path) => {
    await request(app)
      .get('/api/admin' + path)
      .expect(401);
    expect(list).not.toHaveBeenCalled();
  });
  it.each(['comprador', 'produtor'])('%s não consulta nem altera contas', async (role) => {
    roles = [role];
    for (const path of paths) await bearer(request(app).get('/api/admin' + path)).expect(403);
    await bearer(request(app).patch('/api/admin/users/' + id + '/state'))
      .send({ ativo: false, motivo: 'Teste' })
      .expect(403);
    expect(changeState).not.toHaveBeenCalled();
  });
  it('encaminha consultas e projeções administrativas com no-store', async () => {
    await bearer(request(app).get('/api/admin/dashboard')).expect(200);
    await bearer(
      request(app).get('/api/admin/users?pesquisa=horta&estado=inativo&papel=produtor&pagina=2'),
    ).expect(200);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ id }),
      expect.objectContaining({
        pesquisa: 'horta',
        estado: 'inativo',
        papel: 'produtor',
        pagina: 2,
      }),
    );
    const result = await bearer(request(app).get('/api/admin/users/' + id)).expect(200);
    expect(result.headers.etag).toMatch(/^"/);
    expect(result.headers['cache-control']).toBe('no-store');
    await bearer(request(app).get('/api/admin/users/' + id + '/audit?pagina=2')).expect(200);
  });
  it.each([
    { ativo: false, motivo: 'teste', papeis: ['administrador'] },
    { ativo: false, motivo: '' },
    { ativo: 'false', motivo: 'teste' },
    { ativo: false, motivo: 'teste', passwordHash: 'forjado' },
  ])('body estrito %j', async (body) => {
    await bearer(request(app).patch('/api/admin/users/' + id + '/state'))
      .send(body)
      .expect(400);
    expect(changeState).not.toHaveBeenCalled();
  });
  it('conserva If-Match e autoria real; não aceita query ou ID arbitrários', async () => {
    await bearer(request(app).patch('/api/admin/users/' + id + '/state'))
      .set('If-Match', '"versao"')
      .send({ ativo: false, motivo: '  Rever acesso.  ' })
      .expect(200);
    expect(changeState).toHaveBeenCalledWith(
      expect.objectContaining({ id }),
      id,
      { ativo: false, motivo: 'Rever acesso.' },
      '"versao"',
    );
    await bearer(request(app).get('/api/admin/users/invalido')).expect(400);
    await bearer(request(app).get('/api/admin/users?sort[$ne]=x')).expect(400);
    await bearer(request(app).get('/api/admin/dashboard?extra=1')).expect(400);
  });
  it('rate limiting tem 429 e Retry-After sem conceder acesso', async () => {
    const limited = createApp({
      auth,
      admin: service,
      adminLimits: { ipLimit: 1, accountLimit: 1 },
    });
    await bearer(request(limited).get('/api/admin/dashboard')).expect(200);
    const result = await bearer(request(limited).get('/api/admin/dashboard')).expect(429);
    expect(result.headers['retry-after']).toBeDefined();
  });
});
