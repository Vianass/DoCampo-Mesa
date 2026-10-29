import { expect, test } from './support/test';
import { accountLogin, mockAccount } from './support/auth-fixtures';
import {
  applicationFixture,
  applicationInput,
  fillApplication,
  mockApplication,
} from './support/producer-application-fixtures';
import { applicationPath } from '../src/features/producer-application/model';
async function navigate(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Conhecer a candidatura' }).click();
  await expect(page).toHaveURL(new RegExp(applicationPath + '$'));
}
test('consulta em curso apresenta carregamento e não permite enviar dados', async ({ page }) => {
  await mockAccount(page);
  const api = await mockApplication(page);
  await accountLogin(page);
  let release!: () => void;
  api.getGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await navigate(page);
  await expect(page.getByRole('status', { name: 'A consultar a tua candidatura' })).toBeVisible();
  await expect(page.getByRole('form')).toHaveCount(0);
  release();
  await expect(page.getByRole('form')).toBeVisible();
});
test('HTTP 401 na submissão termina a sessão e retira os dados privados', async ({ page }) => {
  await mockAccount(page);
  const api = await mockApplication(page);
  api.postStatus = 401;
  await accountLogin(page);
  await navigate(page);
  await fillApplication(page);
  await page.getByRole('button', { name: 'Enviar candidatura', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await expect(page.locator('.producer-application')).toHaveCount(0);
  expect(api.posts).toBe(1);
});
test('visitante autentica e retoma a candidatura sem selecionar papéis', async ({ page }) => {
  await mockAccount(page);
  await mockApplication(page);
  await page.goto(applicationPath);
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await page.getByLabel('Email', { exact: true }).fill('teste@example.invalid');
  await page.getByLabel('Palavra-passe', { exact: true }).fill('Frase fictícia da candidatura');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(applicationPath + '$'));
  await expect(page.getByRole('form', { name: 'Candidatura a produtor' })).toBeVisible();
});
test('formulário acessível valida os cinco campos e mantém os dados na revalidação da sessão', async ({
  page,
}) => {
  await mockAccount(page);
  const api = await mockApplication(page);
  await accountLogin(page);
  await navigate(page);
  await page.getByRole('button', { name: 'Enviar candidatura', exact: true }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.locator('[aria-invalid=true]')).toHaveCount(5);
  expect(api.posts).toBe(0);
  await fillApplication(page);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('[name="descricao"]')).toHaveValue(applicationInput.descricao);
  for (const field of ['nomePublico', 'localidade', 'concelho', 'descricao', 'telefone'])
    await expect(page.locator(`[name="${field}"]`)).toHaveAttribute('required', '');
  await page.getByRole('link', { name: '← Voltar à minha área' }).click();
  await expect(page).toHaveURL(/\/area\/comprador$/);
});
test('submete só os campos aprovados, mostra pendente e impede nova submissão', async ({
  page,
}) => {
  await mockAccount(page);
  const api = await mockApplication(page);
  await accountLogin(page);
  await navigate(page);
  await fillApplication(page);
  await page.getByRole('button', { name: 'Enviar candidatura', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recebemos a tua candidatura.' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Candidatura recebida.' })).toBeVisible();
  expect(api.bodies).toEqual([applicationInput]);
  await expect(page.getByRole('form')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ir para a área do produtor' })).toHaveCount(0);
});
test('duplo clique e Enter durante envio produzem um único POST', async ({ page }) => {
  await mockAccount(page);
  const api = await mockApplication(page);
  await accountLogin(page);
  await navigate(page);
  await fillApplication(page);
  let release!: () => void;
  api.postGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.getByRole('button', { name: 'Enviar candidatura', exact: true }).click();
  await expect(page.getByRole('button', { name: 'A enviar candidatura…' })).toBeDisabled();
  await page.keyboard.press('Enter');
  expect(api.posts).toBe(1);
  release();
  await expect(page.getByText('Em análise', { exact: true }).first()).toBeVisible();
});
for (const status of [400, 403, 409, 413, 503])
  test(`trata HTTP ${status} sem divulgar mensagens internas ou repetir automaticamente`, async ({
    page,
  }) => {
    await mockAccount(page);
    const api = await mockApplication(page);
    api.postStatus = status;
    await accountLogin(page);
    await navigate(page);
    await fillApplication(page);
    await page.getByRole('button', { name: 'Enviar candidatura', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('confidenciais');
    expect(api.posts).toBe(1);
    if ([409, 503].includes(status)) {
      await expect(
        page.getByRole('button', { name: 'Enviar candidatura', exact: true }),
      ).toBeDisabled();
      api.application = applicationFixture();
      await page.getByRole('button', { name: 'Confirmar estado da candidatura' }).click();
      await expect(
        page.getByRole('heading', { name: 'Recebemos a tua candidatura.' }),
      ).toBeVisible();
      expect(api.posts).toBe(1);
    }
  });
test('falha de consulta não é confundida com ausência de candidatura', async ({ page }) => {
  await mockAccount(page);
  const api = await mockApplication(page);
  api.getStatus = 503;
  await accountLogin(page);
  await navigate(page);
  await expect(page.getByRole('alert')).toContainText('Não foi possível consultar');
  await expect(page.getByRole('group', { name: 'Recuperar candidatura' })).toBeFocused();
  await expect(page.getByRole('form')).toHaveCount(0);
  api.getStatus = 0;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('form')).toBeVisible();
  await expect(page.locator('[name="nomePublico"]')).toBeFocused();
});
for (const width of [320, 430])
  test(`erro de rede a ${width}px foca a recuperação visível e conserva o rascunho sem ciclos`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await mockAccount(page);
    const api = await mockApplication(page);
    await accountLogin(page);
    await navigate(page);
    await fillApplication(page);
    await page.route('**/api/me/producer-application', async (route) => {
      if (route.request().method() === 'POST') await route.abort();
      else await route.fallback();
    });
    await page.getByRole('button', { name: 'Enviar candidatura', exact: true }).click();
    const recovery = page.getByRole('button', { name: 'Confirmar estado da candidatura' });
    await expect(page.getByRole('group', { name: 'Recuperar candidatura' })).toBeFocused();
    await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.getByRole('alert').getByRole('button')).toHaveCount(0);
    const error = await page.getByRole('alert').textContent();
    await expect(page.getByRole('status').filter({ hasText: error! })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Enviar candidatura', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(recovery).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('[name="nomePublico"]')).toBeFocused();
    for (const [name, value] of Object.entries(applicationInput))
      await expect(page.locator(`[name="${name}"]`)).toHaveValue(value);
    await page.keyboard.press('Tab');
    await expect(page.locator('[name="localidade"]')).toBeFocused();
    await page.keyboard.type(' revista');
    await expect(page.locator('[name="localidade"]')).toBeFocused();
    expect(api.posts).toBe(0);
  });
test('atualização para rejeitada anuncia o estado e mantém a continuação por teclado', async ({
  page,
}) => {
  await mockAccount(page);
  const api = await mockApplication(page);
  api.application = applicationFixture();
  await accountLogin(page);
  await page.getByRole('link', { name: 'Acompanhar candidatura', exact: true }).click();
  api.application = applicationFixture('rejeitado');
  await page.getByRole('button', { name: 'Atualizar estado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Há informação a rever.' })).toBeFocused();
  await expect(
    page.getByRole('status').filter({ hasText: 'Estado da candidatura: Rejeitada.' }),
  ).toHaveCount(1);
  await expect(
    page.getByText('Descreve melhor os produtos da exploração.', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Rever e reapresentar', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[name="nomePublico"]')).toBeFocused();
  await page.locator('[name="descricao"]').fill('Informação revista para reapresentar.');
  await expect(page.locator('[name="descricao"]')).toBeFocused();
});
test('estatuto usa contexto neutro e não concede capacidades ao comprador pendente', async ({
  page,
}) => {
  const auth = await mockAccount(page);
  const api = await mockApplication(page);
  api.application = applicationFixture();
  await accountLogin(page);
  await page.getByRole('link', { name: 'Acompanhar candidatura', exact: true }).click();
  await expect(page.locator('.private-role-line strong')).toHaveText('Candidatura a produtor');
  await expect(
    page.getByText('A tua conta mantém o acesso de comprador.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Área de Produtor', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ir para a área do produtor' })).toHaveCount(0);
  auth.roles = ['comprador', 'produtor'];
  api.application = applicationFixture('aprovado');
  await page.getByRole('button', { name: 'Atualizar estado', exact: true }).click();
  await page.getByRole('link', { name: 'Ir para a área do produtor', exact: true }).click();
  await expect(page.locator('.private-role-line strong')).toHaveText('Produtor');
  await page.getByRole('link', { name: 'Estatuto de produtor', exact: true }).click();
  await expect(page.locator('.private-role-line strong')).toHaveText('Candidatura a produtor');
  await expect(
    page.getByRole('link', { name: 'Candidatura a produtor', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByText('A tua conta mantém o acesso de comprador.', { exact: false }),
  ).toHaveCount(0);
});
test('aprovação não concede papéis localmente e só abre a área após /auth/me confirmado', async ({
  page,
}) => {
  const auth = await mockAccount(page);
  const api = await mockApplication(page);
  api.application = applicationFixture('aprovado');
  await accountLogin(page);
  await page.getByRole('link', { name: 'Consultar aprovação', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Confirmar acesso à área do produtor' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir para a área do produtor' })).toHaveCount(0);
  auth.roles = ['comprador', 'produtor'];
  await page.getByRole('button', { name: 'Confirmar acesso à área do produtor' }).click();
  await expect(page.getByRole('link', { name: 'Ir para a área do produtor' })).toBeVisible();
});
test('rejeição reapresentada conserva o histórico e os valores anteriores', async ({ page }) => {
  await mockAccount(page);
  const api = await mockApplication(page);
  api.application = applicationFixture('rejeitado');
  await accountLogin(page);
  await page.getByRole('link', { name: 'Rever candidatura', exact: true }).click();
  await expect(
    page.getByText('Descreve melhor os produtos da exploração.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[name="nomePublico"]')).toHaveValue(applicationInput.nomePublico);
  const submitted = page
    .locator('details')
    .filter({ has: page.getByText('Dados da candidatura rejeitada', { exact: true }) });
  await expect(submitted).not.toHaveAttribute('open');
  await expect(submitted.locator('.application-data')).toBeHidden();
  await expect(page.getByText('Decisão comunicada em', { exact: false })).toBeVisible();
  await page.getByText('Dados da candidatura rejeitada', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(submitted.locator('.application-data')).toBeVisible();
  for (const value of Object.values(applicationInput)) await expect(submitted).toContainText(value);
  await page.keyboard.press('Enter');
  await expect(submitted.locator('.application-data')).toBeHidden();
  await expect(page.locator('.application-process details')).not.toHaveAttribute('open');
  await page.getByText('Como funciona a candidatura', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Um caminho com três passos.' })).toBeVisible();
  await page.getByRole('button', { name: 'Rever e reapresentar', exact: true }).click();
  await expect(page.locator('[name="nomePublico"]')).toBeFocused();
  for (const [name, value] of Object.entries(applicationInput)) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue(value);
    await expect(page.locator(`[name="${name}"]`)).toHaveAttribute('required', '');
  }
  await page
    .locator('[name="descricao"]')
    .fill('Atividade agrícola fictícia com informação revista.');
  await page.getByRole('button', { name: 'Reapresentar candidatura' }).click();
  await page.getByText('Candidaturas anteriores (1)', { exact: true }).click();
  await expect(page.locator('.application-history')).toContainText(applicationInput.descricao);
  await expect(page.locator('.application-history')).toContainText('Descreve melhor');
  expect(api.posts).toBe(1);
});
test('logout limpa rascunho e dados privados; nova sessão começa pelo servidor', async ({
  page,
}) => {
  await mockAccount(page);
  await mockApplication(page);
  await accountLogin(page);
  await navigate(page);
  await fillApplication(page);
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await accountLogin(page);
  await navigate(page);
  await expect(page.locator('[name="nomePublico"]')).toHaveValue('');
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => /token|candidatura|application/i.test(k)),
    ),
  ).toEqual([]);
});
