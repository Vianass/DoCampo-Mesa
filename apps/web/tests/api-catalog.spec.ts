import { expect, test } from './support/test';
import { productDtos, productFixture, fixtureId, envelope } from './support/catalog-fixtures';
const productsRoute = (url: URL) => url.pathname === '/api/products';
const total = (page: import('@playwright/test').Page) =>
  page.getByRole('status', { name: 'Resultados do catálogo' });
for (const failure of ['network', 'http', 'html', 'json', 'shape'] as const)
  test(`API ${failure}: mostra erro recuperável, sem tratar como vazio`, async ({ page }) => {
    await page.route(productsRoute, (route) =>
      failure === 'network'
        ? route.abort()
        : route.fulfill({
            status: failure === 'http' ? 503 : 200,
            contentType: failure === 'html' ? 'text/html' : 'application/json',
            body:
              failure === 'html'
                ? '<html>oops</html>'
                : failure === 'json'
                  ? '{broken'
                  : failure === 'shape'
                    ? JSON.stringify({ itens: [] })
                    : JSON.stringify({ erro: { mensagem: 'detalhe interno nunca apresentado' } }),
          }),
    );
    await page.goto('/produtos');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Ainda não encontrámos esse sabor.' }),
    ).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('detalhe interno');
    await page.unroute(productsRoute);
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(total(page)).toHaveText('36 produtos encontrados');
  });
test('filtros e paginação são pedidos ao servidor com IDs e total globais', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/products')) requests.push(r.url());
  });
  await page.goto(
    '/produtos?categoria=cat-001&produtor=' +
      fixtureId('producer', 'horta-ribeira') +
      '&porPagina=24&ordem=preco-desc',
  );
  await expect(page.locator('.product-card')).toHaveCount(11);
  expect(
    requests.some(
      (r) =>
        new URL(r).searchParams.get('categoria') === 'cat-001' &&
        new URL(r).searchParams.get('porPagina') === '24',
    ),
  ).toBe(true);
  await expect(
    page.locator('.catalog-sidebar').getByLabel('Categoria', { exact: true }),
  ).toHaveValue('cat-001');
});
test('resposta atrasada de pesquisa antiga não substitui a pesquisa nova', async ({ page }) => {
  await page.route(productsRoute, async (route) => {
    const p = new URL(route.request().url()).searchParams;
    const term = p.get('pesquisa');
    if (term === 'tomate') {
      await new Promise((r) => setTimeout(r, 700));
      await route.fulfill({ json: envelope([productFixture('tomate-coracao')], p) });
    } else if (term === 'kiwi') {
      await route.fulfill({ json: envelope([productFixture('kiwi-hayward')], p) });
    } else await route.fallback();
  });
  await page.goto('/produtos');
  await expect(total(page)).toHaveText('36 produtos encontrados');
  const search = page.getByLabel('Pesquisar produtos ou produtores');
  await search.fill('tomate');
  await page.waitForRequest((r) => new URL(r.url()).searchParams.get('pesquisa') === 'tomate');
  await search.fill('kiwi');
  await expect(page.locator('.product-card h3')).toHaveText('Kiwi Hayward');
  await page.waitForTimeout(850);
  await expect(page.locator('.product-card h3')).toHaveText('Kiwi Hayward');
  await expect(search).toHaveValue('kiwi');
});
test('loading depende do pedido HTTP e mantém a estrutura dos filtros', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route(productsRoute, async (route) => {
    await gate;
    await route.fallback();
  });
  try {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('/produtos');
    await expect(page.getByRole('status', { name: 'A carregar o catálogo' })).toBeVisible();
    await expect(page.getByLabel('Ordenar por')).toBeVisible();
    await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Ver resultados', exact: true }),
    ).toBeVisible();
  } finally {
    release();
  }
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Ver 36 produtos', exact: true })
    .click();
  await expect(total(page)).toHaveText('36 produtos encontrados');
});
test('página fora de limites conserva o total e permite recuperar a primeira página', async ({
  page,
}) => {
  await page.goto('/produtos?pagina=99');
  await expect(total(page)).toHaveText('36 produtos encontrados');
  await expect(page.locator('.product-card')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Esta página não tem produtos.' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver todos os produtos' }).click();
  await expect(page.locator('.product-card')).toHaveCount(12);
});
test('modo de produção e localidade usam texto explícito no servidor', async ({ page }) => {
  await page.goto('/produtos');
  await expect(total(page)).toHaveText('36 produtos encontrados');
  await page
    .locator('.catalog-sidebar')
    .getByLabel('Modo de produção', { exact: true })
    .fill('Biológico');
  await expect(page).toHaveURL(/modoProducao=Biol/);
  await expect(total(page)).not.toHaveText('36 produtos encontrados');
});
test('carrinho real por peso conserva g e calcula cêntimos sem checkout', async ({ page }) => {
  const dto = structuredClone(productDtos[0]!);
  dto.precoCent = 199;
  dto.stockDisponivel = 5000;
  dto.unidadeVenda = {
    modalidade: 'peso',
    unidadeBase: 'g',
    quantidadeReferencia: 1000,
    quantidadeMinima: 250,
    incrementoCompra: 50,
  };
  await page.route('**/api/products/' + dto.id, (route) => route.fulfill({ json: dto }));
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') writes.push(r.method() + ' ' + r.url());
  });
  await page.goto('/produtos/' + dto.id);
  await expect(page.getByLabel('Quantidade a adicionar')).toHaveValue('250');
  await page.getByRole('button', { name: 'Adicionar ' + dto.nome + ' ao carrinho' }).click();
  await page.locator('.header-cart').click();
  await expect(page.locator('.cart-line')).toHaveCount(1);
  await expect(page.getByLabel('Quantidade de ' + dto.nome, { exact: true })).toHaveValue('250');
  await expect(page.locator('.cart-line__subtotal')).toContainText('0,50');
  await page.reload();
  await expect(page.getByLabel('Quantidade de ' + dto.nome, { exact: true })).toHaveValue('250');
  await expect(page.locator('.cart-line__subtotal')).toContainText('0,50');
  await page.getByRole('button', { name: 'Aumentar quantidade de ' + dto.nome }).click();
  await expect(page.getByLabel('Quantidade de ' + dto.nome, { exact: true })).toHaveValue('300');
  await expect(page.locator('.cart-line__subtotal')).toContainText('0,60');
  expect(writes).toEqual([]);
});
test('erro da API ao recuperar cesta não elimina escolhas guardadas', async ({ page }) => {
  const dto = productDtos[0]!;
  await page.goto('/produtos/' + dto.id);
  await page.getByRole('button', { name: 'Adicionar ' + dto.nome + ' ao carrinho' }).click();
  await page.route('**/api/products/' + dto.id, (route) => route.abort());
  await page.goto('/carrinho');
  await expect(page.locator('.cart-line h3')).toHaveText(dto.nome);
  await expect(page.getByRole('alert')).toContainText('preservadas');
});
