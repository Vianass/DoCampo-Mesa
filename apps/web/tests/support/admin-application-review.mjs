import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUserModel } from '../../../api/src/modules/users/user.model.ts';
import { hashPassword } from '../../../api/src/modules/auth/passwords.ts';

/** Fixtures apenas na base efémera do servidor de testes; nunca no runtime de produção. */
export async function adminApplicationReview(connection, service) {
  if (!connection.name.startsWith('docampo_test_web_')) throw Error('Base de revisão inválida.');
  const User = createUserModel(connection),
    accounts = [];
  async function account(role) {
    const password = randomBytes(24).toString('base64url'),
      email = randomUUID() + '@example.invalid';
    const user = await User.create({
      nome:
        role === 'administrador'
          ? 'Administração fictícia de revisão'
          : 'Candidato fictício de revisão',
      emailNormalizado: email,
      passwordHash: await hashPassword(password),
      papeis: [role],
      ativo: true,
    });
    accounts.push({ papel: role, email, password });
    return { id: user._id.toHexString(), nome: user.nome, email, papeis: [role] };
  }
  const admin = await account('administrador');
  await account('administrador');
  for (const state of ['pendente', 'rejeitado', 'aprovado']) {
    const user = await account('comprador');
    const result = await service.submit(user, {
      nomePublico: 'Origem fictícia — ' + state,
      localidade: 'Localidade de revisão',
      concelho: 'Concelho de revisão',
      descricao: 'Atividade hortícola fictícia, destinada apenas à revisão visual isolada.',
      telefone: '+351 000 000 000',
    });
    if (state !== 'pendente')
      await service.decide(
        admin,
        result.body.id,
        state,
        result.etag,
        state === 'rejeitado' ? 'Descreve melhor os produtos e a origem da exploração.' : undefined,
      );
  }
  const directory = await mkdtemp(join(tmpdir(), 'docampo-admin-applications-review-')),
    file = join(directory, 'contas-ficticias.json');
  await writeFile(
    file,
    JSON.stringify(
      {
        aviso: 'Contas fictícias apenas nesta base efémera de teste. Não usar em produção.',
        contas: accounts,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  return {
    file,
    async cleanup() {
      await unlink(file);
      await rmdir(directory);
    },
  };
}
