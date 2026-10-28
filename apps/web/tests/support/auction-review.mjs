import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { Types } from 'mongoose';
import { seedAuctionActors } from '../../../api/tests/support/auction-fixtures.ts';
import { createUserModel } from '../../../api/src/modules/users/user.model.ts';
import { createProductModel } from '../../../api/src/modules/products/product.model.ts';
import { createProducerModel } from '../../../api/src/modules/producers/producer.model.ts';
import { hashPassword } from '../../../api/src/modules/auth/passwords.ts';

/** Só é invocado pelo servidor efémero de revisão; não pertence ao runtime de produção. */
export async function auctionReview(connection, auctions) {
  if (!connection.name.startsWith('docampo_test_web_')) throw Error('Base de revisão inválida.');
  const actors = await seedAuctionActors(connection, 2);
  const Product = createProductModel(connection),
    Producer = createProducerModel(connection),
    User = createUserModel(connection);
  const product = await Product.findById(actors.body.produtoId).orFail();
  product.nome = 'Tomate coração-de-boi da horta';
  product.descricao =
    'Tomates de uma produção inteiramente fictícia, preparados para demonstrar o percurso real dos leilões.';
  product.imagens = [
    {
      url: 'http://127.0.0.1:5183/images/tomatoes.webp',
      alt: 'Fotografia ilustrativa de tomates da horta',
      principal: true,
    },
  ];
  await product.save();
  const profile = await Producer.findOne({ userId: new Types.ObjectId(actors.seller.id) })
    .select('+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado')
    .orFail();
  profile.nomePublico = 'Horta de Viana · revisão fictícia';
  await profile.save();
  const contas = [];
  for (const [index, principal] of [...actors.buyers, actors.seller].entries()) {
    const user = await User.findById(principal.id).select('+passwordHash').orFail();
    const password = randomBytes(24).toString('base64url');
    user.passwordHash = await hashPassword(password);
    user.nome =
      index < 2 ? 'Comprador ' + (index === 0 ? 'A' : 'B') + ' · revisão' : 'Produtor · revisão';
    await user.save();
    contas.push({
      papel: index < 2 ? 'comprador' : 'produtor',
      email: user.emailNormalizado,
      password,
    });
  }
  const body = {
    ...actors.body,
    titulo: 'Tomate da horta. Uma colheita para partilhar.',
    descricao:
      'Um lote de tomate coração-de-boi, com origem na produção fictícia de Viana. A fotografia é ilustrativa; todos os dados e contas pertencem exclusivamente a esta revisão isolada.',
    precoBaseCent: 1200,
    incrementoCent: 100,
    terminaEm: new Date(Date.now() + 15 * 60000).toISOString(),
  };
  const active = await auctions.create(actors.seller, body, randomUUID());
  const scheduled = await auctions.create(
    actors.seller,
    {
      ...body,
      titulo: 'A próxima colheita começa aqui.',
      iniciaEm: new Date(Date.now() + 3600000).toISOString(),
      terminaEm: new Date(Date.now() + 7200000).toISOString(),
    },
    randomUUID(),
  );
  const ended = await auctions.create(
    actors.seller,
    { ...body, titulo: 'Um encontro que já terminou.' },
    randomUUID(),
  );
  await connection.db
    .collection('auctions')
    .updateOne(
      { _id: new Types.ObjectId(ended.body.id) },
      { $set: { iniciaEm: new Date(Date.now() - 3000), terminaEm: new Date(Date.now() - 2000) } },
    );
  await auctions.advance(new Types.ObjectId(ended.body.id));
  const cancelled = await auctions.create(
    actors.seller,
    { ...body, titulo: 'Uma colheita com outro destino.' },
    randomUUID(),
  );
  await auctions.cancel(actors.seller, cancelled.body.id, cancelled.etag);
  const directory = process.env.DOCAMPO_AUCTION_REVIEW_FILE
    ? undefined
    : await mkdtemp(join(tmpdir(), 'docampo-auction-review-'));
  const file = directory
    ? join(directory, 'revisao.json')
    : resolve(process.env.DOCAMPO_AUCTION_REVIEW_FILE);
  if (
    ![resolve(tmpdir()), '/private/tmp', '/tmp'].some(
      (root) => resolve(dirname(file)).startsWith(root + '/') || resolve(dirname(file)) === root,
    )
  )
    throw Error('Ficheiro de revisão fora da pasta temporária.');
  await writeFile(
    file,
    JSON.stringify(
      {
        aviso: 'Contas fictícias. Válidas apenas nesta base de teste efémera.',
        databaseName: connection.name,
        contas,
        produtoId: product.id,
        leiloes: {
          ativo: active.body.id,
          agendado: scheduled.body.id,
          terminado: ended.body.id,
          cancelado: cancelled.body.id,
        },
      },
      null,
      2,
    ),
    { mode: 0o600, flag: 'wx' },
  );
  return {
    file,
    async cleanup() {
      await unlink(file);
      if (directory) await rmdir(directory);
    },
  };
}
