import { test, expect } from './support/test';
import { accountLogin, mockAccount } from './support/auth-fixtures';
import { adminApplicationsPath } from '../src/features/admin-applications/contracts';
import {
  administrativeFixture,
  applicationTag,
  mockAdministrativeApplications,
} from './support/admin-application-fixtures';
async function start(page: import('@playwright/test').Page, count = 1) {
  const auth = await mockAccount(page);
  auth.roles = ['administrador'];
  const api = await mockAdministrativeApplications(page, count);
  await accountLogin(page);
  return { auth, api };
}
async function detail(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Analisar candidaturas', exact: true }).click();
  await page
    .getByRole('link', { name: /Consultar candidatura de/ })
    .first()
    .click();
  await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toBeVisible();
}
test('consulta em curso não mostra decisões nem reutiliza dados da listagem', async ({ page }) => {
  const { api } = await start(page);
  let release!: () => void;
  api.getGate = new Promise<void>((resolve) => (release = resolve));
  await page.getByRole('link', { name: 'Analisar candidaturas', exact: true }).click();
  await expect(page.getByRole('status', { name: 'A consultar candidaturas reais' })).toBeVisible();
  await expect(page.locator('.admin-application-cards article')).toHaveCount(0);
  release();
  await expect(page.locator('.admin-application-cards article')).toHaveCount(1);
});
test('rascunho sobrevive à confirmação da sessão e muda apenas com a versão ou identidade', async ({
  page,
}) => {
  const { api } = await start(page);
  await detail(page);
  await page.getByLabel('Motivo da rejeição', { exact: true }).fill('Nota privada temporária.');
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await expect(page.getByLabel('Motivo da rejeição', { exact: true })).toHaveValue(
    'Nota privada temporária.',
  );
  api.detailStatus = 503;
  await page.getByRole('button', { name: 'Atualizar candidatura', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  api.detailStatus = 0;
  api.tag = '"' + 'c'.repeat(43) + '"';
  await page.getByRole('button', { name: 'Consultar estado atualizado' }).click();
  await expect(page.getByLabel('Motivo da rejeição', { exact: true })).toHaveValue('');
  await page
    .getByLabel('Motivo da rejeição', { exact: true })
    .fill('Nota que deve ser limpa na saída.');
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  await accountLogin(page);
  await detail(page);
  await expect(page.getByLabel('Motivo da rejeição', { exact: true })).toHaveValue('');
  expect(
    await page.evaluate(() =>
      [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((key) =>
        /token|candidatura|application/i.test(key),
      ),
    ),
  ).toEqual([]);
});
test('resposta de detalhe sem ETag impede abrir uma decisão', async ({ page }) => {
  await start(page);
  await page.route('**/api/admin/producer-applications/*', async (route) => {
    await route.fulfill({ json: administrativeFixture() });
  });
  await page.getByRole('link', { name: 'Analisar candidaturas', exact: true }).click();
  await page
    .getByRole('link', { name: /Consultar candidatura de/ })
    .first()
    .click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível consultar');
  await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toHaveCount(0);
});
test('entrada administrativa apresenta total real sem métricas inventadas e paginação remota', async ({
  page,
}) => {
  const { api } = await start(page, 13);
  await expect(
    page.getByRole('status').filter({ hasText: '13 candidaturas pendentes no total.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Analisar candidaturas', exact: true }).click();
  await expect(page.locator('.admin-application-cards article')).toHaveCount(12);
  await page.getByRole('button', { name: 'Página seguinte', exact: true }).click();
  await expect(page.locator('.admin-application-cards article')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Explorações candidatas.' })).toBeFocused();
  expect(api.queries.some((q) => q.includes('pagina=2'))).toBe(true);
  await page.getByLabel('Estado das candidaturas').selectOption('rejeitado');
  await expect(
    page.getByRole('heading', { name: 'Sem candidaturas para este estado.' }),
  ).toBeVisible();
  expect(api.queries.at(-1)).toContain('estado=rejeitado');
  expect(api.queries.at(-1)).toContain('pagina=1');
  await page.getByLabel('Ordenar por submissão').selectOption('antigas');
  await expect.poll(() => api.queries.at(-1)).toContain('ordem=antigas');
  await page.getByLabel('Candidaturas por página').selectOption('24');
  await expect.poll(() => api.queries.at(-1)).toContain('porPagina=24');
});
for (const role of ['comprador', 'produtor'] as const)
  test('conta ' + role + ' não consulta dados administrativos', async ({ page }) => {
    const auth = await mockAccount(page);
    auth.roles = [role];
    const api = await mockAdministrativeApplications(page);
    await accountLogin(page);
    await page.evaluate((path) => {
      history.pushState(null, '', path);
      dispatchEvent(new PopStateEvent('popstate'));
    }, adminApplicationsPath);
    await expect(page.getByRole('heading', { name: 'Não tens acesso a esta área.' })).toBeVisible();
    expect(api.queries).toHaveLength(0);
    expect(api.details).toBe(0);
    expect(api.posts).toHaveLength(0);
  });
test('visitante autentica e retoma um detalhe administrativo', async ({ page }) => {
  const auth = await mockAccount(page);
  auth.roles = ['administrador'];
  const api = await mockAdministrativeApplications(page);
  await page.goto(adminApplicationsPath + '/' + api.items[0]!.id);
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await page.getByLabel('Email', { exact: true }).fill('ficticio@example.invalid');
  await page.getByLabel('Palavra-passe', { exact: true }).fill('Frase fictícia');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toBeVisible();
});
test('lista vazia mantém filtros utilizáveis e não inventa candidatos', async ({ page }) => {
  await start(page, 0);
  await page.getByRole('link', { name: 'Analisar candidaturas', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Sem candidaturas para este estado.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ver todas as candidaturas' }).click();
  await expect(page.getByRole('heading', { name: 'Ainda não há candidaturas.' })).toBeVisible();
});
test('erro de listagem mobile recebe foco e permite recuperar por teclado', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 960 });
  const { api } = await start(page);
  api.getStatus = 503;
  await page.getByRole('link', { name: 'Analisar candidaturas', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Recuperar listagem' })).toBeFocused();
  await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('alert')).not.toContainText('segredo');
  api.getStatus = 0;
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.admin-application-cards article')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Explorações candidatas.' })).toBeFocused();
});
test('detalhe reutiliza dados e auditoria autorizada; aprovar exige confirmação e evita repetição', async ({
  page,
}) => {
  const { api } = await start(page);
  await detail(page);
  await page.getByRole('button', { name: 'Aprovar candidatura', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar análise' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Confirmar aprovação', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Continuar análise' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    page.getByRole('button', { name: 'Confirmar aprovação', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Aprovar candidatura', exact: true }),
  ).toBeFocused();
  expect(api.posts).toHaveLength(0);
  await page.getByRole('button', { name: 'Aprovar candidatura', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'A aprovação foi confirmada' }),
  ).toBeVisible();
  await expect(page.locator('#admin-application-state')).toBeFocused();
  await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toHaveCount(0);
  expect(api.posts).toEqual([{ action: 'approve', body: {}, tag: applicationTag }]);
  await page.getByRole('link', { name: '← Voltar à listagem' }).click();
  await expect(
    page.getByRole('heading', { name: 'Sem candidaturas para este estado.' }),
  ).toBeVisible();
});
test('rejeição exige motivo válido, confirmação, normalização e preservação do histórico', async ({
  page,
}) => {
  const { api } = await start(page);
  api.items[0]!.historico = [administrativeFixture('rejeitado')];
  await detail(page);
  await page.getByRole('button', { name: 'Rejeitar candidatura', exact: true }).click();
  const reason = page.getByLabel('Motivo da rejeição', { exact: true });
  await expect(reason).toBeFocused();
  await expect(reason).toHaveAttribute('aria-invalid', 'true');
  await expect(reason).toHaveAttribute('aria-describedby', /error/);
  expect(api.posts).toHaveLength(0);
  await reason.fill('x'.repeat(2001));
  await page.getByRole('button', { name: 'Rejeitar candidatura', exact: true }).click();
  await expect(reason).toBeFocused();
  await reason.fill('  Rever informação da exploração.  ');
  await page.getByRole('button', { name: 'Rejeitar candidatura', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Rever informação da exploração.');
  await page.getByRole('button', { name: 'Confirmar rejeição', exact: true }).click();
  await expect(page.locator('.admin-application-reason').first()).toContainText(
    'Rever informação da exploração.',
  );
  expect(api.posts[0]).toMatchObject({
    action: 'reject',
    body: { justificacao: 'Rever informação da exploração.' },
    tag: applicationTag,
  });
  await page.getByText('Tentativas anteriores (1)', { exact: true }).click();
  await expect(page.locator('.admin-application-history')).toContainText(
    'Descreve melhor os produtos',
  );
});
test('conflito 412 recarrega a decisão externa sem sucesso falso ou nova decisão', async ({
  page,
}) => {
  const { api } = await start(page);
  api.postStatus = 412;
  await detail(page);
  await page.getByRole('button', { name: 'Aprovar candidatura', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Recuperar decisão' })).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('A candidatura mudou');
  await expect(
    page.getByRole('status').filter({ hasText: 'A aprovação foi confirmada' }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Esta tentativa já tem uma decisão.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprovar candidatura', exact: true })).toHaveCount(
    0,
  );
  expect(api.posts).toHaveLength(1);
  expect(api.details).toBeGreaterThan(1);
});
for (const status of [409, 503, 400, 428])
  test(
    'HTTP ' + status + ' bloqueia decisão até consultar estado e não revela mensagens internas',
    async ({ page }) => {
      const { api } = await start(page);
      api.postStatus = status;
      await detail(page);
      await page.getByLabel('Motivo da rejeição', { exact: true }).fill('Rascunho a preservar.');
      await page.getByRole('button', { name: 'Aprovar candidatura', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveCount(1);
      await expect(page.getByRole('alert')).not.toContainText('segredo');
      await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Consultar estado atualizado' }).click();
      await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toBeVisible();
      await expect(page.getByLabel('Motivo da rejeição', { exact: true })).toHaveValue(
        'Rascunho a preservar.',
      );
      expect(api.posts).toHaveLength(1);
    },
  );
test('dupla confirmação e Enter durante POST não duplicam a decisão', async ({ page }) => {
  const { api } = await start(page);
  await detail(page);
  let release!: () => void;
  api.postGate = new Promise<void>((resolve) => (release = resolve));
  await page.getByRole('button', { name: 'Aprovar candidatura', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'A confirmar decisão…' })).toBeDisabled();
  await expect
    .poll(() =>
      page.getByRole('dialog').evaluate((dialog) => dialog.contains(document.activeElement)),
    )
    .toBe(true);
  await page.keyboard.press('Tab');
  await expect
    .poll(() =>
      page.getByRole('dialog').evaluate((dialog) => dialog.contains(document.activeElement)),
    )
    .toBe(true);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(api.posts).toHaveLength(1);
  release();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
for (const status of [401, 403])
  test('HTTP ' + status + ' retira dados e impede ações', async ({ page }) => {
    const { api } = await start(page);
    api.detailStatus = status;
    await page.getByRole('link', { name: 'Analisar candidaturas', exact: true }).click();
    await page
      .getByRole('link', { name: /Consultar candidatura de/ })
      .first()
      .click();
    if (status === 401) await expect(page).toHaveURL(/\/entrar\?destino=/);
    else await expect(page.getByRole('alert')).toContainText('não tem acesso administrativo');
    await expect(page.locator('.application-data')).toHaveCount(0);
    await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toHaveCount(0);
  });
test('identificador inválido ou inexistente não disponibiliza decisões', async ({ page }) => {
  const { api } = await start(page);
  for (const id of ['inválido', 'f'.repeat(24)]) {
    await page.evaluate(
      (path) => {
        history.pushState(null, '', path);
        dispatchEvent(new PopStateEvent('popstate'));
      },
      adminApplicationsPath + '/' + id,
    );
    await expect(page.getByRole('alert')).toContainText('não está disponível');
    await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toHaveCount(0);
  }
  expect(api.posts).toHaveLength(0);
});

async function navigateTo(page: import('@playwright/test').Page, search: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, adminApplicationsPath + search);
}
// A guarda de sessão pode cancelar/repetir a leitura de entrada. A recuperação
// deve terminar num único destino, sem regressar à página que deixou de existir.
function expectPageRecovery(queries: string[], requested: string, destination: string) {
  const pages = queries.map((query) => new URLSearchParams(query).get('pagina'));
  expect(pages.filter((page, index) => page !== pages[index - 1])).toEqual([
    requested,
    destination,
  ]);
  expect(pages.filter((page) => page === destination)).toHaveLength(1);
}
test('página inexistente regressa à última página real preservando filtros sem ciclos', async ({
  page,
}) => {
  const { api } = await start(page, 25);
  await expect(
    page.getByRole('status').filter({ hasText: '25 candidaturas pendentes no total.' }),
  ).toBeVisible();
  api.queries.length = 0;
  await navigateTo(page, '?pagina=1000&porPagina=12&ordem=antigas&estado=pendente');
  await expect(page).toHaveURL(/pagina=3&porPagina=12&ordem=antigas&estado=pendente$/);
  await expect(page.locator('.admin-application-cards article')).toHaveCount(1);
  await expect(page.getByText('Página 3 de 3', { exact: true })).toBeVisible();
  await expect(page.locator('#admin-list-title')).toBeFocused();
  expectPageRecovery(api.queries, '1000', '3');
});
test('consulta sem resultados normaliza uma página antiga para a primeira sem perder o estado', async ({
  page,
}) => {
  const { api } = await start(page, 0);
  await expect(
    page.getByRole('status').filter({ hasText: '0 candidaturas pendentes no total.' }),
  ).toBeVisible();
  api.queries.length = 0;
  await navigateTo(page, '?pagina=1000&porPagina=24&ordem=antigas&estado=rejeitado');
  await expect(page).toHaveURL(/pagina=1&porPagina=24&ordem=antigas&estado=rejeitado$/);
  await expect(
    page.getByRole('heading', { name: 'Sem candidaturas para este estado.' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Paginação de candidaturas' })).toHaveCount(0);
  expectPageRecovery(api.queries, '1000', '1');
});
test('atualização com redução do total regressa à última página devolvida pelo serviço', async ({
  page,
}) => {
  const { api } = await start(page, 25);
  await navigateTo(page, '?pagina=3&porPagina=12&ordem=recentes&estado=pendente');
  await expect(page.locator('.admin-application-cards article')).toHaveCount(1);
  api.items = api.items.slice(0, 12);
  api.queries.length = 0;
  await page.getByRole('button', { name: 'Atualizar listagem', exact: true }).click();
  await expect(page).toHaveURL(/pagina=1&porPagina=12&ordem=recentes&estado=pendente$/);
  await expect(page.locator('.admin-application-cards article')).toHaveCount(12);
  await expect(page.getByRole('navigation', { name: 'Paginação de candidaturas' })).toHaveCount(0);
  expect(api.queries.map((query) => new URLSearchParams(query).get('pagina'))).toEqual(['3', '1']);
});
test('decidir a última candidatura da página preserva o filtro e regressa à página válida', async ({
  page,
}) => {
  const { api } = await start(page, 13);
  await navigateTo(page, '?pagina=2&porPagina=12&ordem=antigas&estado=pendente');
  await expect(page.locator('.admin-application-cards article')).toHaveCount(1);
  await page.getByRole('link', { name: /Consultar candidatura de/ }).click();
  await expect(page.getByRole('form', { name: 'Decidir candidatura' })).toBeVisible();
  await page.getByRole('button', { name: 'Aprovar candidatura', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
  await expect(page.locator('#admin-application-state')).toBeFocused();
  api.queries.length = 0;
  await page.getByRole('link', { name: '← Voltar à listagem' }).click();
  await expect(page).toHaveURL(/pagina=1&porPagina=12&ordem=antigas&estado=pendente$/);
  await expect(page.locator('.admin-application-cards article')).toHaveCount(12);
  expectPageRecovery(api.queries, '2', '1');
});
test('confirmações mantêm contraste durante foco hover active e envio desativado', async ({
  page,
}, info) => {
  const { api } = await start(page);
  await detail(page);
  await page.getByRole('button', { name: 'Aprovar candidatura', exact: true }).click();
  const dialog = page.getByRole('dialog'),
    cancel = dialog.getByRole('button', { name: 'Continuar análise' }),
    confirm = dialog.locator('button').last();
  await expect(cancel).toBeFocused();
  const evidence: { state: string; minimum: number }[] = [];
  async function sample(
    button: import('@playwright/test').Locator,
    state: string,
    action: () => Promise<unknown>,
  ) {
    const sampling = button.evaluate(async (element) => {
      const parse = (color: string) => {
        const values = color.match(/[\d.]+/g)!.map(Number);
        return [...values.slice(0, 3), values[3] ?? 1];
      };
      const over = (fg: number[], bg: number[]) =>
        [0, 1, 2].map((i) => fg[i]! * fg[3]! + bg[i]! * (1 - fg[3]!));
      const luminance = (color: number[]) =>
        color
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
      const ratios: number[] = [],
        start = performance.now();
      do {
        const chain: Element[] = [];
        let parent: Element | null = element;
        while (parent) {
          chain.unshift(parent);
          parent = parent.parentElement;
        }
        let background = [255, 255, 255];
        for (const node of chain)
          background = over(parse(getComputedStyle(node).backgroundColor), background);
        const foreground = over(parse(getComputedStyle(element).color), background),
          a = luminance(foreground),
          b = luminance(background);
        ratios.push((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      } while (performance.now() - start < 240);
      return ratios;
    });
    await action();
    const ratios = await sampling;
    evidence.push({ state, minimum: Math.min(...ratios) });
    expect(Math.min(...ratios), state).toBeGreaterThanOrEqual(4.5);
  }
  for (const [name, button] of [
    ['primary', confirm],
    ['secondary', cancel],
  ] as const) {
    await sample(button, name + ': normal', () => page.mouse.move(0, 0));
    await sample(button, name + ': hover', () => button.hover());
    await sample(button, name + ': focus', () => button.focus());
    await cancel.focus();
    if (name === 'secondary') await confirm.focus();
    await sample(button, name + ': focus-visible', () => page.keyboard.press('Tab'));
    await expect(button).toBeFocused();
    expect(
      await button.evaluate(
        (el) => el.matches(':focus-visible') && parseFloat(getComputedStyle(el).outlineWidth) >= 3,
      ),
    ).toBe(true);
  }
  await confirm.hover();
  await sample(confirm, 'primary: active', () => page.mouse.down());
  let release!: () => void;
  api.postGate = new Promise<void>((resolve) => (release = resolve));
  await page.mouse.up();
  await expect(confirm).toBeDisabled();
  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await sample(confirm, 'primary: disabled e hover', () => page.mouse.move(0, 0));
  expect(api.posts).toHaveLength(1);
  release();
  await expect(dialog).not.toBeVisible();
  await info.attach('contraste-estados', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
});
