import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection, Types } from 'mongoose';
import { seedCheckoutScenario } from '../../api/tests/support/checkout-fixtures';
import { createUserModel } from '../../api/src/modules/users/user.model';
import { createProductModel } from '../../api/src/modules/products/product.model';
import { hashPassword } from '../../api/src/modules/auth/passwords';
import { inspectOrderContrast } from './support/admin-order-accessibility';
import { historicalReviewOrder } from '../../api/tests/support/review-fixtures';
const api = 'http://127.0.0.1:3011/api',
  base = '/area/administrador/moderacao';
const artifacts = process.env.DOCAMPO_11D_ARTIFACTS;
let connection: ReturnType<typeof createConnection>, db: ReturnType<typeof createConnection>;
const cleanups: {
  users: Types.ObjectId[];
  products: Types.ObjectId[];
  profiles: Types.ObjectId[];
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
    const auctions = await db
      .db!.collection('auctions')
      .find({ produto: { $in: ids.products } }, { projection: { _id: 1 } })
      .toArray();
    await db.db!.collection('bids').deleteMany({ leilao: { $in: auctions.map((a) => a._id) } });
    await db.db!.collection('auctions').deleteMany({ produto: { $in: ids.products } });
    await db.db!.collection('reviews').deleteMany({ autor: { $in: ids.users } });
    await db.db!.collection('orders').deleteMany({ comprador: { $in: ids.users } });
    await db.db!.collection('content_reports').deleteMany({ autor: { $in: ids.users } });
    await db.db!.collection('products').deleteMany({ _id: { $in: ids.products } });
    await db.db!.collection('producers').deleteMany({ _id: { $in: ids.profiles } });
    await db.db!.collection('users').deleteMany({ _id: { $in: ids.users } });
  }
});
test.afterAll(async () => {
  await connection?.close();
});
async function subject(page: Page) {
  const s = await seedCheckoutScenario(db),
    password = 'Frase fictícia de moderação ' + randomUUID(),
    User = createUserModel(db),
    hash = await hashPassword(password);
  const buyer = await User.findById(s.buyerId).orFail();
  buyer.passwordHash = hash;
  await buyer.save();
  const seller = await User.findById(s.producers[0]!.userId).orFail();
  seller.passwordHash = hash;
  await seller.save();
  const admin = await User.create({
    nome: 'Admin fictício de conteúdos',
    emailNormalizado: randomUUID() + '@example.invalid',
    passwordHash: hash,
    papeis: ['administrador'],
    ativo: true,
  });
  cleanups.push({
    users: [s.buyerId, admin._id, ...s.producers.map((p) => p.userId)],
    products: s.products.map((p) => p._id),
    profiles: s.producers.map((p) => p._id),
  });
  const product = await createProductModel(db).findById(s.products[0]!._id).orFail();
  product.nome = 'Tomates da revisão de conteúdos';
  product.descricao = 'Descrição original de um produto fictício para testar a moderação.';
  product.imagens = [
    {
      url: 'http://127.0.0.1:5183/images/tomatoes.webp',
      alt: 'Tomates da revisão',
      principal: true,
    },
  ];
  await product.save();
  const login = await page.request.post(api + '/auth/login', {
    data: { email: admin.emailNormalizado, password },
  });
  expect(login.status()).toBe(200);
  return {
    s,
    product: product.id,
    profile: s.producers[0]!._id.toHexString(),
    credentials: { email: buyer.emailNormalizado, password },
    sellerCredentials: { email: seller.emailNormalizado, password },
    adminCredentials: { email: admin.emailNormalizado, password },
    adminToken: (await login.json()).accessToken as string,
  };
}
async function login(page: Page, credentials: { email: string; password: string }, path: string) {
  const destination = path.split('?')[0]!;
  await page.goto('/entrar?destino=' + encodeURIComponent(destination));
  await page.getByLabel('Email', { exact: true }).fill(credentials.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect
    .poll(() => {
      const u = new URL(page.url());
      return u.pathname + u.search;
    })
    .toBe(destination);
  if (path !== destination) await navigate(page, path);
}
async function navigate(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function report(
  page: Page,
  label = 'este produto',
  reason = 'A descrição e a fotografia merecem análise.',
) {
  await page.getByRole('button', { name: 'Denunciar ' + label, exact: true }).click();
  await expect(page.getByLabel('Motivo da denúncia', { exact: true })).toBeEnabled();
  await page.getByLabel('Motivo da denúncia', { exact: true }).fill(reason);
  await page.getByRole('button', { name: 'Rever denúncia', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar análise', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Confirmar denúncia', exact: true }).click();
}
async function moderate(page: Page, verb: 'Ocultar' | 'Restaurar') {
  await expect(page.getByRole('button', { name: verb + ' conteúdo', exact: true })).toBeVisible();
  await page
    .getByLabel('Motivo da decisão', { exact: true })
    .fill('Motivo administrativo fictício e restrito.');
  await page.getByRole('button', { name: verb + ' conteúdo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: (verb === 'Ocultar' ? 'Restaurar' : 'Ocultar') + ' conteúdo',
      exact: true,
    }),
  ).toBeVisible();
}
test('denúncia real persiste, é privada e não oculta automaticamente', async ({ page }) => {
  const f = await subject(page);
  await login(page, f.credentials, '/produtos/' + f.product);
  await report(page, 'este produto', '<script>window.modXss=true</script> Rever a fotografia.');
  await expect(
    page.getByText('A tua denúncia está registada · Pendente.', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => 'modXss' in window)).toBe(false);
  const rows = await db.db!.collection('content_reports').find({ autor: f.s.buyerId }).toArray();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.motivo).toContain('<script>');
  expect((await page.request.get(api + '/products/' + f.product)).status()).toBe(200);
  await navigate(page, '/');
  await navigate(page, '/produtos/' + f.product);
  await page.getByRole('button', { name: 'Denunciar este produto', exact: true }).click();
  await expect(
    page.getByText('A tua denúncia está registada · Pendente.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rever denúncia', exact: true })).toHaveCount(0);
});
test('resposta perdida recupera a denúncia no MongoDB sem repetir o POST', async ({ page }) => {
  const f = await subject(page);
  await login(page, f.credentials, '/produtos/' + f.product);
  let posts = 0;
  await page.route('**/api/content-reports', async (route) => {
    posts++;
    await route.fetch();
    await route.abort('failed');
  });
  await report(page);
  await expect(page.getByRole('alert')).toContainText('Consulta a tua denúncia');
  await expect(page.getByRole('button', { name: 'Rever denúncia', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Consultar a minha denúncia', exact: true }).click();
  await expect(
    page.getByText('A tua denúncia está registada · Pendente.', { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
  expect(await db.db!.collection('content_reports').countDocuments({ autor: f.s.buyerId })).toBe(1);
});
test('admin oculta, restaura e conclui uma denúncia sem alterar o original', async ({ page }) => {
  const f = await subject(page);
  await login(page, f.credentials, '/produtos/' + f.product);
  await report(page);
  await expect(
    page.getByText('A tua denúncia está registada · Pendente.', { exact: true }),
  ).toBeVisible();
  const item = await db.db!.collection('content_reports').findOne({ autor: f.s.buyerId });
  await login(page, f.adminCredentials, base + '/denuncias/' + item!._id);
  await expect(
    page.getByText('Conteúdo no momento da denúncia · registo preservado'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Consultar e moderar conteúdo', exact: true }).click();
  await moderate(page, 'Ocultar');
  expect((await page.request.get(api + '/products/' + f.product)).status()).toBe(404);
  await moderate(page, 'Restaurar');
  expect((await page.request.get(api + '/products/' + f.product)).status()).toBe(200);
  await navigate(page, base + '/denuncias/' + item!._id);
  await page
    .getByLabel('Motivo da decisão', { exact: true })
    .fill('Análise concluída com restauro confirmado.');
  await page.getByRole('button', { name: 'Concluir análise', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Análise concluída.', exact: true }),
  ).toBeVisible();
  const stored = await db.db!.collection('content_reports').findOne({ _id: item!._id });
  expect(stored!.historico).toHaveLength(1);
  expect(stored!.conteudoNaDecisao).toMatchObject({ estado: 'visivel', versao: 2 });
  expect(stored!.evidencia.descricao).toBe(
    'Descrição original de um produto fictício para testar a moderação.',
  );
});
test('conflito real bloqueia repetição e exige consulta explícita', async ({ page }) => {
  const f = await subject(page);
  await login(page, f.adminCredentials, base + '/produtos/' + f.product);
  await expect(page.getByRole('button', { name: 'Ocultar conteúdo', exact: true })).toBeVisible();
  const current = await page.request.get(api + '/admin/content/produto/' + f.product, {
    headers: { Authorization: 'Bearer ' + f.adminToken },
  });
  expect(
    (
      await page.request.patch(api + '/admin/content/produto/' + f.product + '/moderation', {
        headers: { Authorization: 'Bearer ' + f.adminToken, 'If-Match': current.headers().etag! },
        data: { estado: 'oculta', motivo: 'Outra decisão administrativa fictícia.' },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByLabel('Motivo da decisão', { exact: true })
    .fill('A minha decisão com dados antigos.');
  await page.getByRole('button', { name: 'Ocultar conteúdo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Os dados mudaram');
  await expect(page.getByRole('button', { name: 'Ocultar conteúdo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Consultar estado atualizado', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restaurar conteúdo', exact: true })).toBeEnabled();
  expect(
    (await db.db!.collection('products').findOne({ _id: new Types.ObjectId(f.product) }))!.moderacao
      .historico,
  ).toHaveLength(1);
});
test('perfil oculto retira loja e produtos e o restauro repõe consultas permitidas', async ({
  page,
}) => {
  const f = await subject(page);
  await login(page, f.credentials, '/produtores/' + f.profile);
  await report(page, 'este perfil');
  await expect(
    page.getByText('A tua denúncia está registada · Pendente.', { exact: true }),
  ).toBeVisible();
  await login(page, f.adminCredentials, base + '/perfis/' + f.profile);
  await moderate(page, 'Ocultar');
  for (const path of ['/producers/' + f.profile, '/products/' + f.product])
    expect((await page.request.get(api + path)).status()).toBe(404);
  const products = await page.request.get(api + '/products?produtor=' + f.profile);
  expect((await products.json()).total).toBe(0);
  await moderate(page, 'Restaurar');
  expect((await page.request.get(api + '/products/' + f.product)).status()).toBe(200);
});
test('avaliação pública denunciada usa a moderação existente e desaparece da média', async ({
  page,
}) => {
  const f = await subject(page);
  const order = await historicalReviewOrder(db, {
    buyer: f.s.buyerId,
    producer: f.s.producers[0]!.userId,
    product: f.s.products[0]!._id,
  });
  const loginResponse = await page.request.post(api + '/auth/login', { data: f.credentials });
  expect(loginResponse.status()).toBe(200);
  const review = await page.request.post(api + '/reviews', {
    headers: { Authorization: 'Bearer ' + (await loginResponse.json()).accessToken },
    data: {
      encomendaId: order.id,
      alvoTipo: 'produto',
      produtoId: f.product,
      classificacao: 4,
      comentario: 'Avaliação fictícia de uma compra histórica concluída.',
    },
  });
  expect(review.status()).toBe(201);
  const reviewId = (await review.json()).id;
  await login(page, f.credentials, '/produtos/' + f.product);
  await report(page, 'esta avaliação');
  await expect(
    page.getByText('A tua denúncia está registada · Pendente.', { exact: true }),
  ).toBeVisible();
  const item = await db
    .db!.collection('content_reports')
    .findOne({ autor: f.s.buyerId, alvoTipo: 'avaliacao' });
  expect(String(item!.alvoId)).toBe(reviewId);
  await login(page, f.adminCredentials, base + '/denuncias/' + item!._id);
  await page.getByRole('link', { name: 'Consultar e moderar conteúdo', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(base + '/' + reviewId + '$'));
  await expect(page.getByRole('button', { name: 'Ocultar avaliação', exact: true })).toBeVisible();
  await page
    .getByLabel('Motivo da decisão', { exact: true })
    .fill('Análise administrativa fictícia da avaliação.');
  await page.getByRole('button', { name: 'Ocultar avaliação', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar ocultação', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Restaurar avaliação', exact: true }),
  ).toBeVisible();
  const list = await page.request.get(api + '/products/' + f.product + '/reviews');
  const body = await list.json();
  expect(body.total).toBe(0);
  expect(body.resumo.media).toBeNull();
  expect(
    (await db.db!.collection('reviews').findOne({ _id: new Types.ObjectId(reviewId) }))!.comentario,
  ).toBe('Avaliação fictícia de uma compra histórica concluída.');
});
test('carrinho real reconcilia o produto oculto e conserva as outras escolhas sem reservar stock', async ({
  page,
}) => {
  const f = await subject(page);
  await login(page, f.credentials, '/produtos/' + f.product);
  await page
    .getByRole('button', {
      name: 'Adicionar Tomates da revisão de conteúdos ao carrinho',
      exact: true,
    })
    .click();
  const response = await page.request.get(api + '/products?pagina=1&porPagina=12');
  expect(response.status()).toBe(200);
  const other = (await response.json()).itens.find((p: { id: string }) => p.id !== f.product);
  expect(other).toBeTruthy();
  await navigate(page, '/produtos/' + other.id);
  await page
    .getByRole('button', { name: 'Adicionar ' + other.nome + ' ao carrinho', exact: true })
    .click();
  await navigate(page, '/carrinho');
  await expect(page.locator('.cart-line')).toHaveCount(2);
  const current = await page.request.get(api + '/admin/content/produto/' + f.product, {
    headers: { Authorization: 'Bearer ' + f.adminToken },
  });
  expect(current.status()).toBe(200);
  const hidden = await page.request.patch(
    api + '/admin/content/produto/' + f.product + '/moderation',
    {
      headers: { Authorization: 'Bearer ' + f.adminToken, 'If-Match': current.headers().etag! },
      data: { estado: 'oculta', motivo: 'Análise fictícia de um produto escolhido.' },
    },
  );
  expect(hidden.status()).toBe(200);
  const refresh = page.waitForResponse(
    (r) => r.url() === api + '/products/' + f.product && r.request().method() === 'GET',
  );
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  expect((await refresh).status()).toBe(404);
  await expect(page.locator('.cart-line')).toHaveCount(1);
  await expect(page.locator('.cart-line')).toContainText(other.nome);
  await expect(page.locator('.cart-recovery')).toContainText(
    'Tomates da revisão de conteúdos foi retirado porque já não está disponível.',
  );
  expect(
    (await db.db!.collection('products').findOne({ _id: new Types.ObjectId(f.product) }))!
      .stockDisponivel,
  ).toBe(10000);
  expect(await db.db!.collection('orders').countDocuments({ comprador: f.s.buyerId })).toBe(0);
});
test('sala existente neutraliza também a fotografia após atualizar conteúdo moderado', async ({
  page,
}) => {
  const f = await subject(page);
  const sellerLogin = await page.request.post(api + '/auth/login', { data: f.sellerCredentials });
  expect(sellerLogin.status()).toBe(200);
  const clock = await db
    .db!.collection('users')
    .aggregate<{ now: Date }>([{ $match: { _id: f.s.buyerId } }, { $project: { now: '$$NOW' } }])
    .next();
  const auction = await page.request.post(api + '/auctions', {
    headers: {
      Authorization: 'Bearer ' + (await sellerLogin.json()).accessToken,
      'Idempotency-Key': randomUUID(),
    },
    data: {
      produtoId: f.product,
      quantidade: 500,
      titulo: 'Leilão fictício de moderação',
      descricao: 'Descrição original do lote de teste.',
      precoBaseCent: 1200,
      incrementoCent: 100,
      terminaEm: new Date(clock!.now.getTime() + 600000).toISOString(),
    },
  });
  expect(auction.status()).toBe(201);
  const auctionId = (await auction.json()).id;
  await login(page, f.credentials, '/leiloes/' + auctionId);
  await expect(page.locator('.auction-photo img')).toHaveAttribute('src', /tomatoes/);
  const current = await page.request.get(api + '/admin/content/produto/' + f.product, {
    headers: { Authorization: 'Bearer ' + f.adminToken },
  });
  const hidden = await page.request.patch(
    api + '/admin/content/produto/' + f.product + '/moderation',
    {
      headers: { Authorization: 'Bearer ' + f.adminToken, 'If-Match': current.headers().etag! },
      data: { estado: 'oculta', motivo: 'Moderação fictícia de um lote existente.' },
    },
  );
  expect(hidden.status()).toBe(200);
  await page.getByRole('button', { name: 'Atualizar o leilão ↻', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Conteúdo temporariamente indisponível', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.auction-photo img')).toHaveAttribute('src', /product-placeholder/);
  await expect(
    page.getByText('A apresentação deste conteúdo está limitada por moderação.', { exact: false }),
  ).toBeVisible();
  expect(
    (await db.db!.collection('auctions').findOne({ _id: new Types.ObjectId(auctionId) }))!.titulo,
  ).toBe('Leilão fictício de moderação');
  await db.db!.collection('auctions').deleteOne({ _id: new Types.ObjectId(auctionId) });
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test('revisão visual e acessível de moderação a ' + width + ' px', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 1000 });
    const f = await subject(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const measurements: {
      name: string;
      width: number;
      contrast: Awaited<ReturnType<typeof inspectOrderContrast>>;
    }[] = [];
    async function inspect(name: string, selector: string) {
      await page.evaluate(() => document.fonts.ready);
      await page.locator(selector).scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const contrast = await inspectOrderContrast(page, selector);
      measurements.push({ name, width, contrast });
      if (artifacts) {
        await mkdir(join(artifacts, 'capturas'), { recursive: true });
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await page.screenshot({
          path: join(artifacts, 'capturas', `${width}-${name}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      }
    }
    await login(page, f.credentials, '/produtos/' + f.product);
    await report(page);
    await expect(
      page.getByText('A tua denúncia está registada · Pendente.', { exact: true }),
    ).toBeVisible();
    await inspect('produto-denuncia', '.content-report');
    const item = await db.db!.collection('content_reports').findOne({ autor: f.s.buyerId });
    await navigate(page, '/produtores/' + f.profile);
    await page.getByRole('button', { name: 'Denunciar este perfil', exact: true }).click();
    await expect(page.getByLabel('Motivo da denúncia', { exact: true })).toBeEnabled();
    await inspect('perfil-formulario', '.content-report');
    await login(page, f.adminCredentials, base + '/denuncias?identificador=' + item!._id);
    await expect(page.getByRole('link', { name: /Analisar denúncia/ })).toBeVisible();
    await inspect('administracao-lista', '.content-moderation');
    await page.getByRole('link', { name: /Analisar denúncia/ }).click();
    await expect(page.getByLabel('Motivo da decisão', { exact: true })).toBeVisible();
    await inspect('administracao-denuncia', '.content-moderation');
    await page.getByRole('link', { name: 'Consultar e moderar conteúdo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ocultar conteúdo', exact: true })).toBeVisible();
    await inspect('administracao-conteudo', '.content-moderation');
    await page
      .getByLabel('Motivo da decisão', { exact: true })
      .fill('Decisão fictícia para revisão visual.');
    await page.getByRole('button', { name: 'Ocultar conteúdo', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Continuar análise', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Confirmar decisão', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ocultar conteúdo', exact: true })).toBeFocused();
    expect(errors).toEqual([]);
    if (artifacts)
      await writeFile(
        join(artifacts, `revisao-${width}.json`),
        JSON.stringify(
          { measurements, errors, voiceOver: 'Leitura audível não verificada neste ambiente.' },
          null,
          2,
        ),
      );
  });
