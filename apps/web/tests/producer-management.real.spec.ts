import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection, Types } from 'mongoose';
import sharp from 'sharp';
import { createUserModel } from '../../api/src/modules/users/user.model';
import { hashPassword } from '../../api/src/modules/auth/passwords';
import { userInput } from '../../api/tests/support/identity-fixtures';
import { inspectOrderContrast } from './support/admin-order-accessibility';
const api = 'http://127.0.0.1:3011/api';
let root: ReturnType<typeof createConnection>,
  db: ReturnType<typeof createConnection>,
  adminToken: string,
  adminId: string,
  png: Buffer;
let adminCredentials: { email: string; password: string };
const accounts = new Set<string>();
test.beforeAll(async ({ request }) => {
  root = await createConnection(
    'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
    { dbName: 'admin' },
  ).asPromise();
  const names = (await root.db!.admin().listDatabases()).databases.filter((d) =>
    d.name.startsWith('docampo_test_web_'),
  );
  expect(names).toHaveLength(1);
  db = root.useDb(names[0]!.name);
  const password = 'Frase administrativa fictícia ' + randomUUID(),
    admin = await createUserModel(db).create(
      userInput({
        emailNormalizado: randomUUID() + '@example.invalid',
        papeis: ['administrador'],
        passwordHash: await hashPassword(password),
      }),
    );
  adminId = admin.id;
  adminCredentials = { email: admin.emailNormalizado, password };
  const login = await request.post(api + '/auth/login', {
    data: { email: admin.emailNormalizado, password },
  });
  expect(login.status()).toBe(200);
  adminToken = (await login.json()).accessToken;
  png = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#193c34' } })
    .png()
    .toBuffer();
});
test.afterEach(async () => {
  const ids = [...accounts].map((v) => new Types.ObjectId(v));
  accounts.clear();
  if (!ids.length) return;
  const auctions = await db
    .db!.collection('auctions')
    .find({ produtor: { $in: ids } }, { projection: { _id: 1 } })
    .toArray();
  await db.db!.collection('bids').deleteMany({ leilao: { $in: auctions.map((a) => a._id) } });
  await db.db!.collection('auctions').deleteMany({ produtor: { $in: ids } });
  await db.db!.collection('reviews').deleteMany({ autor: { $in: ids } });
  await db.db!.collection('checkout_attempts').deleteMany({ comprador: { $in: ids } });
  await db
    .db!.collection('orders')
    .deleteMany({ $or: [{ comprador: { $in: ids } }, { produtor: { $in: ids } }] });
  await db.db!.collection('products').deleteMany({ produtor: { $in: ids } });
  await db.db!.collection('producers').deleteMany({ userId: { $in: ids } });
  await db.db!.collection('users').deleteMany({ _id: { $in: ids } });
});
test.afterAll(async () => {
  if (db && adminId)
    await db.db!.collection('users').deleteOne({ _id: new Types.ObjectId(adminId) });
  await root?.close();
});
async function navigate(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState(null, '', p);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function account(page: Page) {
  const email = randomUUID() + '@example.invalid',
    password = 'Uma frase fictícia de teste ' + randomUUID();
  expect(
    (
      await page.request.post(api + '/auth/register', {
        data: { nome: 'Conta fictícia', email, password },
      })
    ).status(),
  ).toBe(202);
  const r = await page.request.post(api + '/auth/login', { data: { email, password } });
  expect(r.status()).toBe(200);
  const body = await r.json();
  accounts.add(body.utilizador.id);
  return { email, password, token: body.accessToken as string, id: body.utilizador.id as string };
}
async function login(page: Page, credentials: { email: string; password: string }, path: string) {
  await page.goto('/entrar?destino=' + encodeURIComponent(path));
  await page.getByLabel('Email', { exact: true }).fill(credentials.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(path + '$'));
}
async function producer(page: Page, viaInterface = false) {
  const user = await account(page),
    data = {
      nomePublico: 'Origem ' + randomUUID().slice(0, 8),
      localidade: 'Viana do Castelo',
      concelho: 'Viana do Castelo',
      descricao: 'Produção fictícia em ambiente isolado.',
      telefone: 'Contacto fictício privado',
    };
  let profileId: string;
  if (viaInterface) {
    await login(page, user, '/area/candidatura-produtor');
    for (const [label, value] of [
      ['Nome público do produtor', data.nomePublico],
      ['Localidade', data.localidade],
      ['Concelho', data.concelho],
      ['Descrição da atividade', data.descricao],
      ['Telefone de contacto', data.telefone],
    ])
      await page.getByLabel(label!, { exact: true }).fill(value!);
    const result = page.waitForResponse(
      (r) => r.url() === api + '/me/producer-application' && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Enviar candidatura', exact: true }).click();
    const r = await result;
    expect(r.status()).toBe(201);
    profileId = (await r.json()).id;
  } else {
    const r = await page.request.post(api + '/me/producer-application', {
      headers: { Authorization: 'Bearer ' + user.token },
      data,
    });
    expect(r.status()).toBe(201);
    profileId = (await r.json()).id;
  }
  const freshAdmin = await page.request.post(api + '/auth/login', { data: adminCredentials });
  expect(freshAdmin.status()).toBe(200);
  adminToken = (await freshAdmin.json()).accessToken;
  const detail = await page.request.get(api + '/admin/producer-applications/' + profileId, {
    headers: { Authorization: 'Bearer ' + adminToken },
  });
  expect(detail.status()).toBe(200);
  expect(
    (
      await page.request.post(api + '/admin/producer-applications/' + profileId + '/approve', {
        headers: { Authorization: 'Bearer ' + adminToken, 'If-Match': detail.headers().etag! },
        data: {},
      })
    ).status(),
  ).toBe(200);
  if (viaInterface) await navigate(page, '/area/produtor/perfil');
  else await login(page, user, '/area/produtor/perfil');
  await expect(
    page.getByRole('heading', { name: 'A tua origem, com as tuas palavras.' }),
  ).toBeVisible();
  return { ...user, ...data, profileId };
}
async function configure(page: Page) {
  await page.getByLabel('Configurar condições de venda', { exact: true }).check();
  await page
    .getByLabel('Local de levantamento', { exact: true })
    .fill('Ponto de levantamento fictício, definido pelo produtor');
  await page
    .getByRole('button', { name: 'Adicionar período de levantamento', exact: true })
    .click();
  await page.getByLabel('Início levantamento 1', { exact: true }).fill('09:00');
  await page.getByLabel('Fim levantamento 1', { exact: true }).fill('12:00');
  const response = page.waitForResponse(
    (r) => r.url() === api + '/me/producer' && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Guardar perfil e condições', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(
    page.getByText('Perfil e condições guardados e confirmados pelo serviço.', { exact: true }),
  ).toBeVisible();
}
async function product(page: Page) {
  await navigate(page, '/area/produtor/produtos/novo');
  const name = 'Produto ' + randomUUID().slice(0, 8);
  await page.getByLabel('Nome do produto', { exact: true }).fill(name);
  await page
    .getByLabel('Descrição', { exact: true })
    .fill('Colheita de teste para a integração real.');
  await page.getByLabel('Categoria', { exact: true }).selectOption('cat-001');
  await page.getByLabel('Preço de referência (€)', { exact: true }).fill('1,50');
  await page.getByLabel('Modalidade de venda', { exact: true }).selectOption('peso');
  await page.getByLabel('Quantidade mínima (g)', { exact: true }).fill('250');
  await page.getByLabel('Incremento de compra (g)', { exact: true }).fill('50');
  await page.getByLabel('Stock livre (g)', { exact: true }).fill('1000');
  await page.getByLabel('Limiar de alerta (g, opcional)', { exact: true }).fill('500');
  await page.getByRole('radio', { name: 'Não se aplicam ingredientes', exact: true }).check();
  const created = page.waitForResponse(
    (r) => r.url() === api + '/products' && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Criar rascunho', exact: true }).click();
  const r = await created;
  expect(r.status()).toBe(201);
  const id = (await r.json()).id as string;
  await expect(page.getByRole('heading', { name: 'Cuidar de cada produto.' })).toBeVisible();
  const uploaded = page.waitForResponse(
    (r) => r.url().endsWith('/images') && r.request().method() === 'POST',
  );
  await page
    .getByLabel('Adicionar fotografia', { exact: true })
    .setInputFiles({ name: 'teste.png', mimeType: 'image/png', buffer: png });
  expect((await uploaded).status()).toBe(200);
  await expect(page.locator('.management-photos img')).toBeVisible();
  return { id, name };
}
async function save(page: Page) {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === 'PUT' &&
      /\/api\/products\/[a-f0-9]+$/.test(new URL(r.url()).pathname),
  );
  await page.getByRole('button', { name: 'Guardar produto', exact: true }).click();
  const r = await response;
  expect(r.status()).toBe(200);
  await expect(
    page.getByText('Produto guardado e confirmado pelo serviço.', { exact: true }),
  ).toBeVisible();
  return r.json();
}
async function publish(page: Page) {
  await page.getByLabel('Estado de publicação', { exact: true }).selectOption('publicado');
  await save(page);
}
async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await inspectOrderContrast(page, '.producer-management');
  const out = process.env.DOCAMPO_MANAGEMENT_SCREENSHOTS;
  if (out) {
    await mkdir(out, { recursive: true });
    await page.screenshot({
      path: join(out, name + '.png'),
      fullPage: true,
      animations: 'disabled',
    });
  }
}
test('produtor novo: candidatura e aprovação reais, loja, foto, publicação, compra e snapshots', async ({
  page,
  browser,
}) => {
  const seller = await producer(page, true);
  await configure(page);
  const item = await product(page);
  await publish(page);
  const publicProduct = await page.request.get(api + '/products/' + item.id);
  expect(publicProduct.status()).toBe(200);
  expect((await publicProduct.json()).produtor.id).toBe(seller.profileId);
  const context = await browser.newContext(),
    buyer = await context.newPage();
  try {
    const customer = await account(buyer);
    await buyer.goto('/produtos/' + item.id);
    await buyer
      .getByRole('button', { name: 'Adicionar ' + item.name + ' ao carrinho', exact: true })
      .click();
    await login(buyer, customer, '/checkout');
    await buyer
      .getByLabel('Pagamento · ' + seller.nomePublico, { exact: true })
      .selectOption('dinheiro');
    await buyer
      .getByLabel('Janela horária · ' + seller.nomePublico, { exact: true })
      .selectOption('0');
    await buyer
      .getByRole('checkbox', {
        name: 'Confirmo as quantidades, os preços e as condições apresentadas.',
      })
      .check();
    await buyer.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
    await expect(
      buyer.getByRole('heading', { name: 'A tua compra está confirmada.' }),
    ).toBeVisible();
    const order = await db
      .db!.collection('orders')
      .findOne({ comprador: new Types.ObjectId(customer.id) });
    expect(order!.totalCent).toBe(38);
    const lines = order!.linhas;
    await navigate(page, '/area/produtor/produtos');
    await page.getByRole('link', { name: 'Gerir ' + item.name, exact: true }).click();
    await page.getByLabel('Preço de referência (€)', { exact: true }).fill('2,00');
    await save(page);
    expect((await db.db!.collection('orders').findOne({ _id: order!._id }))!.linhas).toEqual(lines);
    await navigate(page, '/area/produtor/encomendas/' + order!._id.toHexString());
    await expect(page.locator('.buyer-order-status')).toHaveText('Pendente');
  } finally {
    await context.close();
  }
});
test('reserva real protege unidade e edição antiga; stock livre permanece separado do lote', async ({
  page,
}) => {
  const seller = await producer(page);
  const item = await product(page);
  await publish(page);
  const response = await page.request.post(api + '/auctions', {
    headers: { Authorization: 'Bearer ' + seller.token, 'Idempotency-Key': randomUUID() },
    data: {
      produtoId: item.id,
      quantidade: 250,
      titulo: 'Lote fictício reservado',
      descricao: 'Reserva real para verificar isolamento de stock.',
      precoBaseCent: 100,
      incrementoCent: 50,
      terminaEm: new Date(Date.now() + 7200000).toISOString(),
    },
  });
  expect(response.status()).toBe(201);
  await page.getByLabel('Stock livre (g)', { exact: true }).fill('500');
  const stale = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith('/products/' + item.id),
  );
  await page.getByRole('button', { name: 'Guardar produto', exact: true }).click();
  expect((await stale).status()).toBe(412);
  await expect(page.getByRole('alert')).toContainText('Os dados mudaram');
  await page.getByRole('button', { name: 'Consultar estado atual', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lotes já reservados' })).toBeVisible();
  await expect(page.getByLabel('Modalidade de venda', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Stock livre (g)', { exact: true })).toHaveValue('750');
  await page.getByLabel('Stock livre (g)', { exact: true }).fill('300');
  await save(page);
  expect(
    (await db
      .db!.collection('auctions')
      .findOne({ _id: new Types.ObjectId((await response.json()).id) }))!.lote.quantidade,
  ).toBe(250);
});
test('isolamento real de produtor, conta desativada e identificadores inválidos', async ({
  page,
  browser,
}) => {
  const seller = await producer(page),
    item = await product(page);
  const context = await browser.newContext(),
    other = await context.newPage();
  try {
    await producer(other);
    await navigate(other, '/area/produtor/produtos/' + item.id);
    await expect(other.getByRole('alert')).toBeVisible();
    await expect(other.getByLabel('Nome do produto', { exact: true })).toHaveCount(0);
    await navigate(other, '/area/produtor/produtos/id-invalido');
    await expect(
      other.getByRole('heading', { name: 'Este produto não está disponível.' }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
  await db
    .db!.collection('users')
    .updateOne({ _id: new Types.ObjectId(seller.id) }, { $set: { ativo: false } });
  await navigate(page, '/area/produtor/perfil');
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
});
test('fotografia rejeitada, substituição, principal, remoção e arquivo preservam histórico', async ({
  page,
}) => {
  const seller = await producer(page),
    item = await product(page);
  await publish(page);
  await page.getByLabel('Adicionar fotografia', { exact: true }).setInputFiles({
    name: 'falsa.png',
    mimeType: 'image/png',
    buffer: Buffer.from('não é imagem'),
  });
  await expect(page.getByRole('alert')).toContainText('Revê os campos');
  await page
    .getByLabel('Adicionar fotografia', { exact: true })
    .setInputFiles({ name: 'outra.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.management-photos img')).toHaveCount(2);
  await page
    .getByLabel('Texto alternativo da fotografia 2', { exact: true })
    .fill('Segunda perspetiva da colheita fictícia');
  await page.getByRole('radio', { name: 'Fotografia principal', exact: true }).nth(1).check();
  await save(page);
  const p = await page.request.get(api + '/products/' + item.id);
  expect((await p.json()).imagens[1].principal).toBe(true);
  await page.getByRole('button', { name: 'Retirar fotografia 1', exact: true }).click();
  await save(page);
  expect(
    (await (await page.request.get(api + '/products/' + item.id)).json()).imagens,
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'Retirar produto de venda', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Sim, arquivar produto', exact: true }).click();
  await expect(page.getByText('Produto arquivado.', { exact: false })).toBeVisible();
  expect((await page.request.get(api + '/products/' + item.id)).status()).toBe(404);
  expect(
    (
      await page.request.get(api + '/me/products/' + item.id, {
        headers: { Authorization: 'Bearer ' + seller.token },
      })
    ).status(),
  ).toBe(200);
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(
    'gestão real, fotografias, perfil, stock, erro e vazio a ' + width + ' px',
    async ({ page }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await producer(page);
      await capture(page, width + '-perfil');
      await configure(page);
      const item = await product(page);
      await capture(page, width + '-produto-rascunho');
      await publish(page);
      await capture(page, width + '-fotografias');
      await page.getByLabel('Stock livre (g)', { exact: true }).fill('250');
      await save(page);
      await navigate(page, '/area/produtor/produtos?stock=baixo');
      await expect(page.getByRole('heading', { name: item.name, exact: true })).toBeVisible();
      await capture(page, width + '-lista-stock-baixo');
      await navigate(page, '/area/produtor/indicadores');
      await expect(
        page.getByRole('link', { name: 'Produtos com stock reduzido', exact: true }),
      ).toBeVisible();
      await capture(page, width + '-indicadores');
      await navigate(page, '/area/produtor/produtos?stock=esgotado');
      await expect(
        page.getByRole('heading', { name: 'Sem produtos para esta escolha.' }),
      ).toBeVisible();
      await capture(page, width + '-vazio');
      await page.route('**/api/me/products*', (route) => route.abort('failed'));
      await navigate(page, '/area/produtor/produtos');
      await expect(page.getByRole('alert')).toBeVisible();
      await capture(page, width + '-erro');
      await page.unroute('**/api/me/products*');
      await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
      await expect(page.getByRole('heading', { name: item.name, exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    },
  );

test('teclado contém o foco na confirmação, Escape preserva produto e erros recebem foco', async ({
  page,
}) => {
  await producer(page);
  const item = await product(page);
  await publish(page);
  const trigger = page.getByRole('button', { name: 'Retirar produto de venda', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog'),
    cancel = dialog.getByRole('button', { name: 'Continuar análise', exact: true }),
    confirm = dialog.getByRole('button', { name: 'Sim, arquivar produto', exact: true });
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect((await page.request.get(api + '/products/' + item.id)).status()).toBe(200);
  await page.getByLabel('Adicionar fotografia', { exact: true }).setInputFiles({
    name: 'rejeitada.png',
    mimeType: 'image/png',
    buffer: Buffer.from('inválida'),
  });
  await expect(page.getByRole('alert')).toBeFocused();
  await inspectOrderContrast(page, '.producer-management');
});
