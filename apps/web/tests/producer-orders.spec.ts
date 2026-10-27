import { test, expect, type Page } from './support/test';
import { mockAccount, fixtureUser, fixturePassword } from './support/auth-fixtures';
import { mockProducerOrders } from './support/producer-orders-fixtures';
import { checkoutOrderId } from './support/checkout-fixtures';
async function setup(page: Page, path = '/area/produtor/encomendas') {
  const account = await mockAccount(page);
  account.roles = ['produtor'];
  const api = await mockProducerOrders(page);
  await page.goto('/entrar?destino=' + encodeURIComponent(path));
  await page.getByLabel('Email', { exact: true }).fill(fixtureUser.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  return { account, api };
}
async function detail(page: Page) {
  await page.getByRole('link', { name: 'Consultar encomenda →', exact: true }).click();
  await expect(page.locator('.live-order')).toHaveCount(1);
}
test('encomendas reais do produtor apresentam indicadores e dados da API sem cenário fictício', async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator('.producer-live-card')).toHaveCount(1);
  await expect(page.getByLabel('Indicadores reais de vendas')).toContainText(
    'não representa pagamentos recebidos',
  );
  await expect(page.locator('.producer-scenario')).toHaveCount(0);
  await expect(page.getByText('Valor das encomendas concluídas', { exact: true })).toBeVisible();
});
test('filtro e ordenação consultam o servidor e preservam indicadores globais', async ({
  page,
}) => {
  const { api } = await setup(page);
  await expect(page.locator('.producer-live-card')).toHaveCount(1);
  await page.getByLabel('Estado das encomendas recebidas').selectOption('confirmada');
  await expect(
    page.getByRole('heading', { name: 'Ainda sem encomendas nesta consulta.' }),
  ).toBeVisible();
  await page.getByLabel('Ordenar por data').selectOption('antigas');
  await expect.poll(() => api.calls.at(-1)?.query).toContain('ordem=antigas');
  await expect(page.getByLabel('Indicadores reais de vendas')).toContainText(
    'Encomendas pendentes',
  );
});
test('paginação solicita outra página e o filtro regressa à primeira', async ({ page }) => {
  const { api } = await setup(page);
  api.total = 13;
  await page.getByRole('button', { name: 'Atualizar consulta', exact: true }).click();
  await page.getByRole('button', { name: 'Página seguinte', exact: true }).click();
  await expect(page.getByText('Página 2 de 2')).toBeVisible();
  expect(api.calls.at(-1)?.query).toContain('pagina=2');
  await page.getByLabel('Estado das encomendas recebidas').selectOption('pendente');
  await expect(page.getByText('Página 1 de 2')).toBeVisible();
});
test('percurso guiado envia PATCH com If-Match e não oferece conclusão ou cancelamento', async ({
  page,
}) => {
  const { api } = await setup(page);
  await detail(page);
  for (const label of ['Confirmar encomenda', 'Iniciar preparação', 'Marcar como pronta']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Estado atualizado para' }),
    ).toBeVisible();
  }
  await expect(
    page.getByText('Não há transições de estado disponíveis para o produtor nesta etapa.'),
  ).toBeVisible();
  const writes = api.calls.filter((c) => c.method === 'PATCH');
  expect(writes).toHaveLength(3);
  expect(new Set(writes.map((w) => w.match)).size).toBe(3);
  expect(writes.map((w) => w.body)).toEqual([
    { estado: 'confirmada' },
    { estado: 'em_preparacao' },
    { estado: 'pronta' },
  ]);
  await expect(page.getByRole('button', { name: /cancelar|concluir/i })).toHaveCount(0);
});
for (const status of [409, 412, 503])
  test(`erro ${status} impede repetição cega e pede consulta atualizada`, async ({ page }) => {
    const { api } = await setup(page);
    await detail(page);
    api.status = status;
    await page.getByRole('button', { name: 'Confirmar encomenda', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      status === 503 ? 'Não foi possível confirmar' : 'A encomenda mudou',
    );
    await expect(
      page.getByRole('button', { name: 'Confirmar encomenda', exact: true }),
    ).toBeDisabled();
    expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    api.status = 200;
    await page.getByRole('button', { name: 'Atualizar consulta', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Confirmar encomenda', exact: true }),
    ).toBeEnabled();
  });
test('consulta indisponível é explícita e permite tentar novamente', async ({ page }) => {
  const { api } = await setup(page);
  await expect(page.locator('.producer-live-card')).toHaveCount(1);
  api.status = 503;
  await page.getByRole('button', { name: 'Atualizar consulta', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível consultar');
  api.status = 200;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.locator('.producer-live-card')).toHaveCount(1);
});
test('detalhe inexistente é seguro e não oferece comandos', async ({ page }) => {
  const { api } = await setup(page);
  await expect(page.locator('.producer-live-card')).toHaveCount(1);
  api.status = 404;
  await page.getByRole('link', { name: 'Consultar encomenda →', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Esta encomenda não está disponível');
  await expect(page.getByRole('button', { name: 'Confirmar encomenda', exact: true })).toHaveCount(
    0,
  );
});
test('identificador inválido não é enviado à API de detalhe', async ({ page }) => {
  const { api } = await setup(page, '/area/produtor/encomendas/id-invalido');
  await expect(page.getByRole('alert')).toContainText('Esta encomenda não está disponível');
  expect(api.calls).toHaveLength(0);
});
test('página inicial do produtor usa indicadores reais e acesso às encomendas', async ({
  page,
}) => {
  await setup(page, '/area/produtor');
  await expect(
    page.getByRole('heading', { name: 'Da tua terra, para outras mesas.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Indicadores reais de vendas')).toBeVisible();
  await page.getByRole('link', { name: 'Todas as encomendas', exact: true }).click();
  await expect(page).toHaveURL(/\/area\/produtor\/encomendas$/);
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(`ficha A tua conta legível e alinhada na visão geral a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page, '/area/produtor');
    const card = page.getByRole('region', { name: 'A tua conta.', exact: true });
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: 'A tua conta.', exact: true })).toBeVisible();
    await expect(card.getByText(fixtureUser.nome, { exact: true })).toBeVisible();
    await expect(card.getByText(fixtureUser.email, { exact: true })).toBeVisible();
    await expect(card.getByText('Produtor', { exact: true })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    const layout = await card.evaluate((element) => {
      const title = element.querySelector('h2')!;
      const facts = element.querySelector('dl')!;
      const note = element.querySelector(':scope > p')!;
      const box = element.getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      const factsBox = facts.getBoundingClientRect();
      return {
        titleHeight: titleBox.height,
        titleLineHeight: parseFloat(getComputedStyle(title).lineHeight),
        factsBelowTitle: factsBox.top >= titleBox.bottom - 1,
        noteBelowFacts: note.getBoundingClientRect().top >= factsBox.bottom - 1,
        fieldsWithinCard: [...element.querySelectorAll('h2, dt, dd, p')].every((field) => {
          const bounds = field.getBoundingClientRect();
          return bounds.left >= box.left - 1 && bounds.right <= box.right + 1;
        }),
        noHorizontalOverflow:
          document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      };
    });
    // Verifica leitura e disposição visual; não depende da técnica CSS utilizada.
    expect(layout.titleHeight).toBeLessThanOrEqual(layout.titleLineHeight * 2 + 1);
    expect(layout.factsBelowTitle).toBe(true);
    expect(layout.noteBelowFacts).toBe(true);
    expect(layout.fieldsWithinCard).toBe(true);
    expect(layout.noHorizontalOverflow).toBe(true);
    await expect(page.getByLabel('Indicadores reais de vendas')).toBeVisible();
    await expect(page.locator('.producer-live-card')).toHaveCount(1);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: `/private/tmp/docampo-5f-identity-fixed-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  });
test('comprador não pode abrir a área do produtor escolhendo o caminho', async ({ page }) => {
  const account = await mockAccount(page);
  account.roles = ['comprador'];
  const api = await mockProducerOrders(page);
  await page.goto('/entrar');
  await page.getByLabel('Email', { exact: true }).fill(fixtureUser.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/area\/comprador$/);
  expect(api.calls).toHaveLength(0);
});
test('a sessão e o histórico anterior não são restaurados após logout', async ({ page }) => {
  await setup(page);
  await detail(page);
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  await expect(page.locator('.live-order')).toHaveCount(0);
  await expect(page.getByText(checkoutOrderId, { exact: true })).toHaveCount(0);
});
