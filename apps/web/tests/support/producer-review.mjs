import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkoutScenario,
  seedCheckoutScenario,
} from '../../../api/tests/support/checkout-fixtures.ts';
import { createUserModel } from '../../../api/src/modules/users/user.model.ts';
import { hashPassword } from '../../../api/src/modules/auth/passwords.ts';

/** Apenas a base aleatória do servidor de revisão; nunca é importado pelo runtime da API. */
export async function producerReview(connection, orders) {
  if (!connection.name.startsWith('docampo_test_web_')) throw Error('Base de revisão inválida.');
  const scenario = checkoutScenario(2, true);
  scenario.products.forEach((p, i) =>
    Object.assign(p, {
      nome: 'Colheita fictícia para revisão ' + (i + 1),
      imagens: [
        {
          url: 'http://127.0.0.1:5183/images/tomatoes.webp',
          alt: 'Fotografia ilustrativa da revisão',
          principal: true,
        },
      ],
    }),
  );
  scenario.producers.forEach((p, i) =>
    Object.assign(p, { nomePublico: 'Produção fictícia de revisão ' + (i + 1) }),
  );
  await seedCheckoutScenario(connection, scenario);
  const actors = [];
  for (const [i, id] of [scenario.buyerId, ...scenario.producers.map((p) => p.userId)].entries()) {
    const user = await createUserModel(connection).findById(id).select('+passwordHash').orFail();
    const password = randomBytes(24).toString('base64url');
    user.passwordHash = await hashPassword(password);
    await user.save();
    actors.push({
      papel: i === 0 ? 'comprador' : 'produtor',
      email: user.emailNormalizado,
      password,
    });
  }
  const buyer = await createUserModel(connection).findById(scenario.buyerId).orFail();
  const result = await orders.checkout(
    {
      id: buyer._id.toHexString(),
      nome: buyer.nome,
      email: buyer.emailNormalizado,
      papeis: buyer.papeis,
    },
    scenario.chave,
    scenario.pedido,
  );
  if (result.status !== 201) throw Error('Não foi possível preparar a compra fictícia.');
  const directory = await mkdtemp(join(tmpdir(), 'docampo-producer-review-'));
  const file = join(directory, 'contas-ficticias.json');
  await writeFile(
    file,
    JSON.stringify(
      {
        aviso: 'Contas fictícias válidas apenas nesta base efémera. Não usar em produção.',
        contas: actors,
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
