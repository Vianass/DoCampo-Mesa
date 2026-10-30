import { expect, test } from './support/test';

test('produto: dados corretos, stock, época, descrição, origem e sem erros', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/produtos/ee685adf80156cb9e1e85c27');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tomate coração-de-boi');
  const copy = page.locator('.product-editorial__copy');
  await expect(copy).toContainText('Hortícolas');
  await expect(copy.locator('.price-display')).toContainText('2,80');
  await expect(copy.locator('.price-display__unit')).toContainText('unidade');
  expect(
    await copy
      .locator('.price-display')
      .evaluate((price) => parseFloat(getComputedStyle(price).fontSize)),
  ).toBeGreaterThanOrEqual(32);
  await expect(copy).toContainText('Disponível · 18 unidades em stock');
  await expect(copy).toContainText('Biológico · declarado');
  await expect(copy).toContainText('Verão · Outono');
  await expect(copy).toContainText('Ponte de Lima');
  await expect(page.locator('.product-story')).toContainText(
    'Condições comerciais não disponibilizadas pelo produtor.',
  );
  await expect(page.locator('.product-origin-card a')).toHaveAttribute(
    'href',
    '/produtores/fdbe9e7dd68e7983981d7b7e',
  );
  expect(errors).toEqual([]);
});

test('galeria alterna fotografias distintas através das miniaturas', async ({ page }) => {
  await page.goto('/produtos/ee685adf80156cb9e1e85c27');
  const main = page.locator('.product-gallery__main img');
  await expect(main).toHaveAttribute('src', 'http://127.0.0.1:5173/images/tomatoes.webp');
  const second = page.getByRole('button', { name: 'Ver fotografia 2 de Tomate coração-de-boi' });
  await second.click();
  await expect(main).toHaveAttribute('src', 'http://127.0.0.1:5173/images/details/tomatoes.webp');
  await expect(main).toHaveAttribute('alt', /Tomate vermelho maduro na planta/);
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status', { name: 'Fotografia selecionada' })).toHaveText(
    'Fotografia 2 de 2',
  );
  expect(await main.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(
    0,
  );
});

test('galeria funciona por teclado com setas, Home, End e foco visível', async ({ page }) => {
  await page.goto('/produtos/aa6b68cc89c59bc055a5699b');
  const first = page.getByRole('button', { name: 'Ver fotografia 1 de Pera Rocha' });
  const second = page.getByRole('button', { name: 'Ver fotografia 2 de Pera Rocha' });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
  await page.keyboard.press('End');
  await expect(second).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(first).toBeFocused();
  await expect(page.locator('.product-gallery__main img')).toHaveAttribute(
    'src',
    'http://127.0.0.1:5173/images/pears.webp',
  );
  expect(await first.evaluate((button) => getComputedStyle(button).outlineStyle)).not.toBe('none');
});

test('produto com uma fotografia adapta a galeria sem miniaturas fictícias', async ({ page }) => {
  await page.goto('/produtos/fb25216f7b68e491b606c3d9');
  await expect(page.getByRole('status', { name: 'Fotografia selecionada' })).toHaveText(
    'Fotografia 1 de 1',
  );
  await expect(page.getByRole('group', { name: 'Escolher fotografia' })).toHaveCount(0);
});

test('galeria recupera uma imagem falhada e mantém a segunda imagem utilizável', async ({
  page,
}) => {
  await page.route('**/images/tomatoes.webp', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/produtos/ee685adf80156cb9e1e85c27');
  const main = page.locator('.product-gallery__main img');
  await expect(main).toHaveAttribute('src', '/images/product-placeholder.svg');
  await expect(main).toHaveAttribute('alt', /Imagem indisponível/);
  await page.getByRole('button', { name: 'Ver fotografia 2 de Tomate coração-de-boi' }).click();
  await expect(main).toHaveAttribute('src', 'http://127.0.0.1:5173/images/details/tomatoes.webp');
});

test('stock esgotado e produto sem fotografia têm apresentação explícita', async ({ page }) => {
  await page.goto('/produtos/9dfe428b21396e20aa369ab7');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brócolos');
  await expect(page.locator('.product-detail-stock')).toHaveText('Esgotado');
  await expect(page.locator('.product-gallery__main img')).toHaveAttribute(
    'src',
    'http://127.0.0.1:5173/images/product-placeholder.svg',
  );
  await expect(page.locator('.product-gallery__main img')).toHaveAttribute('alt', /Brócolos/);
});

test('produto inexistente apresenta recuperação específica', async ({ page }) => {
  await page.goto('/produtos/inexistente');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Este produto não está no mercado.',
  );
  await page.getByRole('link', { name: 'Explorar produtos', exact: true }).click();
  await expect(page).toHaveURL(/\/produtos$/);
});

test('perfil público preserva apresentação sem inventar história ou certificação', async ({
  page,
}) => {
  await page.goto('/produtores/fdbe9e7dd68e7983981d7b7e');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Horta da Ribeira');
  await expect(page.getByRole('heading', { name: 'Conhecer a origem.' })).toBeVisible();
  await expect(page.locator('.producer-profile-cover img')).toBeVisible();
  await expect(page.locator('.producer-profile-portrait')).toBeVisible();
  await expect(page.locator('.producer-methods__grid article,.producer-certification')).toHaveCount(
    0,
  );
  await expect(page.locator('.producer-profile-header')).toContainText('Ponte de Lima');
  await expect(page.locator('.profile-demo-note')).toContainText('não são disponibilizados');
});

test('perfil pagina exclusivamente produtos publicados da mesma origem', async ({ page }) => {
  await page.goto('/produtores/fdbe9e7dd68e7983981d7b7e');
  const cards = page.locator('.producer-selection .product-card');
  await expect(cards).toHaveCount(12);
  await expect(page.locator('.producer-selection')).toContainText(
    '13 produtos publicados · 12 nesta página.',
  );
  for (const card of await cards.all()) await expect(card).toContainText('Horta da Ribeira');
  await page.getByRole('button', { name: 'Página seguinte' }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.locator('.producer-selection')).toContainText(
    '13 produtos publicados · 1 nesta página.',
  );
});

test('produtor inexistente apresenta recuperação específica', async ({ page }) => {
  await page.goto('/produtores/inexistente');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Este produtor não está no mercado.',
  );
  await page.getByRole('link', { name: 'Conhecer produtores', exact: true }).click();
  await expect(page).toHaveURL(/\/produtores$/);
});

test('navegação produto → produtor → produto e breadcrumbs', async ({ page }) => {
  await page.goto('/produtos/ee685adf80156cb9e1e85c27');
  await page
    .locator('.product-origin-card')
    .getByRole('link', { name: 'Horta da Ribeira', exact: true })
    .click();
  await expect(page).toHaveURL(/\/produtores\/fdbe9e7dd68e7983981d7b7e$/);
  await page.getByRole('button', { name: 'Página seguinte' }).click();
  await page
    .locator('.producer-selection')
    .getByRole('link', { name: 'Tomate coração-de-boi', exact: true })
    .click();
  await expect(page).toHaveURL(/\/produtos\/ee685adf80156cb9e1e85c27$/);
  const breadcrumbs = page.getByRole('navigation', { name: 'Percurso de navegação' });
  await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText('Tomate coração-de-boi');
  await breadcrumbs.getByRole('link', { name: 'Produtos', exact: true }).click();
  await expect(page).toHaveURL(/\/produtos$/);
});

test('os nomes dos produtores nos cartões são ligações independentes sem anchors aninhados', async ({
  page,
}) => {
  await page.goto('/produtos?pesquisa=Kiwi');
  const card = page.locator('.product-card');
  await expect(card.locator('a a')).toHaveCount(0);
  await card.getByRole('link', { name: 'Pomar do Vale', exact: true }).click();
  await expect(page).toHaveURL(/\/produtores\/1e65f31692c88a4dac46bf37$/);
});

test('produtos relacionados usam categoria do servidor, excluem o atual e mantêm ordem', async ({
  page,
}) => {
  await page.goto('/produtos/ee685adf80156cb9e1e85c27');
  const section = page.getByRole('region', { name: 'Outros sabores para descobrir.' });
  await expect(section.locator('.product-card')).toHaveCount(4);
  await expect(
    section.getByRole('link', { name: 'Tomate coração-de-boi', exact: true }),
  ).toHaveCount(0);
  const names = await section.locator('h3').allTextContents();
  await page.reload();
  await expect(section.locator('h3')).toHaveText(names);
  await section.locator('.product-card__link').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(names[0]!);
});

test('perfil real não associa avaliações demonstrativas ou pontuações', async ({ page }) => {
  await page.goto('/produtores/fdbe9e7dd68e7983981d7b7e');
  await expect(
    page.getByRole('heading', { name: 'Ainda sem palavras à mesa.', exact: true }),
  ).toHaveCount(2);
  await expect(
    page.locator('.producer-rating-link,.producer-reviews-summary,.review-card'),
  ).toHaveCount(0);
  await expect(page.locator('#producer-reviews .reviews-summary')).toHaveText([
    /Sem classificação · 0 avaliações publicadas/,
    /Sem classificação · 0 avaliações publicadas/,
  ]);
  await expect(page.locator('form')).toHaveCount(0);
});

test('perfil sem avaliações ou certificação mostra ausência sem criar classificações', async ({
  page,
}) => {
  await page.goto('/produtores/fdbe9e7dd68e7983981d7b7e');
  await expect(
    page.getByRole('heading', { name: 'Ainda sem palavras à mesa.', exact: true }),
  ).toHaveCount(2);
  await expect(
    page.locator('.producer-reviews-summary,.review-card,.producer-certification'),
  ).toHaveCount(0);
});

test('localização sem coordenadas ou contactos não inventa mapa ou dados', async ({ page }) => {
  await page.goto('/produtores/fdbe9e7dd68e7983981d7b7e');
  await expect(page.locator('.producer-place')).toContainText(
    'Não existem coordenadas ou contactos públicos',
  );
  await expect(page.locator('.producer-map,iframe')).toHaveCount(0);
  await expect(page.locator('.producer-place a[href*="openstreetmap"]')).toHaveCount(0);
});

test('diretório mostra perfis públicos e descrições sem inferir categorias de páginas parciais', async ({
  page,
}) => {
  await page.goto('/produtores');
  await expect(page.locator('.producer-directory .producer-card')).toHaveCount(7);
  const first = page.locator('.producer-card').first();
  await expect(first.getByRole('heading', { name: 'Horta da Ribeira' })).toBeVisible();
  await expect(first).toContainText('Ponte de Lima');
  await expect(first.locator('.producer-card__editorial')).toContainText('Uma pequena horta');
  await expect(first.getByRole('list')).toBeEmpty();
  await first.locator('a').click();
  await expect(page).toHaveURL('/produtores/fdbe9e7dd68e7983981d7b7e');
});

test('categoria do perfil abre o catálogo com produtor e categoria combinados', async ({
  page,
}) => {
  await page.goto('/produtores/fdbe9e7dd68e7983981d7b7e');
  await page
    .getByRole('list', { name: 'Categorias nesta página de produtos' })
    .getByRole('link', { name: 'Ervas e aromáticas' })
    .click();
  await expect(page.getByRole('status', { name: 'Resultados do catálogo' })).toHaveText(
    '2 produtos encontrados',
  );
  await expect(page.locator('.product-card h3')).toHaveText(['Alecrim', 'Coentros']);
});

test('browser voltar/avançar preserva filtros e destinos; galeria reinicia entre produtos', async ({
  page,
}) => {
  await page.goto('/produtos?categoria=cat-002&produtor=1e65f31692c88a4dac46bf37&ordem=preco-desc');
  await page.getByRole('link', { name: 'Pera Rocha', exact: true }).click();
  await page.getByRole('button', { name: 'Ver fotografia 2 de Pera Rocha' }).click();
  await page.locator('.product-origin-card a').click();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pera Rocha');
  await page.goBack();
  await expect(
    page.locator('.catalog-sidebar').getByLabel('Categoria', { exact: true }),
  ).toHaveValue('cat-002');
  await expect(page.getByLabel('Ordenar por')).toHaveValue('preco-desc');
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pera Rocha');
  await page.locator('.product-origin-card a').click();
  await page
    .locator('.producer-selection')
    .getByRole('link', { name: 'Kiwi Hayward', exact: true })
    .click();
  await expect(page.getByRole('status', { name: 'Fotografia selecionada' })).toHaveText(
    'Fotografia 1 de 1',
  );
});

for (const kind of ['Product', 'Producer'] as const) {
  test(`loading real da página ${kind} mostra skeleton enquanto o módulo chega`, async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/src/pages/${kind}DetailPage.tsx*`, async (route) => {
      await gate;
      await route.continue();
    });
    try {
      await page.goto(
        kind === 'Product'
          ? '/produtos/ee685adf80156cb9e1e85c27'
          : '/produtores/fdbe9e7dd68e7983981d7b7e',
        { waitUntil: 'domcontentloaded' },
      );
      await expect(
        page.getByRole('status', {
          name: kind === 'Product' ? 'A carregar o produto' : 'A carregar o produtor',
        }),
      ).toBeVisible();
    } finally {
      release();
    }
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
}

for (const width of [320, 430, 768, 1024, 1280, 1440]) {
  for (const kind of ['produto', 'produtor'] as const) {
    test(`${kind} sem overflow, imagens válidas e uma h1 a ${width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        kind === 'produto'
          ? '/produtos/ee685adf80156cb9e1e85c27'
          : '/produtores/fdbe9e7dd68e7983981d7b7e',
      );
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      for (const image of await page.locator('img').all()) {
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
      const size = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(size.scroll).toBeLessThanOrEqual(size.client);
      expect(errors).toEqual([]);
    });
  }
}
