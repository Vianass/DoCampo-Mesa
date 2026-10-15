import { expect, test } from '@playwright/test';
import { isRole, roles } from '../src/features/auth/types';
import { validateAuthForm } from '../src/features/auth/validation';
import {
  demoDestination,
  privateSections,
  roleHome,
} from '../src/features/private-area/navigation';

function fields(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}
const registration = {
  name: 'Pessoa de teste',
  email: 'teste@example.test',
  password: 'exemplo-123',
  confirmPassword: 'exemplo-123',
};

test('papéis correspondem à Fase 0; visitante e valores manipulados não são papéis', () => {
  expect(roles).toEqual(['comprador', 'produtor', 'administrador']);
  for (const role of roles) expect(isRole(role)).toBe(true);
  for (const invalid of ['visitante', 'consumidor', 'admin', '__proto__', '', null, 1, {}])
    expect(isRole(invalid)).toBe(false);
});
test('validação partilhada distingue campos de login, registo e recuperação', () => {
  expect(Object.keys(validateAuthForm('login', fields({})))).toEqual(['email', 'password']);
  expect(Object.keys(validateAuthForm('recovery', fields({})))).toEqual(['email']);
  expect(validateAuthForm('registration', fields(registration))).toEqual({});
  expect(validateAuthForm('registration', fields(registration), 'produtor')).toMatchObject({
    producerName: expect.any(String),
    locality: expect.any(String),
  });
  expect(
    validateAuthForm(
      'registration',
      fields({ ...registration, producerName: 'Horta de teste', locality: 'Viana do Castelo' }),
      'produtor',
    ),
  ).toEqual({});
});
test('validação recusa email inválido, espaços, palavra-passe curta e confirmação diferente', () => {
  for (const email of ['texto', 'pessoa@', 'nome @exemplo.pt', '@exemplo.pt', 'nome@exemplo'])
    expect(validateAuthForm('recovery', fields({ email })).email).toBeTruthy();
  expect(
    validateAuthForm(
      'registration',
      fields({ ...registration, name: ' ', password: '123', confirmPassword: 'outra' }),
    ),
  ).toMatchObject({
    name: expect.any(String),
    password: expect.any(String),
    confirmPassword: expect.any(String),
  });
  expect(
    validateAuthForm(
      'registration',
      fields({ ...registration, password: 'abcdefgh', confirmPassword: 'abcdefgh' }),
    ),
  ).toEqual({});
  expect(
    validateAuthForm('login', fields({ email: ' teste@example.test ', password: 'a' })),
  ).toEqual({});
});
test('destinos aceitam apenas percursos conhecidos do papel e recusam redirecionamentos externos', () => {
  for (const role of roles) {
    const home = roleHome(role);
    expect(demoDestination(home, role)).toBe(home);
    for (const section of privateSections[role])
      expect(demoDestination(`${home}/${section.slug}`, role)).toBe(`${home}/${section.slug}`);
    for (const raw of [
      'https://example.test',
      '//example.test',
      '/\\example.test',
      'javascript:alert(1)',
      '/area/administrador/utilizadores?x=1',
      '/area/nao-existe',
      null,
    ])
      expect(demoDestination(raw, role)).toBe(home);
    for (const other of roles.filter((candidate) => candidate !== role))
      expect(demoDestination(roleHome(other), role)).toBe(home);
  }
});
test('navegação separa responsabilidades sem inventar poderes administrativos ou de comprador', () => {
  expect(privateSections.comprador.map((section) => section.slug)).toEqual([
    'encomendas',
    'avaliacoes',
    'licitacoes',
  ]);
  expect(privateSections.produtor.some((section) => section.slug === 'licitacoes')).toBe(false);
  expect(
    privateSections.administrador.some(
      (section) => section.slug === 'licitacoes' || section.slug === 'produtos',
    ),
  ).toBe(false);
  for (const role of roles) {
    expect(new Set(privateSections[role].map((section) => section.slug)).size).toBe(
      privateSections[role].length,
    );
    expect(privateSections[role].every((section) => section.requirement.startsWith('RF-'))).toBe(
      true,
    );
  }
});
