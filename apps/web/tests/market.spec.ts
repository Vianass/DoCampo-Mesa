import { expect, test } from '@playwright/test';

for (const viewport of [
  { name: 'telemóvel pequeno', width: 320, height: 740 },
  { name: 'telemóvel grande', width: 430, height: 932 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1024, height: 800 },
  { name: 'breakpoint largo', width: 1280, height: 900 },
  { name: 'desktop grande', width: 1440, height: 1000 },
]) {
  test(`homepage sem overflow e fotografias carregadas: ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('O melhor da nossa terra');
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
    await page.locator('footer').scrollIntoViewIfNeeded();
    await page.locator('h1').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect
      .poll(() =>
        page
          .locator('img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    expect(errors).toEqual([]);
  });
}

test('menu móvel: teclado, Escape, foco e navegação', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Abrir menu' });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Navegação móvel' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await page
    .getByRole('navigation', { name: 'Navegação móvel' })
    .getByRole('link', { name: /Produtores/ })
    .click();
  await expect(page).toHaveURL(/\/produtores$/);
  await expect(page.getByRole('navigation', { name: 'Navegação móvel' })).toBeHidden();
  await expect(page.locator('main')).toBeFocused();
});

test('destinos dos cartões e limites de contas/leilões', async ({ page }) => {
  await page.goto('/produtos/tomate-coracao');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tomate coração-de-boi' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Horta da Ribeira', exact: true }).click();
  await expect(page).toHaveURL(/\/produtores\/horta-ribeira$/);
  await page.goto('/leiloes/cabaz-outono');
  await expect(page.getByRole('button', { name: 'Licitações ainda indisponíveis' })).toBeDisabled();
  await page.goto('/registo');
  await expect(
    page.getByRole('heading', { name: 'O registo chega numa próxima etapa.' }),
  ).toBeVisible();
  await expect(page.locator('input')).toHaveCount(0);
  await page.goto('/sistema-visual');
  await expect(page.getByLabel('Nome')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
  await page.goto('/pagina-inexistente');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Esta página não está no mercado.' }),
  ).toBeVisible();
});

test('ligação de salto acessível e movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Saltar para o conteúdo' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe(
    'auto',
  );
});
