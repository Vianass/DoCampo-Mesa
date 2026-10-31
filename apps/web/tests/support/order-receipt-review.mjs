import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { receiptScenario } from '../../../api/tests/support/order-receipt-fixtures.ts';
import { createUserModel } from '../../../api/src/modules/users/user.model.ts';
import { hashPassword } from '../../../api/src/modules/auth/passwords.ts';
/** Exclusivamente teste: compra criada pelo checkout e preparação real, sem conclusão prévia. */
export async function orderReceiptReview(connection, key) {
  if (!connection.name.startsWith('docampo_test_web_')) throw Error('Base de revisão inválida.');
  const x = await receiptScenario(connection, key),
    User = createUserModel(connection),
    accounts = [];
  for (const [id, papel] of [
    [x.s.buyerId, 'comprador'],
    [x.s.producers[0].userId, 'produtor'],
  ]) {
    const user = await User.findById(id).orFail(),
      password = randomBytes(24).toString('base64url');
    user.passwordHash = await hashPassword(password);
    await user.save();
    accounts.push({ papel, email: user.emailNormalizado, password });
  }
  const password = randomBytes(24).toString('base64url'),
    admin = await User.create({
      nome: 'Administração fictícia da receção',
      emailNormalizado: randomUUID() + '@example.invalid',
      passwordHash: await hashPassword(password),
      papeis: ['administrador'],
      ativo: true,
    });
  accounts.push({ papel: 'administrador', email: admin.emailNormalizado, password });
  const directory = await mkdtemp(join(tmpdir(), 'docampo-receipt-review-')),
    file = join(directory, 'contas-ficticias.json');
  await writeFile(
    file,
    JSON.stringify(
      {
        aviso:
          'Teste isolado; compra fictícia criada pelo checkout e preparada pelo produtor, ainda sem receção.',
        contas: accounts,
        encomendaId: x.id,
        produtoId: x.s.products[0]._id.toHexString(),
        perfilProdutorId: x.s.producers[0]._id.toHexString(),
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
