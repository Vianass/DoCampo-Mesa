import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const api = 'http://127.0.0.1:3011';
const widths = [320, 430, 768, 1024, 1280, 1440];
const evidence =
  process.env.DOCAMPO_PHASE12_EVIDENCE_DIR ?? join(tmpdir(), 'docampo-phase12-visual');
test('Swagger real: registo, JWT em Authorize e Try it out autenticado, sem persistência nem pedidos externos', async ({
  page,
  request,
}) => {
  const user = {
    nome: 'Pessoa fictícia Swagger',
    email: 'swagger-' + randomUUID() + '@example.invalid',
    password: 'Frase fictícia Swagger ' + randomUUID(),
  };
  const first = await request.post(api + '/api/auth/register', { data: user }),
    duplicate = await request.post(api + '/api/auth/register', { data: user });
  expect(first.status()).toBe(202);
  expect(await duplicate.json()).toEqual(await first.json());
  const external: string[] = [],
    errors: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).origin !== api) external.push(new URL(r.url()).origin);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(api + '/api-docs?url=https://untrusted.example.invalid/openapi.json');
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(76);
  const loginOperation = page.locator('.opblock').filter({
    has: page.locator('.opblock-summary-path').filter({ hasText: /^\/auth\/login$/ }),
  });
  await loginOperation.locator('.opblock-summary-control').click();
  await loginOperation.getByRole('button', { name: 'Try it out', exact: true }).click();
  await loginOperation
    .locator('textarea')
    .fill(JSON.stringify({ email: user.email, password: user.password }));
  const loggingIn = page.waitForResponse(
    (r) => r.url() === api + '/api/auth/login' && r.request().method() === 'POST',
  );
  await loginOperation.getByRole('button', { name: 'Execute', exact: true }).click();
  const login = await loggingIn;
  expect(login.status()).toBe(200);
  const { accessToken } = await login.json();
  await page.locator('.auth-wrapper .authorize').click();
  await page.locator('.auth-container input').fill(accessToken);
  await page.locator('.auth-btn-wrapper .authorize').click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const operation = page
    .locator('.opblock')
    .filter({ has: page.locator('.opblock-summary-path').filter({ hasText: /^\/auth\/me$/ }) });
  await operation.locator('.opblock-summary-control').click();
  await operation.getByRole('button', { name: 'Try it out', exact: true }).click();
  const response = page.waitForResponse(
    (r) => r.url() === api + '/api/auth/me' && r.request().method() === 'GET',
  );
  await operation.getByRole('button', { name: 'Execute', exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  expect(JSON.stringify(await result.json())).toContain(user.nome);
  expect(
    await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })),
  ).toEqual({ local: {}, session: {} });
  expect(page.url()).not.toContain(accessToken);
  await page.screenshot({ path: evidence + '/swagger-authenticated-desktop.png', fullPage: false });
  await page.reload();
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(76);
  await page.locator('.auth-wrapper .authorize').click();
  await expect(page.locator('.auth-container input')).toHaveValue('');
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  expect((await request.get(api + '/api/ready')).status()).toBe(200);
});
for (const width of widths)
  test(`Swagger e Bootstrap preservados a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(api + '/api-docs');
    await expect(page.locator('.swagger-ui .opblock')).toHaveCount(76);
    await page.screenshot({ path: evidence + '/swagger-overview-' + width + '.png' });
    const contrast = await page.locator('.opblock-summary-method').evaluateAll((els) =>
      els.map((e) => {
        const luminance = (color: string) => {
          const rgb = color
            .match(/\d+/g)!
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              const c = v / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
          return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
        };
        const style = getComputedStyle(e),
          a = luminance(style.color),
          b = luminance(style.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      }),
    );
    expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Saltar para a documentação' })).toBeFocused();
    const operation = page.locator('.opblock').filter({
      has: page.locator('.opblock-summary-path').filter({ hasText: /^\/auth\/login$/ }),
    });
    await operation.locator('.opblock-summary-control').click();
    await operation.getByRole('button', { name: 'Try it out', exact: true }).click();
    await expect(operation.locator('textarea')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: evidence + '/swagger-' + width + '.png', fullPage: false });
    await page.goto('/produtos');
    await expect(page.locator('.product-card.card')).toHaveCount(12);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: evidence + '/bootstrap-catalog-' + width + '.png' });
    await page.goto('/produtores');
    await expect(page.locator('.producer-grid.row .producer-card')).toHaveCount(7);
    const cards = await page.locator('.producer-card').evaluateAll((els) =>
      els.map((e) => ({
        x: e.getBoundingClientRect().x,
        y: e.getBoundingClientRect().y,
        width: e.getBoundingClientRect().width,
      })),
    );
    expect(cards.filter((c) => Math.abs(c.y - cards[0]!.y) < 2)).toHaveLength(
      width < 768 ? 1 : width < 1024 ? 2 : 3,
    );
    expect(cards.every((c) => c.width > 180 && c.x >= 0 && c.x + c.width <= width + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: evidence + '/bootstrap-producers-' + width + '.png' });
    expect(errors).toEqual([]);
  });
