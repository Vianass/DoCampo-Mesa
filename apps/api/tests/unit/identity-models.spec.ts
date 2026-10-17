import { createConnection, Error as MongooseError, Types } from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import {
  decisionInput,
  producerInput,
  testPasswordHash,
  userInput,
} from '../support/identity-fixtures.js';

const connection = createConnection();
const User = createUserModel(connection);
const Producer = createProducerModel(connection);
afterAll(() => connection.close());

async function validationError(document: { validate(): Promise<unknown> }) {
  try {
    await document.validate();
    return undefined;
  } catch (error) {
    if (error instanceof MongooseError.ValidationError) return error;
    throw error;
  }
}

describe('modelo users sem ligação à base de dados', () => {
  it('valida identidade única com papéis comerciais acumuláveis e email normalizado', async () => {
    const user = new User(
      userInput({
        nome: '  Nome completo de teste  ',
        emailNormalizado: ' CONTA@EXAMPLE.INVALID ',
      }),
    );
    await expect(user.validate()).resolves.toBeUndefined();
    expect(user.nome).toBe('Nome completo de teste');
    expect(user.emailNormalizado).toBe('conta@example.invalid');
    expect(user.papeis).toEqual(['comprador', 'produtor']);
    expect(user._id).toBeInstanceOf(Types.ObjectId);
    expect(createUserModel(connection)).toBe(User);
  });

  it.each(['nome', 'emailNormalizado', 'passwordHash', 'papeis'])('exige %s', async (field) => {
    const user = new User(userInput({ [field]: undefined }));
    expect((await validationError(user))?.errors).toHaveProperty(field);
  });

  it.each([
    ['nome', '  '],
    ['nome', 123],
    ['nome', 'a'.repeat(121)],
    ['emailNormalizado', 'email-invalido'],
    ['emailNormalizado', true],
    ['emailNormalizado', 'a'.repeat(255) + '@example.invalid'],
    ['papeis', []],
    ['papeis', ['comprador', 'comprador']],
    ['papeis', ['visitante']],
    ['papeis', ['superadmin']],
    ['papeis', 'comprador'],
    ['papeis', [123]],
  ])('recusa %s inválido (%j)', async (field, value) => {
    expect(await validationError(new User(userInput({ [field]: value })))).toBeDefined();
  });

  it.each(['password-em-claro', testPasswordHash.slice(0, -1), '$2b$03$' + 'a'.repeat(53), 123])(
    'não aceita password em claro ou representação bcrypt inválida (%j)',
    async (value) => {
      expect(
        (await validationError(new User(userInput({ passwordHash: value }))))?.errors,
      ).toHaveProperty('passwordHash');
    },
  );

  it('normaliza Unicode sem remover pontos ou aliases do email', async () => {
    const user = new User(
      userInput({
        nome: 'Jose\u0301 de teste',
        emailNormalizado: ' Nome.Alias+Teste@EXAMPLE.INVALID ',
      }),
    );
    expect(user.nome).toBe('José de teste');
    expect(user.emailNormalizado).toBe('nome.alias+teste@example.invalid');
  });

  it('não serializa o hash, mesmo num documento que o contém', async () => {
    const user = new User(userInput());
    expect(user.passwordHash).toBe(testPasswordHash);
    expect(user.toJSON()).not.toHaveProperty('passwordHash');
    expect(user.toObject()).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(user)).not.toContain(testPasswordHash);
  });

  it('não aceita campos de password em claro ou identidade demonstrativa', async () => {
    expect(() => new User(userInput({ password: 'nao-guardar' }))).toThrow();
    expect(() => new User(userInput({ role: 'administrador' }))).toThrow();
  });

  it('isola o registo de modelos por conexão e não se liga globalmente', async () => {
    const isolated = createConnection();
    try {
      expect(createUserModel(isolated)).not.toBe(User);
      expect(isolated.readyState).toBe(0);
      expect(connection.readyState).toBe(0);
    } finally {
      await isolated.close();
    }
  });
});

describe('modelo producers e consistência local da candidatura', () => {
  it('inicia pendente, com data de submissão, sem decisão ou fotografia obrigatória', async () => {
    const producer = new Producer(producerInput());
    await expect(producer.validate()).resolves.toBeUndefined();
    expect(producer.aprovacao.estado).toBe('pendente');
    expect(producer.aprovacao.submetidaEm).toBeInstanceOf(Date);
    expect(producer.aprovacao.decisao).toBeUndefined();
    expect(producer.imagem).toBeUndefined();
    expect(producer.get('nomeResponsavel')).toBeUndefined();
    expect(createProducerModel(connection)).toBe(Producer);
  });

  it.each(['userId', 'nomePublico', 'localidade', 'concelho', 'descricao', 'telefone'])(
    'exige %s',
    async (field) => {
      expect(
        (await validationError(new Producer(producerInput({ [field]: undefined }))))?.errors,
      ).toHaveProperty(field);
    },
  );

  it.each(['nomePublico', 'localidade', 'concelho', 'descricao', 'telefone'])(
    'recusa %s vazio ou com tipo incorreto',
    async (field) => {
      expect(await validationError(new Producer(producerInput({ [field]: '  ' })))).toBeDefined();
      expect(await validationError(new Producer(producerInput({ [field]: 123 })))).toBeDefined();
    },
  );

  it.each([
    { userId: 'nao-e-identificador' },
    { aprovacao: null },
    { aprovacao: { estado: 'suspenso' } },
    { aprovacao: { estado: 'pendente', submetidaEm: new Date('invalida') } },
    { aprovacao: decisionInput({ submetidaEm: true }) },
    { nomePublico: 'a'.repeat(161) },
    { localidade: 'a'.repeat(121) },
    { descricao: 'a'.repeat(5001) },
  ])('recusa campos, estados ou datas inválidos (%j)', async (input) => {
    expect(await validationError(new Producer(producerInput(input)))).toBeDefined();
  });

  it('aceita aprovação com autor e data e rejeição com justificação', async () => {
    const approved = new Producer(producerInput({ aprovacao: decisionInput() }));
    const rejected = new Producer(
      producerInput({
        aprovacao: decisionInput({
          estado: 'rejeitado',
          decisao: {
            autor: new Types.ObjectId(),
            data: new Date('2026-10-11T09:00:00Z'),
            justificacao: '  Informação em falta.  ',
          },
        }),
      }),
    );
    await expect(approved.validate()).resolves.toBeUndefined();
    await expect(rejected.validate()).resolves.toBeUndefined();
    expect(rejected.aprovacao.decisao?.justificacao).toBe('Informação em falta.');
  });

  it.each([
    decisionInput({ estado: 'pendente' }),
    decisionInput({ estado: 'pendente', decisao: null }),
    decisionInput({ decisao: undefined }),
    decisionInput({ decisao: {} }),
    decisionInput({ decisao: { data: new Date('2026-10-11T09:00:00Z') } }),
    decisionInput({ decisao: { autor: new Types.ObjectId() } }),
    decisionInput({ decisao: { autor: 'id-invalido', data: new Date('2026-10-11T09:00:00Z') } }),
    decisionInput({
      decisao: { autor: new Types.ObjectId(), data: new Date('2026-10-09T09:00:00Z') },
    }),
    decisionInput({ decisao: { autor: new Types.ObjectId(), data: '2026-10-11T09:00:00Z' } }),
    decisionInput({ estado: 'rejeitado' }),
    decisionInput({
      estado: 'rejeitado',
      decisao: {
        autor: new Types.ObjectId(),
        data: new Date('2026-10-11T09:00:00Z'),
        justificacao: '  ',
      },
    }),
    decisionInput({
      decisao: {
        autor: new Types.ObjectId(),
        data: new Date('2026-10-11T09:00:00Z'),
        justificacao: 'a'.repeat(2001),
      },
    }),
  ])('recusa decisão inconsistente (%j)', async (application) => {
    expect(
      await validationError(new Producer(producerInput({ aprovacao: application }))),
    ).toBeDefined();
  });

  it('aceita metadados opcionais de imagem e recusa URLs executáveis/com credenciais', async () => {
    const valid = new Producer(
      producerInput({
        imagem: { url: 'https://example.invalid/imagem.jpg', alt: 'Logótipo fictício' },
      }),
    );
    expect(await validationError(valid)).toBeUndefined();
    for (const url of [
      'javascript:alert(1)',
      'file:///imagem.jpg',
      'https://conta:segredo@example.invalid/a',
    ]) {
      expect(await validationError(new Producer(producerInput({ imagem: { url } })))).toBeDefined();
    }
  });

  it('não admite credenciais no perfil nem um nome de responsável persistido em duplicado', async () => {
    expect(() => new Producer(producerInput({ passwordHash: testPasswordHash }))).toThrow();
    const producer = new Producer(producerInput({ nomeResponsavel: 'Nome forjado' }));
    expect(producer.get('nomeResponsavel')).toBeUndefined();
    expect(producer.toObject()).not.toHaveProperty('nomeResponsavel');
  });

  it('omite telefone e identidade privada do decisor na serialização JSON', async () => {
    const producer = new Producer(producerInput({ aprovacao: decisionInput() }));
    expect(producer.toJSON()).not.toHaveProperty('telefone');
    expect(producer.toJSON().aprovacao.decisao).not.toHaveProperty('autor');
  });

  it('serializa documentos completos e projeções sem candidatura mantendo os campos privados protegidos', () => {
    const complete = new Producer(producerInput({ aprovacao: decisionInput() }));
    expect(() => complete.toJSON()).not.toThrow();
    expect(complete.toJSON().aprovacao.estado).toBe('aprovado');
    expect(complete.toJSON()).not.toHaveProperty('telefone');
    expect(complete.toJSON().aprovacao.decisao).not.toHaveProperty('autor');

    const partial = Producer.hydrate(
      {
        _id: new Types.ObjectId(),
        nomePublico: 'Perfil fictício para regressão',
        telefone: '+351 000 000 000',
      },
      { nomePublico: 1, telefone: 1 },
    );
    expect(partial.aprovacao).toBeUndefined();
    expect(() => partial.toJSON()).not.toThrow();
    expect(partial.toJSON().nomePublico).toBe('Perfil fictício para regressão');
    expect(partial.toJSON()).not.toHaveProperty('aprovacao');
    expect(partial.toJSON()).not.toHaveProperty('telefone');
    expect(partial.toJSON()).not.toHaveProperty('passwordHash');
  });
});
