import { test, expect, type Page } from './support/test';
import { mockAccount, fixtureUser, fixturePassword } from './support/auth-fixtures';
import { mockCatalog } from './support/catalog-fixtures';
import { cartStorageKey, CART_STORAGE_KEY } from '../src/features/cart/storage';
const second = {
  ...fixtureUser,
  id: '000000000000000000000502',
  nome: 'Comprador B',
  email: 'b@example.invalid',
};
async function navigate(page: Page, path: string) {
  if (!page.url().startsWith('http')) {
    await page.goto(path);
    return;
  }
  await page.evaluate((p) => {
    history.pushState(null, '', p);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function login(
  page: Page,
  state: Awaited<ReturnType<typeof mockAccount>>,
  user = fixtureUser,
) {
  state.user = user;
  await navigate(page, '/entrar');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.locator('.account-identity').waitFor();
}
async function logout(page: Page) {
  await navigate(page, '/area/comprador');
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
}
async function add(page: Page, pear = false) {
  await navigate(
    page,
    '/produtos/' + (pear ? 'aa6b68cc89c59bc055a5699b' : 'ee685adf80156cb9e1e85c27'),
  );
  await page
    .getByRole('button', {
      name: pear
        ? 'Adicionar Pera Rocha ao carrinho'
        : 'Adicionar Tomate coração-de-boi ao carrinho',
      exact: true,
    })
    .click();
}
async function lines(page: Page, tomato: number, pear: number) {
  await navigate(page, '/carrinho');
  await expect(page.locator('.cart-line').filter({ hasText: 'Tomate coração-de-boi' })).toHaveCount(
    tomato,
  );
  await expect(page.locator('.cart-line').filter({ hasText: 'Pera Rocha' })).toHaveCount(pear);
}
test('A e B recuperam apenas a própria cesta após login/logout sucessivos', async ({ page }) => {
  const state = await mockAccount(page);
  await login(page, state);
  await add(page);
  await lines(page, 1, 0);
  await logout(page);
  await lines(page, 0, 0);
  await login(page, state, second);
  await lines(page, 0, 0);
  await add(page, true);
  await lines(page, 0, 1);
  await logout(page);
  await login(page, state);
  await lines(page, 1, 0);
  await logout(page);
  await login(page, state, second);
  await lines(page, 0, 1);
});
test('refresh remove sessão e cesta visível; novo login recupera a cesta da conta', async ({
  page,
}) => {
  const state = await mockAccount(page);
  await login(page, state);
  await add(page);
  await page.reload();
  await lines(page, 0, 0);
  await login(page, state);
  await lines(page, 1, 0);
  const raw = await page.evaluate(
    (key) => localStorage.getItem(key),
    cartStorageKey(fixtureUser.id),
  );
  expect(raw).not.toContain(fixturePassword);
  expect(raw).not.toContain(fixtureUser.email);
});
test('visitante só transfere a cesta por confirmação explícita; B não a recebe', async ({
  page,
}) => {
  const state = await mockAccount(page);
  await add(page);
  await login(page, state);
  await lines(page, 0, 0);
  await expect(page.getByRole('button', { name: 'Importar cesta de visitante' })).toBeVisible();
  await page.getByRole('button', { name: 'Importar cesta de visitante' }).click();
  await lines(page, 1, 0);
  await logout(page);
  await lines(page, 0, 0);
  await login(page, state, second);
  await lines(page, 0, 0);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).items, CART_STORAGE_KEY),
  ).toEqual([]);
});
test('cesta antiga sem proprietário não é atribuída nem apagada automaticamente', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('docampo.cart.v1', '{"legado":"sem identidade"}'),
  );
  const state = await mockAccount(page);
  await login(page, state);
  await lines(page, 0, 0);
  expect(await page.evaluate(() => localStorage.getItem('docampo.cart.v1'))).toBe(
    '{"legado":"sem identidade"}',
  );
});
test('separadores da mesma conta sincronizam; uma conta diferente permanece independente', async ({
  page,
  context,
}) => {
  const state = await mockAccount(page);
  await login(page, state);
  const same = await context.newPage(),
    other = await context.newPage();
  await mockCatalog(same);
  await mockCatalog(other);
  const sameState = await mockAccount(same),
    otherState = await mockAccount(other);
  await login(same, sameState);
  await navigate(same, '/carrinho');
  await login(other, otherState, second);
  await navigate(other, '/carrinho');
  await add(page);
  await expect(same.locator('.cart-line')).toHaveCount(1);
  await expect(other.locator('.cart-line')).toHaveCount(0);
  await add(other, true);
  await expect(same.locator('.cart-line')).toHaveCount(1);
  await expect(same.locator('.cart-line')).not.toContainText('Pera Rocha');
  await same.getByRole('button', { name: /Esvaziar/ }).click();
  await navigate(page, '/carrinho');
  await expect(page.locator('.cart-line')).toHaveCount(0);
  await navigate(other, '/carrinho');
  await expect(other.locator('.cart-line')).toHaveCount(1);
});
test('esvaziar, quantidades e totais de B não modificam o snapshot guardado de A', async ({
  page,
}) => {
  const state = await mockAccount(page);
  await login(page, state);
  await add(page);
  const before = await page.evaluate(
    (k) => localStorage.getItem(k),
    cartStorageKey(fixtureUser.id),
  );
  await logout(page);
  await login(page, state, second);
  await add(page, true);
  await navigate(page, '/carrinho');
  await expect(page.locator('.cart-line__subtotal')).toContainText('2,40');
  await page.getByRole('button', { name: /Esvaziar/ }).click();
  await expect(page.locator('.cart-line')).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), cartStorageKey(fixtureUser.id))).toBe(
    before,
  );
});

test('uma atualização tardia de stock de A não altera a cesta nem o contador de B', async ({
  page,
}) => {
  const state = await mockAccount(page);
  await login(page, state);
  await add(page);
  await lines(page, 1, 0);
  let release!: () => void;
  let requested!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const captured = new Promise<void>((resolve) => {
    requested = resolve;
  });
  let waiting = true;
  await page.route('**/api/products/ee685adf80156cb9e1e85c27', async (route) => {
    if (!waiting) return route.fallback();
    waiting = false;
    requested();
    await gate;
    await route.fallback();
  });
  await page.evaluate(() => dispatchEvent(new Event('catalog:changed')));
  await captured;
  await logout(page);
  await login(page, state, second);
  await add(page, true);
  release();
  await lines(page, 0, 1);
  await expect(page.locator('.header-cart')).toContainText('1');
  await logout(page);
  await login(page, state);
  await lines(page, 1, 0);
});

test('checkout depois da troca de conta usa a cesta de B e preserva a de A', async ({ page }) => {
  const { mockCheckout, checkoutProduct } = await import('./support/checkout-fixtures');
  const { pendingPurchaseKey } = await import('../src/features/checkout/model');
  const state = await mockAccount(page);
  const api = await mockCheckout(page);
  await login(page, state);
  await add(page);
  const a = await page.evaluate((k) => localStorage.getItem(k), cartStorageKey(fixtureUser.id));
  await logout(page);
  await login(page, state, second);
  await navigate(page, '/checkout');
  await expect(page.getByRole('heading', { name: 'A cesta está vazia.' })).toBeVisible();
  expect(api.calls).toEqual([]);
  await add(page);
  await navigate(page, '/checkout');
  await page.getByLabel('Pagamento · Origem de teste', { exact: true }).selectOption('dinheiro');
  await page.getByLabel('Janela horária · Origem de teste', { exact: true }).selectOption('0');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A tua compra está confirmada.', exact: true }),
  ).toBeVisible();
  const sent = api.calls.find((c) => c.path === '/api/orders')!;
  expect(
    (sent.body as { linhas: { produtoId: string; quantidade: number }[] }).linhas,
  ).toMatchObject([{ produtoId: checkoutProduct.id, quantidade: 1 }]);
  expect(await page.evaluate((k) => localStorage.getItem(k), cartStorageKey(fixtureUser.id))).toBe(
    a,
  );
  expect(
    await page.evaluate((k) => localStorage.getItem(k), pendingPurchaseKey + '.' + fixtureUser.id),
  ).toBeNull();
  await logout(page);
  await login(page, state);
  await lines(page, 1, 0);
});
