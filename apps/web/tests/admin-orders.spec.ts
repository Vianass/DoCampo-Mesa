import { test, expect, type Page } from './support/test';
import { mockAdminOrders } from './support/admin-order-fixtures';
const path = '/area/administrador/encomendas';
async function navigate(page: Page, url: string) {
  await page.evaluate((url) => {
    history.pushState(null, '', url);
    dispatchEvent(new PopStateEvent('popstate'));
  }, url);
}
async function start(page: Page) {
  const f = await mockAdminOrders(page);
  await f.login();
  await navigate(page, path);
  return f;
}
test('listagem, filtros globais e reset da página ficam na URL', async ({ page }) => {
  const f = await start(page);
  await expect(page.getByRole('heading', { name: 'A operação do mercado.' })).toBeVisible();
  await page.getByLabel('Estado da encomenda', { exact: true }).selectOption('pronta');
  await expect.poll(() => f.state.queries.at(-1)).toContain('estado=pronta');
  await expect(page).toHaveURL(/pagina=1/);
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page).not.toHaveURL(/estado=/);
});
test('página inexistente normaliza URL e foca título confirmado', async ({ page }) => {
  await start(page);
  await navigate(page, path + '?pagina=999');
  await expect(page).toHaveURL(/pagina=1/);
  await expect(page.getByRole('heading', { name: 'A operação do mercado.' })).toBeFocused();
});
test('falha não se transforma em zeros e recuperação consulta novamente', async ({ page }) => {
  const f = await start(page);
  await expect(page.locator('.admin-order-card')).toHaveCount(1);
  f.state.status = 503;
  await page.getByRole('button', { name: 'Atualizar encomendas' }).click();
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.locator('.admin-real-metrics')).toHaveCount(0);
  await expect(page.getByRole('alert')).not.toContainText('segredo');
  f.state.status = 0;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('.admin-order-card')).toHaveCount(1);
});
test('vazio explícito e identificador inválido não consultam detalhe inventado', async ({
  page,
}) => {
  const f = await start(page);
  f.state.empty = true;
  await page.getByRole('button', { name: 'Atualizar encomendas' }).click();
  await expect(
    page.getByRole('heading', { name: 'Nenhuma encomenda corresponde à consulta.' }),
  ).toBeVisible();
  await navigate(page, path + '/invalido');
  await expect(
    page.getByRole('heading', { name: 'A encomenda não está disponível.' }),
  ).toBeVisible();
});
test('detalhe histórico separado e ausência de comandos operacionais', async ({ page }) => {
  await start(page);
  await page.getByRole('link', { name: /Consultar encomenda/ }).click();
  await expect(page.getByRole('heading', { name: 'Histórico persistido' })).toBeVisible();
  await page.getByLabel('Tipo de histórico', { exact: true }).selectOption('pagamento');
  await expect(page.locator('.admin-order-history')).toContainText('Por pagar');
  await expect(
    page.getByRole('button', { name: /Confirmar encomenda|Cancelar encomenda|Reembolsar/ }),
  ).toHaveCount(0);
  await expect(page.getByText('Responsável não registado', { exact: true })).toBeVisible();
});
test('403 retira dados e oferece confirmação de acesso', async ({ page }) => {
  const f = await start(page);
  await expect(page.locator('.admin-order-card')).toHaveCount(1);
  f.state.status = 403;
  await page.getByRole('button', { name: 'Atualizar encomendas' }).click();
  await expect(page.locator('.admin-order-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirmar acesso administrativo' })).toBeVisible();
});
test('carregamento é anunciado sem total inventado', async ({ page }) => {
  const f = await mockAdminOrders(page);
  await f.login();
  let release!: () => void;
  f.state.gate = new Promise((r) => (release = r));
  await navigate(page, path);
  await expect(page.getByRole('status', { name: 'A consultar encomendas reais' })).toBeVisible();
  await expect(page.locator('.admin-real-metrics')).toHaveCount(0);
  release();
  await expect(page.locator('.admin-order-card')).toHaveCount(1);
});
