import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection, Types } from 'mongoose';
import { seedCheckoutScenario } from '../../api/tests/support/checkout-fixtures';
import { historicalReviewOrder } from '../../api/tests/support/review-fixtures';
import { createUserModel } from '../../api/src/modules/users/user.model';
import { createProductModel } from '../../api/src/modules/products/product.model';
import { hashPassword } from '../../api/src/modules/auth/passwords';
import { inspectOrderContrast } from './support/admin-order-accessibility';
const api = 'http://127.0.0.1:3011/api',
  buyer = '/area/comprador/avaliacoes',
  admin = '/area/administrador/moderacao';
let connection: ReturnType<typeof createConnection>, db: ReturnType<typeof createConnection>;
const cleanups: {
  buyer: Types.ObjectId;
  product: Types.ObjectId;
  producer: Types.ObjectId;
  profile: Types.ObjectId;
  admin: Types.ObjectId;
}[] = [];
test.beforeAll(async () => {
  connection = await createConnection(
    'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
    { dbName: 'admin' },
  ).asPromise();
  const names = (await connection.db!.admin().listDatabases()).databases.filter((d) =>
    d.name.startsWith('docampo_test_web_'),
  );
  expect(names).toHaveLength(1);
  db = connection.useDb(names[0]!.name);
});
test.afterEach(async () => {
  for (const ids of cleanups.splice(0)) {
    await db.db!.collection('reviews').deleteMany({ autor: ids.buyer });
    await db.db!.collection('orders').deleteMany({ comprador: ids.buyer });
    await db.db!.collection('products').deleteOne({ _id: ids.product });
    await db.db!.collection('producers').deleteOne({ _id: ids.profile });
    await db
      .db!.collection('users')
      .deleteMany({ _id: { $in: [ids.buyer, ids.producer, ids.admin] } });
  }
});
test.afterAll(async () => {
  await connection?.close();
});
async function subject(page: Page) {
  const s = await seedCheckoutScenario(db),
    password = 'Frase fictícia 9 ' + randomUUID(),
    User = createUserModel(db),
    buyerUser = await User.findById(s.buyerId).orFail();
  buyerUser.passwordHash = await hashPassword(password);
  await buyerUser.save();
  const administrator = await User.create({
    nome: 'Admin fictício da revisão',
    emailNormalizado: randomUUID() + '@example.invalid',
    passwordHash: await hashPassword(password),
    papeis: ['administrador'],
    ativo: true,
  });
  cleanups.push({
    buyer: s.buyerId,
    product: s.products[0]!._id,
    producer: s.producers[0]!.userId,
    profile: s.producers[0]!._id,
    admin: administrator._id,
  });
  const product = await createProductModel(db).findById(s.products[0]!._id).orFail();
  product.nome = 'Tomates da revisão de avaliações';
  product.imagens = [
    {
      url: 'http://127.0.0.1:5183/images/tomatoes.webp',
      alt: 'Tomates ilustrativos da revisão',
      principal: true,
    },
  ];
  await product.save();
  const order = await historicalReviewOrder(db, {
    buyer: s.buyerId,
    producer: s.producers[0]!.userId,
    product: s.products[0]!._id,
  });
  const credentials = { email: buyerUser.emailNormalizado, password },
    adminCredentials = { email: administrator.emailNormalizado, password };
  const login = await page.request.post(api + '/auth/login', { data: credentials });
  expect(login.status()).toBe(200);
  const adminLogin = await page.request.post(api + '/auth/login', { data: adminCredentials });
  expect(adminLogin.status()).toBe(200);
  return {
    s,
    order,
    credentials,
    adminCredentials,
    token: (await login.json()).accessToken as string,
    adminToken: (await adminLogin.json()).accessToken as string,
  };
}
async function login(
  page: Page,
  credentials: { email: string; password: string },
  destination: string,
) {
  await page.goto('/entrar?destino=' + encodeURIComponent(destination));
  await page.getByLabel('Email', { exact: true }).fill(credentials.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(destination + '$'));
}
async function navigate(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    scrollTo({ top: 0, behavior: 'instant' });
    return new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  const skip = await page.locator('.skip-link').evaluate((el) => ({
    focused: el === document.activeElement,
    bottom: el.getBoundingClientRect().bottom,
  }));
  if (!skip.focused) expect(skip.bottom).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const r of await page
    .locator(
      '.real-reviews input:not([type=radio]):not([type=checkbox]),.real-reviews textarea,.real-reviews select,.real-reviews button,.real-reviews label:has(input[type=radio]),.admin-decision-dialog button',
    )
    .evaluateAll((els) =>
      els
        .filter((e) => e.getClientRects().length)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { left: r.left, right: r.right, height: r.height };
        }),
    )) {
    expect(r.left).toBeGreaterThanOrEqual(-1);
    expect(r.right).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
  const contrasts = await Promise.all(
      Array.from({ length: await page.locator('.real-reviews').count() }, (_, i) =>
        inspectOrderContrast(page, '.real-reviews >> nth=' + i),
      ),
    ),
    contrast = {
      samples: contrasts.reduce((n, c) => n + c.samples, 0),
      minimum: Math.min(...contrasts.map((c) => c.minimum)),
    },
    out = process.env.DOCAMPO_REVIEW_SCREENSHOTS;
  if (out) {
    await mkdir(out, { recursive: true });
    await page.screenshot({
      path: join(out, name + '.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await writeFile(join(out, name + '-contrast.json'), JSON.stringify(contrast));
    await writeFile(join(out, name + '.yml'), await page.locator('body').ariaSnapshot());
    const cdp = await page.context().newCDPSession(page);
    await writeFile(
      join(out, name + '-ax.json'),
      JSON.stringify(await cdp.send('Accessibility.getFullAXTree')),
    );
    await cdp.detach();
  }
}
test('compra histórica concluída → avaliação React → publicação → ocultação/restauro e auditoria reais', async ({
  page,
}) => {
  const x = await subject(page);
  await login(page, x.credentials, buyer);
  await page.getByRole('button', { name: 'Avaliar produto', exact: true }).click();
  await page.getByRole('radio', { name: '5 estrelas', exact: true }).check();
  await page
    .getByLabel('Comentário', { exact: true })
    .fill('Uma experiência real em dados fictícios.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Publicar avaliação', exact: true }).click();
  await expect(
    page.getByText('Avaliação publicada e confirmada pelo serviço.', { exact: true }),
  ).toBeVisible();
  const rows = await db.db!.collection('reviews').find({ autor: x.s.buyerId }).toArray();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.encomenda).toEqual(x.order._id);
  expect(
    (await page.request.get(api + '/products/' + x.s.products[0]!._id + '/reviews')).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  await login(page, x.adminCredentials, admin + '/' + rows[0]!._id);
  await page
    .getByLabel('Motivo da decisão', { exact: true })
    .fill('Ocultação fictícia para revisão.');
  await page.getByRole('button', { name: 'Ocultar avaliação', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar ocultação', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Restaurar avaliação', exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get(api + '/products/' + x.s.products[0]!._id + '/reviews')).json())
      .total,
  ).toBe(0);
  await page
    .getByLabel('Motivo da decisão', { exact: true })
    .fill('Restauro fictício após análise.');
  await page.getByRole('button', { name: 'Restaurar avaliação', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar restauro', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ocultar avaliação', exact: true })).toBeVisible();
  const result = await db.db!.collection('reviews').findOne({ _id: rows[0]!._id });
  expect(result!.historico).toHaveLength(2);
  expect(result!.comentario).toBe(rows[0]!.comentario);
});
test('concorrência real mantém uma avaliação por compra/alvo e uma decisão por ETag', async ({
  page,
}) => {
  const x = await subject(page),
    headers = { Authorization: 'Bearer ' + x.token },
    body = {
      encomendaId: x.order.id,
      alvoTipo: 'produto',
      produtoId: x.s.products[0]!._id.toHexString(),
      classificacao: 4,
      comentario: 'Experiência fictícia concorrente.',
    };
  const results = await Promise.all([
    page.request.post(api + '/reviews', { headers, data: body }),
    page.request.post(api + '/reviews', { headers, data: body }),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
  const record = await db.db!.collection('reviews').findOne({ autor: x.s.buyerId }),
    head = await page.request.get(api + '/admin/reviews/' + record!._id, {
      headers: { Authorization: 'Bearer ' + x.adminToken },
    }),
    mod = {
      headers: { Authorization: 'Bearer ' + x.adminToken, 'If-Match': head.headers().etag! },
      data: { estado: 'oculta', motivo: 'Decisão concorrente fictícia.' },
    };
  const decisions = await Promise.all([
    page.request.patch(api + '/admin/reviews/' + record!._id + '/moderation', mod),
    page.request.patch(api + '/admin/reviews/' + record!._id + '/moderation', mod),
  ]);
  expect(decisions.map((r) => r.status()).sort()).toEqual([200, 412]);
  expect(
    (await db.db!.collection('reviews').findOne({ _id: record!._id }))!.historico,
  ).toHaveLength(1);
});
test('suspensão real bloqueia JWT antigo e o React retira as avaliações privadas', async ({
  page,
}) => {
  const x = await subject(page);
  await login(page, x.credentials, buyer);
  await expect(page.getByRole('button', { name: 'Avaliar produto', exact: true })).toBeVisible();
  await db.db!.collection('users').updateOne({ _id: x.s.buyerId }, { $set: { ativo: false } });
  expect(
    (
      await page.request.get(api + '/me/reviews', {
        headers: { Authorization: 'Bearer ' + x.token },
      })
    ).status(),
  ).toBe(401);
  await page.getByRole('button', { name: 'Atualizar avaliações', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Avaliar produto', exact: true })).toHaveCount(0);
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(
    'avaliações e moderação reais responsivas e acessíveis a ' + width + ' px',
    async ({ page }) => {
      test.setTimeout(60000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width, height: 900 });
      const x = await subject(page);
      await login(page, x.credentials, buyer);
      await expect(
        page.getByRole('button', { name: 'Avaliar produto', exact: true }),
      ).toBeVisible();
      await capture(page, width + '-compras');
      await page.getByRole('button', { name: 'Avaliar produto', exact: true }).click();
      await page.getByRole('radio', { name: '1 estrela', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('radio', { name: '2 estrelas', exact: true })).toBeChecked();
      await page
        .getByLabel('Comentário', { exact: true })
        .fill(
          'Experiência de revisão nas seis larguras. Texto longo ' +
            'com boa legibilidade '.repeat(8),
        );
      await capture(page, width + '-formulario');
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Publicar avaliação', exact: true }).click();
      await expect(
        page.getByText('Avaliação publicada e confirmada pelo serviço.', { exact: true }),
      ).toBeVisible();
      await capture(page, width + '-avaliacao');
      const record = await db.db!.collection('reviews').findOne({ autor: x.s.buyerId });
      await navigate(page, '/produtos/' + x.s.products[0]!._id);
      await expect(page.locator('.product-detail-page .public-reviews .review-card')).toHaveCount(
        1,
      );
      await capture(page, width + '-produto');
      await navigate(page, '/produtores/' + x.s.producers[0]!._id);
      await expect(page.locator('.producer-profile-page .public-reviews .review-card')).toHaveCount(
        1,
      );
      await capture(page, width + '-produtor');
      await navigate(page, buyer);
      await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
      await login(page, x.adminCredentials, admin);
      await expect(page.locator('.review-card')).toHaveCount(1);
      await capture(page, width + '-moderacao');
      await page.getByRole('link', { name: /Analisar avaliação/ }).click();
      await expect(page.getByLabel('Motivo da decisão', { exact: true })).toBeVisible();
      await page
        .getByLabel('Motivo da decisão', { exact: true })
        .fill('Conteúdo ocultado apenas para o ensaio fictício.');
      await capture(page, width + '-detalhe-admin');
      await page.getByRole('button', { name: 'Ocultar avaliação', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Continuar análise', exact: true }),
      ).toBeFocused();
      await capture(page, width + '-confirmacao');
      await page.getByRole('button', { name: 'Confirmar ocultação', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Restaurar avaliação', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Produto da compra histórica fictícia', exact: true }),
      ).toBeFocused();
      await expect(page.getByRole('heading', { name: 'Ocultação', exact: true })).toBeVisible();
      await capture(page, width + '-oculta');
      await page.route('**/api/admin/reviews/*', (r) => r.abort('failed'));
      await page.getByRole('button', { name: 'Atualizar avaliação', exact: true }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await capture(page, width + '-erro');
      await page.unroute('**/api/admin/reviews/*');
      await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Restaurar avaliação', exact: true }),
      ).toBeVisible();
      await capture(page, width + '-recuperado');
      await navigate(page, '/produtos/' + x.s.products[0]!._id);
      await expect(page.locator('.public-reviews .review-card')).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Ainda sem palavras à mesa.', exact: true }),
      ).toBeVisible();
      await capture(page, width + '-vazio');
      const stored = await db.db!.collection('reviews').findOne({ _id: record!._id });
      expect(stored!.classificacao).toBe(2);
      expect(stored!.estado).toBe('oculta');
      expect(stored!.historico).toHaveLength(1);
      expect(errors).toEqual([]);
    },
  );

test('formulário de produtor determina a origem pela compra e mantém as médias separadas', async ({
  page,
}) => {
  const x = await subject(page);
  await login(page, x.credentials, buyer);
  await page.getByRole('button', { name: 'Avaliar produtor', exact: true }).click();
  await page.getByRole('radio', { name: '4 estrelas', exact: true }).check();
  await page
    .getByLabel('Comentário', { exact: true })
    .fill('Uma boa experiência direta com a origem.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Publicar avaliação', exact: true }).click();
  await expect(
    page.getByText('Avaliação publicada e confirmada pelo serviço.', { exact: true }),
  ).toBeVisible();
  const record = await db.db!.collection('reviews').findOne({ autor: x.s.buyerId });
  expect(record!.produtor).toEqual(x.s.producers[0]!.userId);
  expect(record).not.toHaveProperty('produto');
  await navigate(page, '/produtores/' + x.s.producers[0]!._id);
  const direct = page.getByRole('region', {
      name: 'Avaliações diretas deste produtor.',
      exact: true,
    }),
    products = page.getByRole('region', {
      name: 'Avaliações dos produtos desta origem.',
      exact: true,
    });
  await expect(direct.locator('.reviews-summary')).toContainText('4 / 5');
  await expect(products.locator('.reviews-summary')).toContainText('Sem classificação');
});
test('resposta real perdida após publicação recupera pela consulta pessoal sem segundo POST', async ({
  page,
}) => {
  const x = await subject(page);
  await login(page, x.credentials, buyer);
  await page.getByRole('button', { name: 'Avaliar produto', exact: true }).click();
  await page.getByRole('radio', { name: '5 estrelas', exact: true }).check();
  await page
    .getByLabel('Comentário', { exact: true })
    .fill('Avaliação confirmada no servidor antes da resposta perdida.');
  await page.getByRole('checkbox').check();
  let posts = 0;
  await page.route('**/api/reviews', async (route) => {
    posts++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Publicar avaliação', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Consulta o estado');
  await expect(
    page.getByRole('button', { name: 'Publicar avaliação', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Consultar avaliações antes de repetir', exact: true })
    .click();
  await expect(
    page.getByText('Avaliação confirmada no servidor antes da resposta perdida.', { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
  expect(await db.db!.collection('reviews').countDocuments({ autor: x.s.buyerId })).toBe(1);
});

test('paginação real preserva filtros e encaminha foco para o título confirmado em três áreas', async ({
  page,
}) => {
  const x = await subject(page);
  for (let i = 0; i < 13; i++) {
    const order =
      i === 0
        ? x.order
        : await historicalReviewOrder(db, {
            buyer: x.s.buyerId,
            producer: x.s.producers[0]!.userId,
            product: x.s.products[0]!._id,
          });
    const r = await page.request.post(api + '/reviews', {
      headers: { Authorization: 'Bearer ' + x.token },
      data: {
        encomendaId: order.id,
        alvoTipo: 'produto',
        produtoId: x.s.products[0]!._id.toHexString(),
        classificacao: 5,
        comentario: 'Experiência histórica fictícia para paginação.',
      },
    });
    expect(r.status()).toBe(201);
  }
  await login(page, x.credentials, buyer);
  await page.getByRole('button', { name: 'Histórico de avaliações', exact: true }).click();
  await expect(page.locator('.review-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Página seguinte', exact: true }).click();
  await expect(page.locator('.review-card')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Histórico de avaliações', exact: true }),
  ).toBeFocused();
  await navigate(page, '/produtos/' + x.s.products[0]!._id);
  const section = page.getByRole('region', { name: 'Palavras sobre este produto.', exact: true });
  await expect(section.locator('.review-card')).toHaveCount(12);
  await section.getByRole('button', { name: 'Página seguinte', exact: true }).click();
  await expect(section.locator('.review-card')).toHaveCount(1);
  await expect(
    section.getByRole('heading', { name: 'Palavras sobre este produto.', exact: true }),
  ).toBeFocused();
  await navigate(page, buyer);
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  await login(page, x.adminCredentials, admin);
  await expect(page.locator('.review-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Página seguinte', exact: true }).click();
  await expect(page.locator('.review-card')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: '13 avaliações nesta consulta.', exact: true }),
  ).toBeFocused();
  await page.getByLabel('Classificação da avaliação', { exact: true }).selectOption('5');
  await expect(page).toHaveURL(/pagina=1/);
  await expect(page.locator('.review-card')).toHaveCount(12);
});
