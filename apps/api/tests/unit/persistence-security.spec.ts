import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { it, expect } from 'vitest';

it('hidratação de dados desconhecidos não altera funções herdadas nem divulga o hash', () => {
  // Processo isolado: numa versão vulnerável, este payload corrompe Object.prototype.toString.call.
  // Uma falha da regressão não pode contaminar as restantes suites de testes.
  const output = execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
      import assert from 'node:assert/strict';
      import { createConnection, Types } from 'mongoose';
      import { createUserModel } from './src/modules/users/user.model.ts';
      const connection = createConnection();
      const User = createUserModel(connection);
      const original = Object.prototype.toString.call;
      const user = User.hydrate({
        _id: new Types.ObjectId(), nome: 'Conta fictícia de regressão',
        emailNormalizado: 'regressao@example.invalid', papeis: ['comprador'], ativo: true,
        passwordHash: 'hash-privado-ficticio', toString: { call: 1 },
      });
      assert.equal(Object.prototype.toString.call, original);
      assert.equal(Object.prototype.toString.call({}), '[object Object]');
      const json = user.toJSON();
      assert.equal(json.passwordHash, undefined);
      assert.equal(json.nome, 'Conta fictícia de regressão');
      const query = User.findOne().merge({ toString: { call: 1 } });
      assert.equal(Object.prototype.toString.call, original);
      assert.equal(typeof query.getFilter(), 'object');
      await connection.close();
      console.log('prototipo-e-serializacao-protegidos');
      `,
    ],
    { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8' },
  );
  expect(output.trim()).toBe('prototipo-e-serializacao-protegidos');
});
