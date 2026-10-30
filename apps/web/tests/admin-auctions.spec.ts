import { test, expect, type Page } from './support/test';
import { mockAdminAuctions, adminAuctionFixture } from './support/admin-auction-fixtures';
const path = '/area/administrador/leiloes';
async function navigate(page: Page, to: string) {
  await page.evaluate((to) => {
    history.pushState(null, '', to);
    dispatchEvent(new PopStateEvent('popstate'));
  }, to);
}
async function start(page: Page, count = 1) {
  const f = await mockAdminAuctions(page, count);
  await f.login();
  await navigate(page, path);
  await expect(page.locator('.admin-auction-card')).toHaveCount(Math.min(count, 12));
  return f;
}
test('filtros globais, paginação e regresso à primeira página', async ({ page }) => {
  const f = await start(page, 13);
  await page.getByRole('button', { name: 'Página seguinte', exact: true }).click();
  await expect(page.locator('.admin-auction-card')).toHaveCount(1);
  await page.getByLabel('Estado do leilão', { exact: true }).selectOption('cancelado');
  await expect.poll(() => f.state.queries.at(-1)).toContain('estado=cancelado');
  await expect(page).toHaveURL(/pagina=1/);
  await expect(
    page.getByRole('heading', { name: 'Nenhum leilão corresponde à consulta.' }),
  ).toBeVisible();
});
test('página inexistente corrige URL preserva filtros e foca título', async ({ page }) => {
  await start(page, 13);
  await navigate(page, path + '?pagina=999&estado=ativo');
  await expect(page).toHaveURL(/pagina=2/);
  await expect(page).toHaveURL(/estado=ativo/);
  await expect(page.getByRole('heading', { name: 'O mercado em movimento.' })).toBeFocused();
});
test('erro recuperável não transforma a última leitura em sucesso novo ou zeros', async ({
  page,
}) => {
  const f = await start(page);
  f.state.status = 503;
  await page.getByRole('button', { name: 'Atualizar leilões', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.getByRole('alert')).not.toContainText('segredo');
  await expect(page.locator('.admin-auction-card')).toHaveCount(1);
  f.state.status = 0;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('403 retira os dados e oferece confirmar acesso', async ({ page }) => {
  const f = await start(page);
  f.state.status = 403;
  await page.getByRole('button', { name: 'Atualizar leilões', exact: true }).click();
  await expect(page.locator('.admin-auction-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirmar acesso administrativo' })).toBeVisible();
});
test('detalhe não contém ações de licitação, edição ou cancelamento', async ({ page }) => {
  await start(page);
  await page.getByRole('link', { name: /Supervisionar leilão/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Licitações confirmadas', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Sem licitações confirmadas neste leilão.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Licitar|Apresentar oferta|Editar leilão|Cancelar leilão/ }),
  ).toHaveCount(0);
});
test('resultado e histórico só mostram evidência confirmada pela API', async ({ page }) => {
  const f = await start(page);
  f.state.items[0] = adminAuctionFixture(1, 'terminado', 2);
  await page.getByRole('link', { name: /Supervisionar leilão/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Resultado confirmado pelo serviço' }),
  ).toBeVisible();
  await expect(page.locator('.admin-auction-bids li')).toHaveCount(2);
  await expect(page.locator('.admin-auction-result')).toContainText('não representa pagamento');
  await page.getByRole('link', { name: '← Voltar aos leilões', exact: true }).click();
  const metric = page
    .locator('.admin-real-metrics > div')
    .filter({ has: page.getByText('Valor das ofertas vencedoras', { exact: true }) });
  await expect(metric).toContainText('14,00');
});
test('endereços inválidos e detalhes inexistentes são tratados sem dados inventados', async ({
  page,
}) => {
  await start(page);
  await navigate(page, path + '/invalid');
  await expect(page.getByRole('heading', { name: 'O leilão não está disponível.' })).toBeVisible();
  await navigate(page, path + '/ffffffffffffffffffffffff');
  await expect(page.getByRole('alert')).toHaveText('O leilão não está disponível.');
});
test('loading é anunciado sem métricas fictícias', async ({ page }) => {
  const f = await mockAdminAuctions(page);
  await f.login();
  let release!: () => void;
  f.state.gate = new Promise((r) => (release = r));
  await navigate(page, path);
  await expect(page.getByRole('status', { name: 'A consultar leilões reais' })).toBeVisible();
  await expect(page.locator('.admin-real-metrics')).toHaveCount(0);
  release();
  await expect(page.locator('.admin-auction-card')).toHaveCount(1);
});
