import { expect, test } from './support/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/produtos');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Da nossa terra,');
});

test('catálogo: 36 produtos, cartões completos e sem erros no browser', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '36 produtos encontrados',
  );
  await expect(page.locator('.catalog-results-panel .product-card')).toHaveCount(12);
  await page.getByLabel('Pesquisar produtos ou produtores').fill('Tomate');
  const card = page
    .locator('.product-card')
    .filter({ has: page.getByRole('heading', { name: 'Tomate coração-de-boi', exact: true }) });
  await expect(card).toContainText('Horta da Ribeira');
  await expect(card).toContainText('Ponte de Lima');
  await expect(card).toContainText('Biológico');
  await expect(card).toContainText('18 unidades em stock');
  for (const image of await page.locator('.product-card img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(
          (node) =>
            (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
  expect(errors).toEqual([]);
});

test('pesquisa imediata pelo nome do produto e ação de limpar', async ({ page }) => {
  await page.getByLabel('Pesquisar produtos ou produtores').fill('Kiwi Hayward');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '1 produto encontrado',
  );
  await expect(page.getByRole('heading', { name: 'Kiwi Hayward', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar pesquisa', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '36 produtos encontrados',
  );
});

test('pesquisa pelo produtor fictício', async ({ page }) => {
  await page.getByLabel('Pesquisar produtos ou produtores').fill('Forno da Aldeia');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '3 produtos encontrados',
  );
  await expect(page.getByRole('heading', { name: 'Pão de milho', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pão de centeio', exact: true })).toBeVisible();
});

test('pesquisa sem acentos e sem diferença entre maiúsculas/minúsculas', async ({ page }) => {
  await page.getByLabel('Pesquisar produtos ou produtores').fill('MACA');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '2 produtos encontrados',
  );
  await expect(
    page.getByRole('heading', { name: 'Maçã Bravo de Esmolfe', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maçã reineta', exact: true })).toBeVisible();
  const search = page.getByLabel('Pesquisar produtos ou produtores');
  await search.fill('');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '36 produtos encontrados',
  );
  await search.pressSequentially('Maçã Bravo de Esmolfe');
  await expect(search).toHaveValue('Maçã Bravo de Esmolfe');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '1 produto encontrado',
  );
});

test('pesquisa no texto da descrição', async ({ page }) => {
  await page.getByLabel('Pesquisar produtos ou produtores').fill('reconfortante');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '1 produto encontrado',
  );
  await expect(page.getByRole('heading', { name: 'Abóbora-menina', exact: true })).toBeVisible();
});

test('filtro por categoria derivada do dataset', async ({ page }) => {
  await page
    .locator('.catalog-sidebar')
    .getByLabel('Categoria', { exact: true })
    .selectOption('cat-004');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '3 produtos encontrados',
  );
  await expect(page.getByRole('heading', { name: 'Farinha de milho', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Filtros ativos' })).toContainText('Pão e padaria');
});

test('filtros combinados: categoria, produtor, localidade, época e biológico', async ({ page }) => {
  const filters = page.locator('.catalog-sidebar');
  await filters.getByLabel('Categoria', { exact: true }).selectOption('cat-001');
  await filters.getByLabel('Produtor', { exact: true }).selectOption('fdbe9e7dd68e7983981d7b7e');
  await filters.getByLabel('Localidade', { exact: true }).fill('Ponte de Lima');
  await filters.getByLabel('Época', { exact: true }).selectOption('Outono');
  const organic = filters.getByLabel('Só produção biológica', { exact: false });
  await organic.click();
  await expect(organic).toBeChecked();
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '8 produtos encontrados',
  );
  await expect(page.locator('.product-card')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Remover filtro: Biológico' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Courgette', exact: true })).toHaveCount(0);
});

test('preço máximo combinado com categoria e ausência de preços acima do limite', async ({
  page,
}) => {
  await page
    .locator('.catalog-sidebar')
    .getByLabel('Categoria', { exact: true })
    .selectOption('cat-001');
  const slider = page.locator('.catalog-sidebar').getByLabel('Preço máximo', { exact: true });
  await slider.fill('200');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '8 produtos encontrados',
  );
  const prices = await page
    .locator('.product-card .price-display > span:first-child')
    .allTextContents();
  expect(prices.every((price) => Number(price.replace(/[^\d,]/g, '').replace(',', '.')) <= 2)).toBe(
    true,
  );
  await expect(page.getByRole('button', { name: /Remover filtro: Até 2,00/ })).toBeVisible();
});

test('ordenação por preço ascendente', async ({ page }) => {
  await page.getByLabel('Ordenar por').selectOption('preco-asc');
  await expect(page.locator('.product-card h3').first()).toHaveText('Coentros');
  const prices = await page
    .locator('.product-card .price-display > span:first-child')
    .allTextContents();
  const values = prices.map((price) => Number(price.replace(/[^\d,]/g, '').replace(',', '.')));
  expect(values).toEqual([...values].sort((a, b) => a - b));
});

test('ordenação por preço descendente', async ({ page }) => {
  await page.getByLabel('Ordenar por').selectOption('preco-desc');
  await expect(page.locator('.product-card h3').first()).toHaveText('Azeite virgem extra');
  const prices = await page
    .locator('.product-card .price-display > span:first-child')
    .allTextContents();
  const values = prices.map((price) => Number(price.replace(/[^\d,]/g, '').replace(',', '.')));
  expect(values).toEqual([...values].sort((a, b) => b - a));
});

test('ordenação A–Z, Z–A e por data recente', async ({ page }) => {
  await page.getByLabel('Ordenar por').selectOption('nome-asc');
  await expect(page.locator('.product-card h3').first()).toHaveText('Abóbora-menina');
  await page.getByLabel('Ordenar por').selectOption('nome-desc');
  await expect(page.locator('.product-card h3').first()).toHaveText('Uva branca');
  await page.getByLabel('Ordenar por').selectOption('recentes');
  await expect(page.locator('.product-card h3').first()).toHaveText('Alecrim');
});

test('remover um filtro individual e limpar todos os filtros', async ({ page }) => {
  const filters = page.locator('.catalog-sidebar');
  await filters.getByLabel('Categoria', { exact: true }).selectOption('cat-002');
  await filters.getByLabel('Produtor', { exact: true }).selectOption('14c8208faae2c2d4bf32e15e');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '4 produtos encontrados',
  );
  await page.getByRole('button', { name: 'Remover filtro: Pomar do Sul' }).click();
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '9 produtos encontrados',
  );
  await page.getByRole('button', { name: 'Limpar tudo', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '36 produtos encontrados',
  );
  await expect(page.getByRole('group', { name: 'Filtros ativos' })).toHaveCount(0);
});

test('estado vazio permite recuperar o catálogo completo', async ({ page }) => {
  await page.getByLabel('Pesquisar produtos ou produtores').fill('produto-inexistente');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '0 produtos encontrados',
  );
  await expect(
    page.getByRole('heading', { name: 'Ainda não encontrámos esse sabor.' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Paginação do catálogo' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver todos os produtos' }).click();
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '36 produtos encontrados',
  );
});

test('paginação: anterior/seguinte, indicador, total e tamanho configurável', async ({ page }) => {
  const cards = page.locator('.product-card');
  const firstPageIds = await cards
    .locator('a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  const pagination = page.getByRole('navigation', { name: 'Paginação do catálogo' });
  await expect(page.getByText('Página 1 de 3', { exact: true })).toBeVisible();
  await expect(pagination.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
  await pagination.getByRole('button', { name: 'Página seguinte' }).click();
  await expect(page.getByText('Página 2 de 3', { exact: true })).toBeVisible();
  expect(
    await cards.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
  ).not.toEqual(firstPageIds);
  await pagination.getByRole('button', { name: 'Página 3', exact: true }).click();
  await expect(pagination.getByRole('button', { name: 'Página seguinte' })).toBeDisabled();
  await page.getByLabel('Produtos por página').selectOption('24');
  await expect(cards).toHaveCount(24);
  await expect(page.getByText('Página 1 de 2', { exact: true })).toBeVisible();
  await page.getByLabel('Produtos por página').selectOption('36');
  await expect(cards).toHaveCount(36);
  await expect(page.getByText('Página 1 de 1', { exact: true })).toBeVisible();
});

test('pesquisa, filtros e ordenação repõem a primeira página', async ({ page }) => {
  await page.getByRole('button', { name: 'Página 3', exact: true }).click();
  await page.getByLabel('Ordenar por').selectOption('nome-asc');
  await expect(page.getByText('Página 1 de 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Página 2', exact: true }).click();
  await page
    .locator('.catalog-sidebar')
    .getByLabel('Categoria', { exact: true })
    .selectOption('cat-002');
  await expect(page.getByText('Página 1 de 1', { exact: true })).toBeVisible();
  await page.getByLabel('Pesquisar produtos ou produtores').fill('maca');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '2 produtos encontrados',
  );
});

test('URL: voltar/avançar e recarregar recuperam filtros e controlos', async ({ page }) => {
  const category = page.locator('.catalog-sidebar').getByLabel('Categoria', { exact: true });
  const producer = page.locator('.catalog-sidebar').getByLabel('Produtor', { exact: true });
  await category.selectOption('cat-002');
  await producer.selectOption('14c8208faae2c2d4bf32e15e');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '4 produtos encontrados',
  );
  await page.goBack();
  await expect(category).toHaveValue('cat-002');
  await expect(producer).toHaveValue('');
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '9 produtos encontrados',
  );
  await page.goForward();
  await expect(producer).toHaveValue('14c8208faae2c2d4bf32e15e');
  await page.reload();
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '4 produtos encontrados',
  );
});

test('painel móvel: filtros combinados, foco, Escape e aplicação', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const open = page.getByRole('button', { name: 'Filtrar', exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Filtros do catálogo' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Categoria', { exact: true }).selectOption('cat-002');
  await dialog.getByLabel('Produtor', { exact: true }).selectOption('14c8208faae2c2d4bf32e15e');
  await dialog.getByRole('button', { name: 'Ver 4 produtos', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Os sabores do mercado.' })).toBeFocused();
  await expect(page.locator('.product-card')).toHaveCount(4);
  await page.getByRole('button', { name: /^Filtrar/ }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Filtrar/ })).toBeFocused();
});

test('o detalhe de produto e browser Back preservam a seleção', async ({ page }) => {
  await page.getByLabel('Pesquisar produtos ou produtores').fill('Kiwi');
  await page.locator('.product-card__link').click();
  await expect(page).toHaveURL(/\/produtos\/fb25216f7b68e491b606c3d9$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kiwi Hayward' })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Pesquisar produtos ou produtores')).toHaveValue('Kiwi');
  await expect(page.locator('.product-card')).toHaveCount(1);
});

test('carregamento: skeleton durante a importação da página, sem atraso artificial', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/src/pages/ProductsPage.tsx*', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/produtos', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('status', { name: 'A carregar o catálogo' })).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '36 produtos encontrados',
  );
});

for (const width of [320, 430, 768, 1024, 1280, 1440]) {
  test(`catálogo sem overflow e filtros adequados a ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const dimensions = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    if (width < 1024) {
      await expect(page.getByRole('button', { name: 'Filtrar', exact: true })).toBeVisible();
      await expect(page.locator('.catalog-sidebar')).toBeHidden();
    } else {
      await expect(page.locator('.catalog-sidebar')).toBeVisible();
    }
  });
}
