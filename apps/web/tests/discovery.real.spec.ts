import { test, expect, type Page } from '@playwright/test';
import { createConnection, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createUserModel } from '../../api/src/modules/users/user.model';
import { hashPassword } from '../../api/src/modules/auth/passwords';
import { userInput } from '../../api/tests/support/identity-fixtures';
import { inspectOrderContrast } from './support/admin-order-accessibility';
const api = 'http://127.0.0.1:3011/api',
  accounts = new Set<string>();
let root: ReturnType<typeof createConnection>,
  db: ReturnType<typeof createConnection>,
  admin: { id: string; email: string; password: string };
test.beforeAll(async () => {
  root = await createConnection(
    'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
    { dbName: 'admin' },
  ).asPromise();
  const names = (await root.db!.admin().listDatabases()).databases.filter((v) =>
    v.name.startsWith('docampo_test_web_'),
  );
  expect(names).toHaveLength(1);
  db = root.useDb(names[0]!.name);
  const password = 'Admin fictício de descoberta ' + randomUUID(),
    user = await createUserModel(db).create(
      userInput({
        emailNormalizado: randomUUID() + '@example.invalid',
        papeis: ['administrador'],
        passwordHash: await hashPassword(password),
      }),
    );
  admin = { id: user.id, email: user.emailNormalizado, password };
});
test.afterEach(async () => {
  const ids = [...accounts].map((v) => new Types.ObjectId(v));
  accounts.clear();
  if (!ids.length) return;
  const lots = await db
    .db!.collection('auctions')
    .find({ produtor: { $in: ids } }, { projection: { _id: 1 } })
    .toArray();
  for (const [collection, query] of [
    ['bids', { leilao: { $in: lots.map((v) => v._id) } }],
    ['auctions', { produtor: { $in: ids } }],
    ['products', { produtor: { $in: ids } }],
    ['producers', { userId: { $in: ids } }],
    ['users', { _id: { $in: ids } }],
  ] as const)
    await db.db!.collection(collection).deleteMany(query);
});
test.afterAll(async () => {
  if (admin) await db.db!.collection('users').deleteOne({ _id: new Types.ObjectId(admin.id) });
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
    password = 'Pessoa fictícia de descoberta ' + randomUUID();
  expect(
    (
      await page.request.post(api + '/auth/register', {
        data: { nome: 'Conta fictícia de ensaio', email, password },
      })
    ).status(),
  ).toBe(202);
  const r = await page.request.post(api + '/auth/login', { data: { email, password } });
  expect(r.status()).toBe(200);
  const body = await r.json();
  accounts.add(body.utilizador.id);
  return { email, password, id: body.utilizador.id as string, token: body.accessToken as string };
}
async function login(page: Page, credentials: { email: string; password: string }, path: string) {
  await page.goto('/entrar?destino=' + encodeURIComponent(path));
  await page.getByLabel('Email', { exact: true }).fill(credentials.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(path + '$'));
}
async function seller(page: Page) {
  const user = await account(page),
    name = 'Origem de ensaio ' + randomUUID().slice(0, 8);
  const r = await page.request.post(api + '/me/producer-application', {
    headers: { Authorization: 'Bearer ' + user.token },
    data: {
      nomePublico: name,
      localidade: 'Évora',
      concelho: 'Évora',
      descricao: 'Produtor fictício para revisão isolada.',
      telefone: 'Contacto privado fictício',
    },
  });
  expect(r.status()).toBe(201);
  const profileId = (await r.json()).id as string;
  const a = await page.request.post(api + '/auth/login', {
    data: { email: admin.email, password: admin.password },
  });
  expect(a.status()).toBe(200);
  const token = (await a.json()).accessToken;
  const detail = await page.request.get(api + '/admin/producer-applications/' + profileId, {
    headers: { Authorization: 'Bearer ' + token },
  });
  expect(
    (
      await page.request.post(api + '/admin/producer-applications/' + profileId + '/approve', {
        headers: { Authorization: 'Bearer ' + token, 'If-Match': detail.headers().etag! },
        data: {},
      })
    ).status(),
  ).toBe(200);
  return { ...user, name, profileId };
}
async function product(page: Page, user: Awaited<ReturnType<typeof seller>>) {
  const body = {
    nome: 'Receita da colheita ' + randomUUID().slice(0, 8),
    descricao: 'Preparação da produção de ensaio.',
    categoriaId: 'cat-007',
    precoCent: 250,
    unidadeVenda: { modalidade: 'peso', quantidadeMinima: 250, incrementoCompra: 50 },
    stockDisponivel: 10000,
    ingredientesAplicaveis: true,
    ingredientes: ['Açafrão', 'Sal'],
    imagens: [
      {
        url: 'http://127.0.0.1:5183/images/tomatoes.webp',
        alt: 'Fotografia fictícia de revisão',
        principal: true,
      },
    ],
    epocaMeses: [10],
    modoProducao: 'Biológico',
  };
  const r = await page.request.post(api + '/products', {
    headers: { Authorization: 'Bearer ' + user.token },
    data: body,
  });
  expect(r.status()).toBe(201);
  const id = (await r.json()).id as string;
  expect(
    (
      await page.request.put(api + '/products/' + id, {
        headers: { Authorization: 'Bearer ' + user.token, 'If-Match': r.headers().etag! },
        data: { ...body, estadoPublicacao: 'publicado' },
      })
    ).status(),
  ).toBe(200);
  return { id, ...body };
}
async function save(page: Page, kind: 'profile' | 'product', id = '') {
  const r = page.waitForResponse(
    (v) =>
      v.request().method() === 'PUT' &&
      v.url().endsWith(kind === 'profile' ? '/me/producer' : '/products/' + id),
  );
  await page
    .getByRole('button', {
      name: kind === 'profile' ? 'Guardar perfil e condições' : 'Guardar produto',
      exact: true,
    })
    .click();
  expect((await r).status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'guardad' })).toBeVisible();
}
async function location(page: Page, user: Awaited<ReturnType<typeof seller>>) {
  await login(page, user, '/area/produtor/perfil');
  await page.getByLabel('Publicar um ponto de localização', { exact: true }).check();
  await page.getByLabel('Latitude pública', { exact: true }).fill('41.69');
  await page.getByLabel('Longitude pública', { exact: true }).fill('-8.83');
  await page
    .getByLabel('Descrição do ponto público', { exact: true })
    .fill('Ponto público fictício de revisão');
  await page
    .getByRole('checkbox', {
      name: 'Autorizo a publicação destas coordenadas e desta descrição no meu perfil público.',
      exact: true,
    })
    .check();
  await save(page, 'profile');
}
async function tiles(page: Page) {
  await page.route('https://tile.openstreetmap.org/**', (r) =>
    r.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWpQAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
}
async function capture(page: Page, name: string, scope = 'main') {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  if (name.endsWith('-pesquisa'))
    await expect(
      page.getByRole('status', { name: 'Resultados do catálogo', exact: true }),
    ).toHaveText('1 produto encontrado');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const contrast = await inspectOrderContrast(page, scope);
  if (process.env.DOCAMPO_DISCOVERY_SCREENSHOTS) {
    await mkdir(process.env.DOCAMPO_DISCOVERY_SCREENSHOTS, { recursive: true });
    await writeFile(
      join(process.env.DOCAMPO_DISCOVERY_SCREENSHOTS, name + '.json'),
      JSON.stringify(
        {
          viewport: page.viewportSize(),
          contrast,
          overflow: false,
          focus: await page.evaluate(() => {
            const skip = document.querySelector('.skip-link');
            return {
              skipFocused: skip === document.activeElement,
              skipTransform: skip ? getComputedStyle(skip).transform : null,
            };
          }),
        },
        null,
        2,
      ),
    );
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: join(process.env.DOCAMPO_DISCOVERY_SCREENSHOTS, name + '.png'),
      fullPage: true,
      animations: 'disabled',
    });
  }
}
async function auction(
  page: Page,
  user: Awaited<ReturnType<typeof seller>>,
  produtoId: string,
  seconds = 3600,
  scheduled = false,
) {
  const r = await page.request.post(api + '/auctions', {
    headers: { Authorization: 'Bearer ' + user.token, 'Idempotency-Key': randomUUID() },
    data: {
      produtoId,
      quantidade: 500,
      titulo: 'Colheita real para a página inicial',
      descricao: 'Leilão de ensaio numa base efémera.',
      precoBaseCent: 1200,
      incrementoCent: 100,
      ...(scheduled ? { iniciaEm: new Date(Date.now() + 3600000).toISOString() } : {}),
      terminaEm: new Date(Date.now() + seconds * 1000).toISOString(),
    },
  });
  expect(r.status()).toBe(201);
  return r.json();
}

test('ingredientes no CRUD React refletem-se na pesquisa MongoDB com acentos e filtros', async ({
  page,
}) => {
  const user = await seller(page),
    item = await product(page, user);
  await login(page, user, '/area/produtor/produtos/' + item.id + '/editar');
  await page
    .getByLabel('Ingredientes (um por linha)', { exact: true })
    .fill('Açafrão\nSementes de abóbora\nSal');
  await save(page, 'product', item.id);
  await navigate(
    page,
    '/produtos?produtor=' +
      user.profileId +
      '&categoria=cat-007&epoca=Outono&bio=true&localidade=EVORA&ordem=preco-asc',
  );
  for (const term of ['ACAFRAO', '  açafrão    sal  ', 'abobora']) {
    await page.getByLabel('Pesquisar produtos ou produtores', { exact: true }).fill(term);
    await expect(
      page
        .locator('.product-grid .product-card')
        .getByRole('heading', { name: item.nome, exact: true }),
    ).toBeVisible();
  }
  expect((await page.request.get(api + '/products/' + item.id)).ok()).toBe(true);
  await navigate(page, '/area/produtor/produtos/' + item.id + '/editar');
  await page.getByRole('radio', { name: 'Não se aplicam ingredientes', exact: true }).check();
  await save(page, 'product', item.id);
  await navigate(page, '/produtos?pesquisa=acafrao&produtor=' + user.profileId);
  await expect(page.locator('.product-grid .product-card')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: /Nenhum produto|Ainda não encontrámos|Não encontrámos/i }),
  ).toBeVisible();
});
test('produtor publica e remove o ponto; mapa real Leaflet usa apenas dados autorizados da API', async ({
  page,
}) => {
  const user = await seller(page);
  await tiles(page);
  await location(page, user);
  const r = await page.request.get(api + '/producers/' + user.profileId),
    dto = await r.json();
  expect(dto.localizacaoPublica).toMatchObject({ latitude: 41.69, longitude: -8.83 });
  expect(dto.telefone).toBeUndefined();
  expect(JSON.stringify(dto)).not.toContain('Contacto privado');
  await navigate(page, '/produtores/' + user.profileId);
  await expect(
    page.getByRole('heading', { name: 'Ponto público fictício de revisão', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostrar mapa OpenStreetMap', exact: true }).click();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
  await navigate(page, '/area/produtor/perfil');
  await page.getByLabel('Publicar um ponto de localização', { exact: true }).uncheck();
  await save(page, 'profile');
  await navigate(page, '/produtores/' + user.profileId);
  await expect(
    page.getByRole('heading', { name: 'Localização indisponível', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.leaflet-container,iframe')).toHaveCount(0);
  expect(
    (await (await page.request.get(api + '/producers/' + user.profileId)).json())
      .localizacaoPublica,
  ).toBeUndefined();
});
test('homepage recebe ofertas reais, reconcilia REST e retira o destaque no fim sem alterar o leilão', async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  const user = await seller(page),
    item = await product(page, user),
    buyer = await account(page);
  const lot = await auction(page, user, item.id, 22);
  await auction(page, user, item.id, 7200, true);
  await page.goto('/');
  await expect(page.locator('.featured-auction')).toContainText(user.name);
  await expect(page.locator('.featured-auction')).toContainText('Preço base · ainda sem ofertas');
  expect(
    (
      await request.post(api + '/auctions/' + lot.id + '/bids', {
        headers: { Authorization: 'Bearer ' + buyer.token, 'Idempotency-Key': randomUUID() },
        data: { valorCent: 1300 },
      })
    ).status(),
  ).toBe(201);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.featured-auction')).toContainText('13,00');
  await expect(page.locator('.featured-auction')).toContainText('Oferta confirmada pelo serviço');
  await expect(
    page.getByRole('heading', { name: 'Ainda sem leilões em direto.', exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.featured-auction')).toHaveCount(0);
  const persisted = await db
    .db!.collection('auctions')
    .findOne({ _id: new Types.ObjectId(lot.id) });
  expect(persisted!.estado).toBe('terminado');
  expect(persisted!.resultado.tipo).toBe('vencedor');
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(
    'descoberta real, mapa, filtros e destaque acessíveis a ' + width + ' px',
    async ({ page }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const user = await seller(page),
        item = await product(page, user);
      await auction(page, user, item.id);
      await tiles(page);
      await location(page, user);
      await capture(page, width + '-localizacao-privada', '.producer-management');
      await navigate(page, '/produtores/' + user.profileId);
      await capture(page, width + '-perfil-antes-mapa', '.producer-profile-page');
      await page.getByRole('button', { name: 'Mostrar mapa OpenStreetMap', exact: true }).click();
      await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
      await capture(page, width + '-mapa', '.producer-profile-page');
      await navigate(
        page,
        '/produtos?pesquisa=ACAFRAO&produtor=' +
          user.profileId +
          '&categoria=cat-007&epoca=Outono&bio=true&localidade=EVORA',
      );
      await expect(
        page
          .locator('.product-grid .product-card')
          .getByRole('heading', { name: item.nome, exact: true }),
      ).toBeVisible();
      expect(
        await page.locator('.catalog-search-field').evaluate((el) => {
          const input = el.querySelector('input')!.getBoundingClientRect(),
            icon = el.querySelector('svg')!.getBoundingClientRect();
          return Math.abs(input.y + input.height / 2 - (icon.y + icon.height / 2));
        }),
      ).toBeLessThan(2);
      await capture(page, width + '-pesquisa', '.catalog-page');
      await navigate(page, '/');
      await expect(page.locator('.featured-auction')).toBeVisible();
      const image = page.locator('.featured-auction img');
      // O destaque pode ser substituído pela reconciliação real enquanto se desloca a página.
      await expect(async () => {
        await image.scrollIntoViewIfNeeded({ timeout: 1000 });
        expect(
          await image.evaluate(
            (el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0,
          ),
        ).toBe(true);
      }).toPass({ timeout: 5000 });
      const clock = page.locator('.featured-auction .auction-clock strong');
      await expect(clock).toBeVisible();
      expect(
        await clock.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return range.getClientRects().length;
        }),
      ).toBe(1);
      expect(
        await page.locator('.featured-auction').evaluate((el) => {
          const card = el.getBoundingClientRect(),
            button = el.querySelector('.market-button')!.getBoundingClientRect();
          return button.left >= card.left && button.right <= card.right;
        }),
      ).toBe(true);
      await capture(page, width + '-homepage');
      if (process.env.DOCAMPO_DISCOVERY_SCREENSHOTS) {
        const section = await page.locator('.auction-section').boundingBox();
        if (!section) throw new Error('Secção de destaque indisponível para captura.');
        await page.screenshot({
          clip: section,
          fullPage: true,
          path: join(process.env.DOCAMPO_DISCOVERY_SCREENSHOTS, width + '-destaque.png'),
          animations: 'disabled',
        });
      }
      await page.route('**/api/auctions?*', (r) => r.abort());
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(page.locator('.auction-section [role="alert"]')).toBeVisible();
      await capture(page, width + '-erro-leiloes', '.auction-section');
      expect(errors).toEqual([]);
    },
  );
