import { expect, test } from '@playwright/test';
import { createAccountSession } from '../src/features/auth/account-session';
import { parseAccount, parseLogin, type AuthApi } from '../src/features/auth/auth-api';
import { validateAccountForm } from '../src/features/auth/validation';
import { accountDestination } from '../src/features/private-area/navigation';
import { ApiFailure } from '../src/features/api/client';
import { fixtureToken, fixtureUser, fixturePassword } from './support/auth-fixtures';
function api(): AuthApi {
  return {
    register: async () => undefined,
    login: async () => ({
      accessToken: fixtureToken,
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      utilizador: fixtureUser,
    }),
    me: async () => fixtureUser,
    logout: async () => undefined,
  };
}
const credentials = { email: fixtureUser.email, password: fixturePassword };
test('a projeção de conta aceita capacidades múltiplas e elimina campos não públicos', () => {
  expect(
    parseAccount({
      ...fixtureUser,
      papeis: ['comprador', 'produtor'],
      passwordHash: 'campo privado',
    }),
  ).toEqual({ ...fixtureUser, papeis: ['comprador', 'produtor'] });
});
for (const [index, value] of [
  { ...fixtureUser, id: 'slug' },
  { ...fixtureUser, papeis: [] },
  { ...fixtureUser, papeis: ['admin'] },
  { ...fixtureUser, papeis: ['comprador', 'comprador'] },
].entries())
  test('respostas de identidade inválidas não se tornam permissões ' + index, () => {
    expect(() => parseAccount(value)).toThrow();
  });
test('resposta de login inválida é rejeitada sem incluir o token no erro', () => {
  expect(() =>
    parseLogin({
      accessToken: 'valor secreto inválido',
      tokenType: 'Cookie',
      expiresAt: 'amanhã',
      utilizador: fixtureUser,
    }),
  ).toThrow('Resposta do catálogo inválida.');
});
test('validação real conta pontos de código e não exige regras de composição inventadas', () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    name: 'Pessoa',
    email: fixtureUser.email,
    password: 'abcdefghijklmno',
    confirmPassword: 'abcdefghijklmno',
  }))
    form.set(key, value);
  expect(validateAccountForm('registration', form)).toEqual({});
  form.set('password', 'a'.repeat(129));
  expect(validateAccountForm('registration', form).password).toBeTruthy();
  form.set('password', 'a\0'.repeat(10));
  expect(validateAccountForm('login', form).password).toBeTruthy();
  form.set('password', 'curta');
  expect(validateAccountForm('login', form)).toEqual({});
});
test('destinos respeitam todas as capacidades confirmadas e recusam URLs externas', () => {
  expect(accountDestination('/area/produtor/produtos', ['comprador', 'produtor'])).toBe(
    '/area/produtor/produtos',
  );
  expect(accountDestination('/area/administrador', ['comprador'])).toBe('/area/comprador');
  expect(accountDestination('https://example.invalid', ['comprador'])).toBe('/area/comprador');
  expect(accountDestination('/area/comprador?token=nao-enviar', ['comprador'])).toBe(
    '/area/comprador',
  );
});
test('login só publica identidade após confirmação /me e não expõe JWT no snapshot', async () => {
  const transport = api();
  let release!: (value: typeof fixtureUser) => void;
  transport.me = () => new Promise((resolve) => (release = resolve));
  const session = createAccountSession(transport);
  try {
    const pending = session.login(credentials);
    await Promise.resolve();
    expect(session.getSnapshot().session.kind).toBe('visitor');
    release(fixtureUser);
    await pending;
    expect(session.getSnapshot().session.kind).toBe('authenticated');
    expect(JSON.stringify(session.getSnapshot()).includes(fixtureToken)).toBe(false);
  } finally {
    session.dispose();
  }
});
test('identidade divergente entre login e /me não autentica', async () => {
  const transport = api();
  transport.me = async () => ({ ...fixtureUser, id: '000000000000000000000599' });
  const session = createAccountSession(transport);
  try {
    await expect(session.login(credentials)).rejects.toMatchObject({ kind: 'invalid' });
    expect(session.getSnapshot().session.kind).toBe('visitor');
  } finally {
    session.dispose();
  }
});
test('logout antes da resposta de login impede a sessão tardia', async () => {
  const transport = api();
  let release!: (value: Awaited<ReturnType<AuthApi['login']>>) => void;
  transport.login = () => new Promise((resolve) => (release = resolve));
  const session = createAccountSession(transport);
  try {
    const pending = session.login(credentials);
    await session.logout();
    release({
      accessToken: fixtureToken,
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      utilizador: fixtureUser,
    });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(session.getSnapshot().session.kind).toBe('visitor');
  } finally {
    session.dispose();
  }
});
test('revalidações simultâneas usam a mesma consulta; respostas após logout são ignoradas', async () => {
  const transport = api();
  const session = createAccountSession(transport);
  try {
    await session.login(credentials);
    let release!: (value: typeof fixtureUser) => void,
      calls = 0;
    transport.me = () => {
      calls++;
      return new Promise((resolve) => (release = resolve));
    };
    const first = session.revalidate(),
      second = session.revalidate();
    expect(calls).toBe(1);
    await session.logout();
    release(fixtureUser);
    await Promise.all([first, second]);
    expect(session.getSnapshot().session.kind).toBe('visitor');
  } finally {
    session.dispose();
  }
});
test('401 limpa sessão; 403 e rede indisponível bloqueiam a identidade até nova confirmação', async () => {
  for (const status of [401, 403, 503]) {
    const transport = api();
    const session = createAccountSession(transport);
    try {
      await session.login(credentials);
      transport.me = async () => {
        throw new ApiFailure('http', status);
      };
      await session.revalidate();
      const state = session.getSnapshot().session;
      if (status === 401) expect(state.kind).toBe('visitor');
      else {
        expect(state).toMatchObject({
          kind: 'authenticated',
          status: status === 403 ? 'forbidden' : 'unavailable',
        });
        transport.me = async () => fixtureUser;
        await session.revalidate();
        expect(session.getSnapshot().session).toMatchObject({ status: 'ready' });
      }
    } finally {
      session.dispose();
    }
  }
});
test('expiração verificada por relógio descarta o JWT antes de consultar /me', async () => {
  const transport = api();
  let now = Date.now(),
    calls = 0;
  transport.me = async () => {
    calls++;
    return fixtureUser;
  };
  const session = createAccountSession(transport, () => now);
  try {
    await session.login(credentials);
    now += 1000000;
    await session.revalidate();
    expect(session.getSnapshot().session.kind).toBe('visitor');
    expect(calls).toBe(1);
  } finally {
    session.dispose();
  }
});
test('logout local mantém-se concluído mesmo quando a API falha', async () => {
  const transport = api();
  transport.logout = async () => {
    throw new ApiFailure('network');
  };
  const session = createAccountSession(transport);
  try {
    await session.login(credentials);
    await session.logout();
    expect(session.getSnapshot().session.kind).toBe('visitor');
    expect(session.getSnapshot().notice).toContain('Não foi possível confirmar');
  } finally {
    session.dispose();
  }
});
