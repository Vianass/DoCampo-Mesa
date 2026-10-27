import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
const id = (kind: string, slug: string) =>
  createHash('sha256')
    .update('docampo-local-catalog-v1:' + kind + ':' + slug)
    .digest('hex')
    .slice(0, 24);
const tomato = id('product', 'tomate-coracao'),
  horta = id('producer', 'horta-ribeira');
test('React → API HTTP → MongoDB real: catálogo, pesquisa, filtros, paginação e navegação', async ({
  page,
  request,
}) => {
  const response = await request.get('http://127.0.0.1:3011/api/products');
  expect(response.status()).toBe(200);
  const dto = await response.json();
  expect(dto.total).toBe(36);
  expect(dto.itens[0].id).toMatch(/^[a-f0-9]{24}$/);
  await page.goto('/produtos');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '36 produtos encontrados',
  );
  await expect(page.locator('.product-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Página seguinte' }).click();
  await expect(page.getByText('Página 2 de 3', { exact: true })).toBeVisible();
  await page.getByLabel('Produtos por página').selectOption('24');
  await expect(page.locator('.product-card')).toHaveCount(24);
  await page.getByLabel('Pesquisar produtos ou produtores').fill('Tomate coração-de-boi');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.locator('.product-card__link').click();
  await expect(page).toHaveURL('/produtos/' + tomato);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tomate coração-de-boi');
  await expect(page.locator('.product-editorial__price')).toContainText('2,80');
  await expect(page.locator('.product-editorial__price')).toContainText('kg');
  await expect(page.locator('.product-detail-stock')).toContainText('18 000 g');
  await page.locator('.product-origin-card a').click();
  await expect(page).toHaveURL('/produtores/' + horta);
  await expect(page.locator('.producer-selection')).toContainText('13 produtos publicados');
  await expect(page.locator('.producer-selection .product-card')).toHaveCount(12);
  await expect(page.locator('.review-card,.producer-map,.producer-certification')).toHaveCount(0);
  await page.getByRole('link', { name: 'Ver no catálogo' }).click();
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '13 produtos encontrados',
  );
  await page
    .locator('.catalog-sidebar')
    .getByLabel('Categoria', { exact: true })
    .selectOption('cat-010');
  await expect(page.locator('.product-card')).toHaveCount(2);
});
test('cesta local com MongoDB real: mínimo 250 g, half-up, reload e nenhuma compra', async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/') && r.method() !== 'GET') mutations.push(r.method());
  });
  await page.goto('/produtos/' + tomato);
  await expect(page.getByLabel('Quantidade a adicionar')).toHaveValue('250');
  await page.getByRole('button', { name: 'Adicionar Tomate coração-de-boi ao carrinho' }).click();
  await page.locator('.header-cart').click();
  await expect(page.getByLabel('Quantidade de Tomate coração-de-boi', { exact: true })).toHaveValue(
    '250',
  );
  await expect(page.locator('.cart-line__subtotal')).toContainText('0,70');
  await page.reload();
  await expect(page.locator('.cart-line__subtotal')).toContainText('0,70');
  await page.getByRole('button', { name: 'Aumentar quantidade de Tomate coração-de-boi' }).click();
  await expect(page.getByLabel('Quantidade de Tomate coração-de-boi', { exact: true })).toHaveValue(
    '300',
  );
  await expect(page.locator('.cart-line__subtotal')).toContainText('0,84');
  expect(mutations).toEqual([]);
});
test('diretório real pesquisável e identificadores ausentes sem fallback demonstrativo', async ({
  page,
}) => {
  await page.goto('/produtores');
  await expect(page.locator('.producer-card')).toHaveCount(7);
  await page.getByLabel('Pesquisar produtores').fill('Horta');
  await expect(page.locator('.producer-card')).toHaveCount(1);
  await page.goto('/produtos/000000000000000000000000');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Este produto não está no mercado.',
  );
  await page.goto('/produtores/000000000000000000000000');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Este produtor não está no mercado.',
  );
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(`catálogo, detalhe, perfil e cesta reais sem overflow a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/produtos', '/produtos/' + tomato, '/produtores/' + horta, '/carrinho']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      if (route === '/produtos') await expect(page.locator('.product-card')).toHaveCount(12);
      if (route === '/carrinho')
        await expect(
          page.getByLabel('Quantidade de Tomate coração-de-boi', { exact: true }),
        ).toHaveValue('250');
      if (route === '/produtos/' + tomato)
        await page
          .getByRole('button', { name: 'Adicionar Tomate coração-de-boi ao carrinho', exact: true })
          .click();
      await page.evaluate(() => document.fonts.ready);
      if ([320, 768, 1440].includes(width) && route !== '/carrinho')
        await page.screenshot({
          path:
            '/private/tmp/docampo-phase5b-' +
            width +
            '-' +
            (route === '/produtos'
              ? 'catalog'
              : route.startsWith('/produtos/')
                ? 'product'
                : 'producer') +
            '.png',
        });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    }
  });
