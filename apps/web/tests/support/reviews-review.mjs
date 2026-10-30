import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedCheckoutScenario } from '../../../api/tests/support/checkout-fixtures.ts';
import { historicalReviewOrder } from '../../../api/tests/support/review-fixtures.ts';
import { createUserModel } from '../../../api/src/modules/users/user.model.ts';
import { createProductModel } from '../../../api/src/modules/products/product.model.ts';
import { hashPassword } from '../../../api/src/modules/auth/passwords.ts';
/** Apenas dados fictícios na base efémera: não é um fluxo operacional de conclusão de encomendas. */
export async function reviewsReview(connection, service) {
  if (!connection.name.startsWith('docampo_test_web_')) throw Error('Base de revisão inválida.');
  const s = await seedCheckoutScenario(connection),
    User = createUserModel(connection),
    accounts = [];
  for (const [id, role] of [
    [s.buyerId, 'comprador'],
    [s.producers[0].userId, 'produtor'],
  ]) {
    const user = await User.findById(id).orFail(),
      password = randomBytes(24).toString('base64url');
    user.passwordHash = await hashPassword(password);
    await user.save();
    accounts.push({ papel: role, email: user.emailNormalizado, password });
  }
  const password = randomBytes(24).toString('base64url'),
    admin = await User.create({
      nome: 'Administração fictícia de avaliações',
      emailNormalizado: randomUUID() + '@example.invalid',
      passwordHash: await hashPassword(password),
      papeis: ['administrador'],
      ativo: true,
    });
  accounts.push({ papel: 'administrador', email: admin.emailNormalizado, password });
  const buyer = await User.findById(s.buyerId).orFail(),
    principal = {
      id: buyer.id,
      nome: buyer.nome,
      email: buyer.emailNormalizado,
      papeis: ['comprador'],
    },
    adminPrincipal = {
      id: admin.id,
      nome: admin.nome,
      email: admin.emailNormalizado,
      papeis: ['administrador'],
    };
  const product = await createProductModel(connection).findById(s.products[0]._id).orFail();
  product.nome = 'Tomates da mesa de revisão';
  product.imagens = [
    {
      url: 'http://127.0.0.1:5183/images/tomatoes.webp',
      alt: 'Tomates ilustrativos para revisão',
      principal: true,
    },
  ];
  await product.save();
  const ids = { buyer: s.buyerId, producer: s.producers[0].userId, product: s.products[0]._id };
  const unreviewed = await historicalReviewOrder(connection, ids);
  for (const [rating, kind] of [
    [4, 'produto'],
    [2, 'produto'],
    [5, 'produtor'],
  ]) {
    const order = await historicalReviewOrder(connection, ids);
    const r = await service.create(principal, {
      encomendaId: order.id,
      alvoTipo: kind,
      ...(kind === 'produto' ? { produtoId: product.id } : {}),
      classificacao: rating,
      comentario: 'Uma experiência fictícia, criada exclusivamente para a revisão local.',
    });
    if (rating === 2) {
      const d = await service.adminDetail(adminPrincipal, r.id);
      await service.moderate(
        adminPrincipal,
        r.id,
        { estado: 'oculta', motivo: 'Ocultação fictícia para testar consulta e restauro.' },
        d.etag,
      );
    }
  }
  const directory = await mkdtemp(join(tmpdir(), 'docampo-reviews-review-')),
    file = join(directory, 'contas-ficticias.json');
  await writeFile(
    file,
    JSON.stringify(
      {
        aviso:
          'Dados históricos fictícios: esta revisão NÃO implementa a confirmação operacional de receção.',
        contas: accounts,
        produtoId: product.id,
        perfilProdutorId: s.producers[0]._id.toHexString(),
        encomendaHistoricaElegivelId: unreviewed.id,
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
