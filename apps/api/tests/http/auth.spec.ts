import { randomUUID } from 'node:crypto';
import express from 'express';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { startApi } from '../../src/runtime.js';
import { connectDatabase } from '../../src/database/connection.js';
import { errorHandler } from '../../src/http/error-handler.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createAccessControl } from '../../src/modules/auth/access-control.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { authConfiguration, authToken, registrationInput } from '../support/auth-fixtures.js';
import type { AuthRateLimitOptions } from '../../src/modules/auth/auth-rate-limit.js';

let database: Awaited<ReturnType<typeof connectDatabase>> | undefined;
const configuration = authConfiguration();
function connection() {
  if (!database) throw Error('Test database missing');
  return database.connection;
}
function auth() {
  return createAuthService(connection(), configuration);
}
function app(rateLimit: AuthRateLimitOptions = { ipLimit: 1000, accountLimit: 1000 }) {
  return createApp({ auth: auth(), security: configuration, rateLimit });
}
beforeAll(async () => {
  database = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
    }),
  );
  await auth().prepare();
});
afterAll(async () => {
  if (!database) return;
  try {
    await connection().dropDatabase();
  } finally {
    await database.close();
  }
});
async function registered() {
  const input = registrationInput();
  const service = auth();
  await service.register(input);
  const session = await service.login(input);
  return { input, session };
}

describe('endpoints REST de autenticação com persistência real', () => {
  it('o arranque real prepara o índice e disponibiliza os endpoints de autenticação', async () => {
    const runtime = await startApi(
      {
        ...parseEnvironment({
          NODE_ENV: 'test',
          MONGODB_URI: 'mongodb://127.0.0.1:27019/',
          MONGODB_DB_NAME: 'docampo_test_runtime_auth',
        }),
        port: 0,
      },
      { connect: async () => ({ connection: connection(), close: async () => undefined }) },
      configuration,
    );
    try {
      const input = registrationInput();
      await request(runtime.server).post('/api/auth/register').send(input).expect(202);
      await request(runtime.server)
        .post('/api/auth/login')
        .send({ email: input.email, password: input.password })
        .expect(200);
    } finally {
      await runtime.close();
    }
  });
  it('recusa operadores MongoDB no login antes de consultar credenciais', async () => {
    await request(app())
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } })
      .expect(400);
  });
  it('regista apenas comprador, normaliza email e protege password/estado/revisão', async () => {
    const input = registrationInput();
    const api = app();
    const response = await request(api)
      .post('/api/auth/register')
      .send({ ...input, email: ' ' + input.email.toUpperCase() + ' ' })
      .expect(202);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ mensagem: expect.any(String) });
    const stored = await createUserModel(connection())
      .findOne({ emailNormalizado: input.email })
      .select('+passwordHash')
      .orFail();
    expect(stored.papeis).toEqual(['comprador']);
    expect(stored.ativo).toBe(true);
    expect(stored.revisaoOperacional).toBe(0);
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(response.body)).not.toContain(input.password);
  });
  it('registo duplicado tem a mesma resposta e não altera a password existente', async () => {
    const input = registrationInput();
    const api = app();
    const first = await request(api).post('/api/auth/register').send(input).expect(202);
    const duplicate = await request(api)
      .post('/api/auth/register')
      .send({ ...input, password: 'Outra frase totalmente diferente!' })
      .expect(202);
    expect(duplicate.body).toEqual(first.body);
    await request(api)
      .post('/api/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(200);
    expect(
      await createUserModel(connection()).countDocuments({ emailNormalizado: input.email }),
    ).toBe(1);
  });
  it.each([
    { email: 'inválido' },
    { nome: '' },
    { password: 'curta' },
    { password: 42 },
    { nome: 'x'.repeat(121) },
  ])('recusa campos inválidos sem ecoar valores', async (change) => {
    const response = await request(app())
      .post('/api/auth/register')
      .send({ ...registrationInput(), ...change })
      .expect(400);
    expect(response.body.codigo).toBe('PEDIDO_INVALIDO');
    expect(response.body.campos.length).toBeGreaterThan(0);
  });
  it.each([
    { papel: 'administrador' },
    { papeis: ['produtor'] },
    { ativo: true },
    { revisaoOperacional: 4 },
    { passwordHash: 'segredo' },
  ])('bloqueia mass assignment no registo', async (extra) => {
    const input = registrationInput();
    await request(app())
      .post('/api/auth/register')
      .send({ ...input, ...extra })
      .expect(400);
    expect(
      await createUserModel(connection()).countDocuments({ emailNormalizado: input.email }),
    ).toBe(0);
  });
  it('login devolve JWT mínimo e me consulta apenas a identidade autenticada', async () => {
    const { input } = await registered();
    const api = app();
    const response = await request(api)
      .post('/api/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(200);
    expect(response.body).toMatchObject({
      tokenType: 'Bearer',
      expiresAt: expect.any(String),
      utilizador: { email: input.email, papeis: ['comprador'] },
    });
    const payload = JSON.parse(
      Buffer.from(response.body.accessToken.split('.')[1], 'base64url').toString(),
    );
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'jti', 'sub']);
    const me = await request(api)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ' + response.body.accessToken)
      .expect(200);
    expect(me.body).toEqual(response.body.utilizador);
    expect(Object.keys(me.body).sort()).toEqual(['email', 'id', 'nome', 'papeis']);
    await request(api)
      .get('/api/auth/me?userId=DEMO_ADMIN')
      .set('Authorization', 'Bearer ' + response.body.accessToken)
      .expect(400);
  });
  it('login inexistente/password incorreta/conta desativada usa a mesma resposta', async () => {
    const { input } = await registered();
    const api = app();
    const missing = await request(api)
      .post('/api/auth/login')
      .send({ email: randomUUID() + '@example.invalid', password: input.password })
      .expect(401);
    const wrong = await request(api)
      .post('/api/auth/login')
      .send({ email: input.email, password: 'Uma frase que não é a correta!' })
      .expect(401);
    const user = await createUserModel(connection())
      .findOne({ emailNormalizado: input.email })
      .select('+passwordHash')
      .orFail();
    user.ativo = false;
    await user.save();
    const disabled = await request(api)
      .post('/api/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(401);
    expect(wrong.body).toEqual(missing.body);
    expect(disabled.body).toEqual(missing.body);
  });
  it.each([
    undefined,
    'Bearer token-demonstrativo',
    'Basic credenciais',
    'Bearer a.b.c',
    'Bearer ' + 'a'.repeat(2100),
  ])('recusa JWT ausente ou inválido', async (header) => {
    const req = request(app()).get('/api/auth/me').set('X-Role', 'administrador');
    if (header) req.set('Authorization', header);
    const response = await req.expect(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });
  it.each(['expirado', 'adulterado', 'inexistente', 'desativado'] as const)(
    'recusa JWT %s',
    async (kind) => {
      const { session } = await registered();
      const now = Math.floor(Date.now() / 1000);
      let token = session.accessToken;
      if (kind === 'expirado')
        token = await authToken(configuration, session.utilizador.id, {
          iat: now - 1800,
          exp: now - 1,
        });
      if (kind === 'adulterado') token = token.slice(0, -8) + 'AAAAAAAA';
      if (kind === 'inexistente')
        token = await authToken(configuration, new Types.ObjectId().toHexString());
      if (kind === 'desativado') {
        const user = await createUserModel(connection())
          .findById(session.utilizador.id)
          .select('+passwordHash')
          .orFail();
        user.ativo = false;
        await user.save();
      }
      await request(app())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer ' + token)
        .expect(401);
    },
  );
  it('logout declara o limite de revogação e o token mantém-se válido até expirar', async () => {
    const { session } = await registered();
    const api = app();
    const logout = await request(api)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer ' + session.accessToken)
      .send({})
      .expect(200);
    expect(logout.body.revogado).toBe(false);
    await request(api)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ' + session.accessToken)
      .expect(200);
    await request(api).post('/api/auth/logout').expect(401);
  });
  it('limita tentativas por conta normalizada, com Retry-After e sem reset por sucesso', async () => {
    const { input } = await registered();
    let time = 1000;
    const api = app({ ipLimit: 100, accountLimit: 2, windowMs: 60_000, now: () => time });
    for (let i = 0; i < 2; i++)
      await request(api)
        .post('/api/auth/login')
        .send({ email: input.email, password: input.password })
        .expect(200);
    const blocked = await request(api)
      .post('/api/auth/login')
      .send({ email: input.email.toUpperCase(), password: input.password })
      .expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    time += 60_001;
    await request(api)
      .post('/api/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(200);
  });
  it('limite por IP impede contornar a quota trocando emails ou X-Forwarded-For', async () => {
    const api = app({ ipLimit: 2, accountLimit: 10 });
    for (let i = 0; i < 2; i++)
      await request(api)
        .post('/api/auth/login')
        .send({ email: registrationInput().email, password: 'incorreta' })
        .expect(401);
    await request(api)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.22')
      .send({ email: registrationInput().email, password: 'incorreta' })
      .expect(429);
  });
  it('quota de memória esgotada falha fechada sem eliminar entradas para contornar limites', async () => {
    const api = app({ ipLimit: 100, accountLimit: 100, maxEntries: 1 });
    await request(api)
      .post('/api/auth/login')
      .send({ email: registrationInput().email, password: 'incorreta' })
      .expect(429);
  });
  it('aplica CORS exato e recusa origens/headers não autorizados', async () => {
    const api = app();
    await request(api)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization, Content-Type')
      .expect(204);
    const allowed = await request(api)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBeUndefined();
    await request(api).get('/api/health').set('Origin', 'https://intruso.invalid').expect(403);
    await request(api)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'X-Role')
      .expect(403);
  });
  it('produção exige HTTPS e só aceita informação de proxy configurado explicitamente', async () => {
    const secure = { ...configuration, production: true };
    await request(createApp({ auth: auth(), security: secure }))
      .get('/api/health')
      .set('X-Forwarded-Proto', 'https')
      .expect(400);
    const proxied = createApp({
      auth: auth(),
      security: { ...secure, trustedProxies: ['127.0.0.1', '::1'] },
    });
    const response = await request(proxied)
      .get('/api/health')
      .set('X-Forwarded-Proto', 'https')
      .expect(200);
    expect(response.headers['strict-transport-security']).toBe('max-age=31536000');
  });
  it('rejeita JSON inválido/corpos comprimidos e não regista nem devolve credenciais', async () => {
    const api = app();
    await request(api)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"password":"segredo"')
      .expect(400);
    await request(api)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send('{}')
      .expect(415);
    await request(api)
      .post('/api/auth/register')
      .type('form')
      .send({ email: 'privado@example.invalid' })
      .expect(415);
  });
  it('não ativa checkout ou operações comerciais com um JWT real', async () => {
    const { session } = await registered();
    await request(app())
      .post('/api/orders')
      .set('Authorization', 'Bearer ' + session.accessToken)
      .send({})
      .expect(404);
  });
});

describe('middleware de papéis e propriedade, harness sem rotas comerciais', () => {
  it('consulta papéis atuais e não confia em claims ou headers do cliente', async () => {
    const { session } = await registered();
    const api = express();
    const access = createAccessControl(auth());
    api.get('/admin', access.authenticate, access.requireRoles('administrador'), (_req, res) =>
      res.json({ permitido: true }),
    );
    api.use(errorHandler);
    const forgedRole = await authToken(configuration, session.utilizador.id, {
      papeis: ['administrador'],
    });
    await request(api)
      .get('/admin')
      .set('Authorization', 'Bearer ' + forgedRole)
      .set('X-Role', 'administrador')
      .expect(403);
    const user = await createUserModel(connection())
      .findById(session.utilizador.id)
      .select('+passwordHash')
      .orFail();
    user.papeis = ['administrador'];
    await user.save();
    await request(api)
      .get('/admin')
      .set('Authorization', 'Bearer ' + session.accessToken)
      .expect(200);
    user.papeis = ['comprador'];
    await user.save();
    await request(api)
      .get('/admin')
      .set('Authorization', 'Bearer ' + session.accessToken)
      .expect(403);
  });
  it('comprador/produtor só acede ao recurso próprio, sem bypass implícito de administrador', async () => {
    const first = await registered();
    const second = await registered();
    const api = express();
    const access = createAccessControl(auth());
    api.get(
      '/proprio',
      access.authenticate,
      access.requireRoles('comprador', 'produtor'),
      access.requireOwnership(async () => first.session.utilizador.id),
      (_req, res) => res.json({ permitido: true }),
    );
    api.use(errorHandler);
    await request(api).get('/proprio').expect(401);
    await request(api)
      .get('/proprio')
      .set('Authorization', 'Bearer ' + first.session.accessToken)
      .expect(200);
    await request(api)
      .get('/proprio')
      .set('Authorization', 'Bearer ' + second.session.accessToken)
      .expect(403);
    const user = await createUserModel(connection())
      .findById(second.session.utilizador.id)
      .select('+passwordHash')
      .orFail();
    user.papeis = ['administrador', 'produtor'];
    await user.save();
    await request(api)
      .get('/proprio')
      .set('Authorization', 'Bearer ' + second.session.accessToken)
      .expect(403);
  });
});
