import request from 'supertest';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { unauthorized, type AuthService } from '../../src/modules/auth/auth.service.js';
import type { ProducerApplicationService } from '../../src/modules/producer-applications/producer-application.service.js';
import { authConfiguration } from '../support/auth-fixtures.js';
import { producerApplicationInput } from '../support/producer-application-fixtures.js';

// Apenas fronteira HTTP; autorização atual e transações são verificadas em MongoDB real.
const id = new Types.ObjectId().toHexString(),
  token = 'ZXhhbXBsZQ.dGVzdA.c2lnbmF0dXJl';
const selfPath = '/api/me/producer-application',
  adminPath = '/api/admin/producer-applications';
const submit = vi.fn(),
  self = vi.fn(),
  list = vi.fn(),
  detail = vi.fn(),
  decide = vi.fn();
let roles = ['comprador'];
const service = { submit, self, list, detail, decide } as unknown as ProducerApplicationService;
const auth = {
  authenticate: vi.fn(async (value: string) => {
    if (value !== token) throw unauthorized();
    return { id, nome: 'Pessoa fictícia', email: 'teste@example.invalid', papeis: roles };
  }),
} as unknown as AuthService;
const app = createApp({ auth, producerApplications: service, security: authConfiguration() });
const bearer = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
beforeEach(() => {
  vi.clearAllMocks();
  roles = ['comprador'];
  for (const fn of [submit, self, detail, decide])
    fn.mockResolvedValue({ body: { id, estado: 'pendente' }, etag: '"etaginterno"' });
  list.mockResolvedValue({ itens: [], total: 0 });
});
describe('HTTP de candidaturas', () => {
  it.each([
    ['get', selfPath],
    ['post', selfPath],
    ['get', adminPath],
    ['get', adminPath + '/' + id],
    ['post', adminPath + '/' + id + '/approve'],
    ['post', adminPath + '/' + id + '/reject'],
  ] as const)('%s %s exige Bearer', async (method, path) => {
    const result = await request(app)[method](path).expect(401);
    expect(result.headers['www-authenticate']).toBe('Bearer');
    expect(submit).not.toHaveBeenCalled();
    expect(decide).not.toHaveBeenCalled();
  });
  it('permite candidatura própria sem papel de produtor, usando apenas identidade autenticada', async () => {
    const result = await bearer(request(app).post(selfPath))
      .send(producerApplicationInput())
      .expect(201);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ id, papeis: ['comprador'] }),
      producerApplicationInput(),
    );
    expect(result.headers.location).toBe(selfPath);
    expect(result.headers.etag).toBe('"etaginterno"');
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('consulta própria não aceita ID de outro candidato', async () => {
    await bearer(request(app).get(selfPath)).expect(200);
    expect(self).toHaveBeenCalledWith(expect.objectContaining({ id }));
    await bearer(request(app).get(selfPath + '?userId=' + id)).expect(400);
  });
  it.each(['comprador', 'produtor'])(
    '%s não acede a qualquer operação administrativa',
    async (role) => {
      roles = [role];
      await bearer(request(app).get(adminPath)).expect(403);
      await bearer(request(app).get(adminPath + '/' + id)).expect(403);
      for (const action of ['approve', 'reject'])
        await bearer(request(app).post(adminPath + '/' + id + '/' + action))
          .send({})
          .expect(403);
      expect(list).not.toHaveBeenCalled();
      expect(detail).not.toHaveBeenCalled();
      expect(decide).not.toHaveBeenCalled();
    },
  );
  it('encaminha filtros, paginação e ETag para administrador', async () => {
    roles = ['administrador'];
    await bearer(
      request(app).get(adminPath + '?estado=rejeitado&pagina=2&porPagina=24&ordem=antigas'),
    ).expect(200);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ id }), {
      estado: 'rejeitado',
      pagina: 2,
      porPagina: 24,
      ordem: 'antigas',
    });
    const result = await bearer(request(app).get(adminPath + '/' + id)).expect(200);
    expect(detail).toHaveBeenCalledWith(expect.objectContaining({ id }), id);
    expect(result.headers.etag).toBe('"etaginterno"');
  });
  it.each([
    ['approve', {}, 'aprovado', undefined],
    [
      'reject',
      { justificacao: '  Informação insuficiente.  ' },
      'rejeitado',
      'Informação insuficiente.',
    ],
  ] as const)(
    'encaminha decisão %s sem permitir autoria do cliente',
    async (action, body, state, reason) => {
      roles = ['administrador'];
      await bearer(request(app).post(adminPath + '/' + id + '/' + action))
        .set('If-Match', '"versao"')
        .send(body)
        .expect(200);
      expect(decide).toHaveBeenCalledWith(
        expect.objectContaining({ id }),
        id,
        state,
        '"versao"',
        reason,
      );
    },
  );
  it.each(['userId', 'papeis', 'estado', 'aprovacao', 'historicoCandidaturas', 'ativo'])(
    'recusa escalada via %s',
    async (field) => {
      await bearer(request(app).post(selfPath))
        .send({ ...producerApplicationInput(), [field]: 'produtor' })
        .expect(400);
      expect(submit).not.toHaveBeenCalled();
    },
  );
  it.each(['approve', 'reject'])(
    '%s recusa campos de decisão e autoria inesperados',
    async (action) => {
      roles = ['administrador'];
      await bearer(request(app).post(adminPath + '/' + id + '/' + action))
        .send({ justificacao: 'Teste', administradorId: id, data: new Date().toISOString() })
        .expect(400);
      expect(decide).not.toHaveBeenCalled();
    },
  );
  it('rejeição vazia ou aprovação com motivo inesperado é inválida', async () => {
    roles = ['administrador'];
    await bearer(request(app).post(adminPath + '/' + id + '/reject'))
      .send({ justificacao: ' ' })
      .expect(400);
    await bearer(request(app).post(adminPath + '/' + id + '/approve'))
      .send({ justificacao: 'Motivo' })
      .expect(400);
    expect(decide).not.toHaveBeenCalled();
  });
  it('recusa identificadores, filtros e query inesperados', async () => {
    roles = ['administrador'];
    await bearer(request(app).get(adminPath + '/invalido')).expect(400);
    await bearer(request(app).get(adminPath + '?estado=approved')).expect(400);
    await bearer(request(app).post(adminPath + '/' + id + '/approve?estado=aprovado'))
      .send({})
      .expect(400);
  });
  it('exige JSON, trata JSON inválido e não encaminha o payload', async () => {
    await bearer(request(app).post(selfPath)).type('text').send('texto').expect(415);
    await bearer(request(app).post(selfPath)).type('json').send('{').expect(400);
    expect(submit).not.toHaveBeenCalled();
  });
  it('recusa múltiplos If-Match', async () => {
    roles = ['administrador'];
    await bearer(request(app).post(adminPath + '/' + id + '/approve'))
      .set({ 'If-Match': ['"a"', '"b"'] })
      .send({})
      .expect(400);
    expect(decide).not.toHaveBeenCalled();
  });
  it('falha fechada sem serviço de autenticação', async () => {
    const isolated = createApp({ producerApplications: service });
    await request(isolated)
      .post(selfPath)
      .set('Authorization', 'Bearer ' + token)
      .send(producerApplicationInput())
      .expect(401);
    expect(submit).not.toHaveBeenCalled();
  });
});
