import { expect, test } from './support/test';
import { mockAccount, fixtureUser, fixturePassword } from './support/auth-fixtures';
import { mockCheckout, checkoutProduct, checkoutOrderId } from './support/checkout-fixtures';
import { pendingPurchaseKey } from '../src/features/checkout/model';
async function add(page: import('@playwright/test').Page) {
  await page.goto('/produtos/' + checkoutProduct.id);
  await page
    .getByRole('button', {
      name: 'Adicionar ' + checkoutProduct.nome + ' ao carrinho',
      exact: true,
    })
    .click();
}
async function login(page: import('@playwright/test').Page) {
  await page.goto('/entrar?destino=%2Fcheckout');
  await page.getByLabel('Email', { exact: true }).fill(fixtureUser.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
async function fields(page: import('@playwright/test').Page) {
  await page.getByLabel('Pagamento · Origem de teste', { exact: true }).selectOption('dinheiro');
  await page.getByLabel('Janela horária · Origem de teste', { exact: true }).selectOption('0');
  await page.getByRole('checkbox').check();
}
async function setup(page: import('@playwright/test').Page) {
  const account = await mockAccount(page),
    api = await mockCheckout(page);
  await add(page);
  await login(page);
  return { account, api };
}
const orders = (api: Awaited<ReturnType<typeof mockCheckout>>) =>
  api.calls.filter((c) => c.path === '/api/orders');
test('checkout 201 envia contrato real, JWT em header e uma chave opaca sem totais/identidade livres', async ({
  page,
}) => {
  const { api } = await setup(page);
  await fields(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A tua compra está confirmada.' })).toBeVisible();
  await expect(page.locator('.live-order')).toHaveCount(1);
  expect(orders(api)).toHaveLength(1);
  const call = orders(api)[0]!;
  expect(call.key).toMatch(/^[a-f0-9-]{36}$/);
  expect(Object.keys(call.body as object).sort()).toEqual(['condicoesPorProdutor', 'linhas']);
  expect(JSON.stringify(call.body)).not.toContain('compradorContaId');
  expect(
    (await page.evaluate(() => JSON.parse(localStorage.getItem('docampo.cart.v1') ?? '{}'))).items,
  ).toEqual([]);
});
test('HTTP 200 apresenta confirmação recuperada e dados do servidor', async ({ page }) => {
  const { api } = await setup(page);
  api.postStatus = 200;
  await fields(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A tua compra está confirmada.' })).toBeVisible();
  await expect(page.locator('.checkout-receipt')).toContainText(
    '12345678-1234-4234-8234-123456789abc',
  );
});
test('HTTP 503 mantém tentativa e cesta e repete exatamente chave e payload', async ({ page }) => {
  const { api } = await setup(page);
  api.postStatus = 503;
  await fields(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(
    page.getByText('Ainda não foi possível confirmar o resultado.', { exact: false }),
  ).toBeVisible();
  expect(
    (await page.evaluate(() => JSON.parse(localStorage.getItem('docampo.cart.v1') ?? '{}'))).items,
  ).toHaveLength(1);
  expect(orders(api)).toHaveLength(1);
  api.postStatus = 200;
  await page.getByRole('button', { name: 'Recuperar resultado da compra', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A tua compra está confirmada.' })).toBeVisible();
  expect(orders(api)[1]!.key).toBe(orders(api)[0]!.key);
  expect(orders(api)[1]!.body).toEqual(orders(api)[0]!.body);
});
test('falha de rede conserva a tentativa original sem afirmar compra falhada', async ({ page }) => {
  const { api } = await setup(page);
  api.networkFailure = true;
  await fields(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Recuperar resultado da compra', exact: true }),
  ).toBeVisible();
  expect(orders(api)).toHaveLength(1);
  api.networkFailure = false;
  api.postStatus = 200;
  await page.getByRole('button', { name: 'Recuperar resultado da compra', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A tua compra está confirmada.' })).toBeVisible();
  expect(orders(api)[1]!.key).toBe(orders(api)[0]!.key);
});
test('reconfirmação 409 exige revisão e nova aceitação antes de uma nova tentativa', async ({
  page,
}) => {
  const { api } = await setup(page);
  api.postStatus = 409;
  api.postCode = 'RECONFIRMACAO_NECESSARIA';
  await fields(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rever condições', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rever condições', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar compra', exact: true })).toBeDisabled();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  api.postStatus = 201;
  await fields(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A tua compra está confirmada.' })).toBeVisible();
  expect(orders(api)[0]!.key).not.toBe(orders(api)[1]!.key);
});
test('conflito de idempotência não gera automaticamente outra chave', async ({ page }) => {
  const { api } = await setup(page);
  api.postStatus = 409;
  api.postCode = 'CONFLITO_IDEMPOTENCIA';
  await fields(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Recuperar resultado da compra', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rever condições', exact: true })).toHaveCount(0);
  expect(orders(api)).toHaveLength(1);
});
test('campos obrigatórios e aceitação impedem submissão incompleta', async ({ page }) => {
  const { api } = await setup(page);
  await expect(page.getByRole('button', { name: 'Confirmar compra', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Preenche o método de pagamento');
  expect(api.calls.filter((c) => c.path.endsWith('/attempts'))).toEqual([]);
});
test('indisponibilidade da preparação tem erro e nova tentativa sem apagar a cesta', async ({
  page,
}) => {
  await mockAccount(page);
  const api = await mockCheckout(page);
  api.prepareStatus = 503;
  await add(page);
  await login(page);
  await expect(page.getByRole('alert')).toContainText('Não foi possível preparar a compra');
  expect(
    (await page.evaluate(() => JSON.parse(localStorage.getItem('docampo.cart.v1') ?? '{}'))).items,
  ).toHaveLength(1);
  api.prepareStatus = 200;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Confirmar compra' })).toBeVisible();
});
test('checkout de visitante pede login e não chama endpoints privados', async ({ page }) => {
  await mockAccount(page);
  const api = await mockCheckout(page);
  await add(page);
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Entra para continuar a compra.' })).toBeVisible();
  expect(api.calls).toEqual([]);
});
test('papel sem comprador não recebe formulário de compra', async ({ page }) => {
  const account = await mockAccount(page);
  account.roles = ['produtor'];
  const api = await mockCheckout(page);
  await add(page);
  await login(page);
  await page.evaluate(() => {
    history.pushState(null, '', '/checkout');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(
    page.getByRole('heading', { name: 'Esta conta não tem acesso às compras.' }),
  ).toBeVisible();
  expect(api.calls).toEqual([]);
});
test('armazenamento indisponível bloqueia envio antes de criar uma encomenda', async ({ page }) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new DOMException('Quota fictícia', 'QuotaExceededError');
      return original.call(this, k, v);
    };
  }, pendingPurchaseKey);
  const { api } = await setup(page);
  await fields(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('A compra não foi enviada');
  expect(orders(api)).toEqual([]);
  expect(api.calls.filter((c) => c.path.endsWith('/attempts'))).toEqual([]);
});
test('recibo inválido não limpa o carrinho nem apresenta sucesso', async ({ page }) => {
  const { api } = await setup(page);
  api.invalidReceipt = true;
  await fields(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Recuperar resultado da compra', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A tua compra está confirmada.' })).toHaveCount(0);
  expect(
    (await page.evaluate(() => JSON.parse(localStorage.getItem('docampo.cart.v1') ?? '{}'))).items,
  ).toHaveLength(1);
});
test('falha de detalhe não desmente uma compra confirmada', async ({ page }) => {
  const { api } = await setup(page);
  api.ordersStatus = 503;
  await fields(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A tua compra está confirmada.' })).toBeVisible();
  await expect(
    page.getByText('A compra está confirmada. Ainda não foi possível carregar todos os detalhes.'),
  ).toBeVisible();
  api.ordersStatus = 200;
  await page.getByRole('button', { name: 'Carregar detalhes', exact: true }).click();
  await expect(page.locator('.live-order')).toHaveCount(1);
});
test('revalidação da sessão preserva as informações de entrega apenas em memória', async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel('Como receber · Origem de teste', { exact: true }).selectOption('entrega');
  await page
    .getByLabel('Morada de entrega · Origem de teste', { exact: true })
    .fill('Morada fictícia na memória');
  await page
    .getByLabel('Contacto de entrega · Origem de teste', { exact: true })
    .fill('Contacto fictício na memória');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByLabel('Morada de entrega · Origem de teste', { exact: true })).toHaveValue(
    'Morada fictícia na memória',
  );
  const storage = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(storage).not.toContain('Morada fictícia na memória');
});
test('encomendas reais têm listagem, detalhe e histórico sem comandos inexistentes', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    history.pushState(null, '', '/area/comprador/encomendas');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('.live-order-card')).toHaveCount(1);
  await page.getByRole('link', { name: 'Consultar encomenda →', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(checkoutOrderId + '$'));
  await expect(page.getByRole('heading', { name: 'Histórico', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Cancelar encomenda|Confirmar receção/ }),
  ).toHaveCount(0);
});

test('paginação e ordenação das encomendas são pedidas à API', async ({ page }) => {
  const { api } = await setup(page),
    original = api.orders[0]!;
  api.orders = Array.from({ length: 13 }, (_, index) => ({
    ...original,
    id: (BigInt('0x' + original.id) + BigInt(index)).toString(16).padStart(24, '0'),
    criadaEm: new Date(Date.UTC(2026, 9, 1 + index)).toISOString(),
  }));
  await page.evaluate(() => {
    history.pushState(null, '', '/area/comprador/encomendas');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('.live-order-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Página seguinte', exact: true }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(page.locator('.live-order-card')).toHaveCount(1);
  await page.getByLabel('Ordenar por data', { exact: true }).selectOption('antigas');
  await expect(page).toHaveURL(/ordem=antigas/);
  await expect(page.locator('.live-order-card')).toHaveCount(12);
  await expect(page.locator('.live-order-card').first()).toContainText(api.orders[0]!.id);
});

test('checkpoint não recuperado antes do envio permite revisão explícita sem encomenda enviada', async ({
  page,
}) => {
  const { api } = await setup(page);
  api.recoverStatus = 404;
  await fields(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rever condições', exact: true })).toBeVisible();
  expect(orders(api)).toHaveLength(0);
});
test('404 depois do envio mantém resultado desconhecido sem autorizar outra chave', async ({
  page,
}) => {
  const { api } = await setup(page);
  api.recoverStatus = 503;
  await fields(page);
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Recuperar resultado da compra', exact: true }),
  ).toBeVisible();
  expect(orders(api)).toHaveLength(0);
  api.recoverStatus = 200;
  api.postStatus = 404;
  await page.getByRole('button', { name: 'Recuperar resultado da compra', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Recuperar resultado da compra', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rever condições', exact: true })).toHaveCount(0);
  expect(orders(api)).toHaveLength(1);
});
