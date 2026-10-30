import { test, expect } from './support/test';
import { mockReviews, reviewFixture, reviewId } from './support/review-fixtures';
const buyer = '/area/comprador/avaliacoes',
  admin = '/area/administrador/moderacao';
async function navigate(page: import('@playwright/test').Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
test('comprador usa teclado, confirma a publicação e consulta o detalhe próprio', async ({
  page,
}) => {
  const f = await mockReviews(page);
  await f.login();
  await navigate(page, buyer);
  await page.getByRole('button', { name: 'Avaliar produto', exact: true }).click();
  const rating = page.getByRole('radio', { name: '1 estrela', exact: true });
  await rating.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '2 estrelas', exact: true })).toBeChecked();
  await page.getByLabel('Comentário', { exact: true }).fill('Experiência de teste.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Publicar avaliação', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(buyer + '/' + reviewId));
  await expect(
    page.getByText('Avaliação publicada e confirmada pelo serviço.', { exact: true }),
  ).toBeVisible();
  expect(f.state.posts).toBe(1);
});
test('resposta perdida exige consultar antes de repetir e não duplica o POST', async ({ page }) => {
  const f = await mockReviews(page);
  f.state.lost = true;
  await f.login();
  await navigate(page, buyer);
  await page.getByRole('button', { name: 'Avaliar produto', exact: true }).click();
  await page.getByRole('radio', { name: '5 estrelas', exact: true }).check();
  await page.getByLabel('Comentário', { exact: true }).fill('Resposta incerta de teste.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Publicar avaliação', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Consulta o estado');
  await expect(
    page.getByRole('button', { name: 'Publicar avaliação', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Consultar avaliações antes de repetir' }).click();
  await expect(page.getByText('Resposta incerta de teste.', { exact: true })).toBeVisible();
  expect(f.state.posts).toBe(1);
});
test('moderação exige motivo, confirmação e preserva comentário original', async ({ page }) => {
  const f = await mockReviews(page, true);
  f.state.items = [reviewFixture()];
  await f.login();
  await navigate(page, admin + '/' + reviewId);
  await page
    .getByLabel('Motivo da decisão', { exact: true })
    .fill('Conteúdo inadequado para publicação.');
  await page.getByRole('button', { name: 'Ocultar avaliação', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar análise', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Confirmar ocultação', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Restaurar avaliação', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Tomates da compra fictícia', exact: true }),
  ).toBeFocused();
  expect(f.state.items[0]!.comentario).toBe(reviewFixture().comentario);
});
test('conflito de moderação bloqueia nova decisão até consulta explícita', async ({ page }) => {
  const f = await mockReviews(page, true);
  f.state.items = [reviewFixture()];
  f.state.conflict = true;
  await f.login();
  await navigate(page, admin + '/' + reviewId);
  await page.getByLabel('Motivo da decisão', { exact: true }).fill('Motivo fictício.');
  await page.getByRole('button', { name: 'Ocultar avaliação', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar ocultação', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('A avaliação mudou');
  await expect(page.getByRole('button', { name: 'Ocultar avaliação', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Consultar estado atualizado', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ocultar avaliação', exact: true })).toBeEnabled();
});
test('conta sem permissão não conserva conteúdo e oferece recuperar acesso', async ({ page }) => {
  const f = await mockReviews(page, true);
  f.state.items = [reviewFixture()];
  await f.login();
  await navigate(page, admin);
  await expect(page.locator('.review-card')).toHaveCount(1);
  f.state.status = 403;
  await page.getByRole('button', { name: 'Atualizar avaliações', exact: true }).click();
  await expect(page.locator('.review-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirmar acesso administrativo' })).toBeVisible();
});
test('comentário é texto e não injeta HTML no DOM', async ({ page }) => {
  const f = await mockReviews(page);
  f.state.items = [
    {
      ...reviewFixture(),
      comentario: '<img src=x onerror=alert(1)><script>window.injetado=true</script>',
    },
  ];
  await f.login();
  await navigate(page, buyer + '/' + reviewId);
  await expect(page.locator('.review-card__text')).toHaveText(f.state.items[0]!.comentario);
  await expect(page.locator('.review-card img,.review-card script')).toHaveCount(0);
});
