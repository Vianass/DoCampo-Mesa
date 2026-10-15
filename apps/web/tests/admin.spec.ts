import { expect, test, type Page } from '@playwright/test';
const home = '/area/administrador';
async function enter(page: Page, role = 'administrador') {
  await page.goto('/entrar');
  await page.getByRole('button', { name: 'Explorar como ' + role, exact: true }).click();
  await expect(
    page.locator(
      role === 'administrador'
        ? '.admin-metrics'
        : role === 'produtor'
          ? '.producer-metrics'
          : '.buyer-summary',
    ),
  ).toBeVisible();
}
async function navigate(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function scenario(page: Page, value: string) {
  const details = page.locator('.admin-scenario');
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
    await details.locator('summary').click();
  await page.getByLabel('Cenário administrativo', { exact: true }).selectOption(value);
}
async function decide(page: Page, value: string) {
  await page.getByLabel('Decisão demonstrativa', { exact: true }).selectOption(value);
  await page.getByRole('button', { name: /Simular decisão de/ }).click();
  await expect(page.locator('.admin-decision-record')).toBeVisible();
}
const routes = [
  [home, '.admin-metrics'],
  [home + '/candidaturas', '.admin-producer-list'],
  [home + '/candidaturas/horta-ribeira', '.admin-producer-detail'],
  [home + '/produtores', '.admin-producer-list'],
  [home + '/produtores/pomar-vale', '.admin-producer-detail'],
  [home + '/utilizadores', '.admin-user-list'],
  [home + '/utilizadores/comprador-demonstracao', '.admin-user-detail'],
  [home + '/encomendas', '.admin-order-list'],
  [home + '/encomendas/enc-261010', '.admin-order-detail'],
  [home + '/moderacao', '.admin-review-list'],
  [home + '/moderacao/denuncia-1', '.admin-review-detail'],
  [home + '/leiloes', '.admin-auction-list'],
  [home + '/leiloes/lote-cabazes', '.admin-auction-detail'],
  [home + '/servicos', '.admin-services'],
] as const;

test('dashboard deriva seis indicadores e apresenta filas pendentes e serviços não observados', async ({
  page,
}) => {
  await enter(page);
  await expect(page.locator('.admin-metrics dd')).toHaveText(['10', '7', '2', '8', '3', '2']);
  await expect(page.locator('.admin-dashboard-grid')).toContainText(
    '2 pendentes · 3 avaliações denunciadas',
  );
  await expect(page.locator('.admin-aside')).toContainText(
    'monitorização real não está implementada',
  );
  await page.locator('.admin-metrics').getByRole('link', { name: 'Leilões ativos' }).click();
  await expect(page.locator('.admin-auction-list > li')).toHaveCount(2);
});
test('produtores combinam pesquisa filtros URL histórico e recuperação', async ({ page }) => {
  await enter(page);
  await navigate(page, home + '/produtores');
  await expect(page.locator('.admin-producer-list > li')).toHaveCount(7);
  await page.getByLabel('Pesquisar produtores').pressSequentially('HORTA');
  await expect(page.getByLabel('Pesquisar produtores')).toHaveValue('HORTA');
  await expect(page.locator('.admin-producer-list > li')).toHaveCount(1);
  await page.getByLabel('Estado de produtores').selectOption('aprovado');
  await expect(page.locator('.empty-state')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.admin-producer-list > li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page.locator('.admin-producer-list > li')).toHaveCount(7);
  await navigate(page, home + '/produtores?estado=__proto__');
  await expect(page.getByLabel('Estado de produtores')).toHaveValue('todos');
});
test('candidatura valida escolha foca erro e aprova apenas na sessão com registo', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, home + '/candidaturas/horta-ribeira');
  await expect(page.locator('.producer-map')).toBeVisible();
  await page.getByRole('button', { name: 'Simular decisão de candidatura' }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await page.getByLabel('Decisão demonstrativa', { exact: true }).selectOption('aprovado');
  await page.getByLabel('Motivo da decisão (opcional)').fill('x'.repeat(501));
  await page.getByRole('button', { name: 'Simular decisão de candidatura' }).click();
  await expect(page.getByRole('alert')).toContainText('500');
  await page.getByLabel('Motivo da decisão (opcional)').fill('Dados fictícios revistos.');
  await decide(page, 'aprovado');
  await expect(page.locator('.admin-producer-detail')).toContainText('Aprovado · simulado');
  await expect(page.locator('.admin-decision-record')).toContainText('Dados fictícios revistos.');
  await expect(page.getByRole('button', { name: 'Simular decisão de candidatura' })).toHaveCount(0);
  await navigate(page, home);
  await expect(page.locator('.admin-metrics dd').nth(2)).toHaveText('1');
});
test('rejeição e aprovação sucessivas preservam ambas e não mudam permissões', async ({ page }) => {
  await enter(page);
  await navigate(page, home + '/candidaturas/horta-ribeira');
  await decide(page, 'rejeitado');
  await navigate(page, home + '/candidaturas/pomar-sul');
  await decide(page, 'aprovado');
  await navigate(page, home + '/produtores?estado=rejeitado');
  await expect(page.locator('.admin-producer-list > li')).toHaveCount(2);
  await navigate(page, home + '/utilizadores/produtor-horta-ribeira');
  await expect(page.locator('.admin-user-detail .status-badge')).toHaveText('Produtor');
});
test('decisões sobrevivem a navegação pública e repõem-se ao mudar cenário ou recarregar', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, home + '/candidaturas/horta-ribeira');
  await decide(page, 'aprovado');
  await page.getByRole('link', { name: 'Consultar perfil público de referência' }).click();
  await expect(page.locator('.producer-story-section')).toBeVisible();
  await page.getByRole('link', { name: 'Área de demonstração', exact: true }).click();
  await expect(page.locator('.admin-metrics dd').nth(2)).toHaveText('1');
  await scenario(page, 'vazio');
  await scenario(page, 'normal');
  await expect(page.locator('.admin-metrics dd').nth(2)).toHaveText('2');
  await navigate(page, home + '/candidaturas/horta-ribeira');
  await decide(page, 'rejeitado');
  await page.reload();
  await expect(page).toHaveURL(/\/entrar/);
  await page.getByRole('button', { name: 'Explorar como administrador', exact: true }).click();
  await expect(page.locator('.admin-decision-form')).toBeVisible();
});
test('utilizadores permitem pesquisa papéis e consulta sem ações de segurança', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, home + '/utilizadores');
  await page.getByLabel('Papel dos utilizadores').selectOption('produtor');
  await expect(page.locator('.admin-user-list > li')).toHaveCount(7);
  await page.getByLabel('Pesquisar utilizadores').fill('Horta');
  await expect(page.locator('.admin-user-list > li')).toHaveCount(1);
  await page.getByRole('link', { name: 'Consultar utilizador', exact: true }).click();
  await expect(page.locator('.admin-user-detail')).toContainText('produtor-horta-ribeira');
  await page.getByRole('link', { name: 'Consultar produtor associado' }).click();
  await expect(page.locator('.admin-producer-detail h2')).toHaveText('Horta da Ribeira');
  await expect(page.getByRole('button', { name: /Eliminar|Permissões|Bloquear/ })).toHaveCount(0);
});
test('encomendas globais filtram e preservam preços históricos totais e quatro estados', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, home + '/encomendas');
  await expect(page.locator('.admin-order-list > li')).toHaveCount(8);
  await page.getByLabel('Estado de encomendas').selectOption('entregue');
  await page.getByLabel('Pesquisar encomendas').fill('Horta');
  await expect(page.locator('.admin-order-list > li')).toHaveCount(1);
  await page.getByRole('link', { name: 'Consultar encomenda', exact: true }).click();
  await expect(page.locator('.admin-order-detail')).toContainText('DCM-261010');
  await expect(page.locator('.admin-total')).toContainText('6,45');
  await expect(page.locator('.admin-order-lines > li')).toHaveCount(2);
  await expect(page.locator('.admin-order-lines')).toContainText('2,50');
  await expect(page.locator('.admin-history > li')).toHaveCount(4);
  await expect(page.getByRole('button', { name: /Confirmar|Entregar|Cancelar/ })).toHaveCount(0);
});
test('moderação oculta e mantém sem mudar texto classificação ou avaliações públicas', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/produtores/horta-ribeira');
  await expect(page.locator('.producer-story-section')).toBeVisible();
  const publicBefore = await page.locator('.review-card').allTextContents();
  await navigate(page, home + '/moderacao/denuncia-1');
  await expect(page.locator('.admin-review-detail')).toContainText(
    '2 sinalizações para uma avaliação',
  );
  const reviewBefore = await page.locator('.review-card').textContent();
  await decide(page, 'oculta');
  await expect(page.locator('.admin-review-detail')).toContainText('Oculta · simulado');
  expect(await page.locator('.review-card').textContent()).toBe(reviewBefore);
  await navigate(page, home + '/moderacao/denuncia-2');
  await decide(page, 'mantida');
  await navigate(page, home);
  await expect(page.locator('.admin-metrics dd').nth(4)).toHaveText('3');
  await expect(page.locator('.admin-dashboard-grid')).toContainText(
    '0 pendentes · 3 avaliações denunciadas',
  );
  await navigate(page, '/produtores/horta-ribeira');
  await expect(page.locator('.producer-story-section')).toBeVisible();
  expect(await page.locator('.review-card').allTextContents()).toEqual(publicBefore);
});
test('moderação pesquisa filtra e apresenta decisão anterior sem reabrir', async ({ page }) => {
  await enter(page);
  await navigate(page, home + '/moderacao');
  await expect(page.locator('.admin-review-list > li')).toHaveCount(3);
  await page.getByLabel('Estado de avaliações denunciadas').selectOption('mantida');
  await expect(page.locator('.admin-review-list > li')).toHaveCount(1);
  await page.getByRole('link', { name: 'Consultar denúncia', exact: true }).click();
  await expect(page.locator('.admin-decision-record')).toBeVisible();
  await expect(page.locator('.admin-decision-form')).toHaveCount(0);
});
test('leilões distinguem agendados ativos terminados sem ofertas e produto associado', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, home + '/leiloes');
  await expect(page.locator('.admin-auction-list > li')).toHaveCount(7);
  await page.getByLabel('Estado de leilões').selectOption('agendado');
  await expect(page.locator('.admin-auction-list > li')).toHaveCount(1);
  await page.getByRole('link', { name: 'Consultar leilão', exact: true }).click();
  await expect(page.locator('.admin-auction-detail')).toContainText('Ainda sem ofertas.');
  await expect(page.locator('.admin-auction-detail')).toContainText('45,00');
  await navigate(page, home + '/leiloes/lote-sem-ofertas');
  await expect(page.locator('.admin-auction-result')).toHaveText(
    'Terminado sem ofertas e sem vencedor.',
  );
  await navigate(page, home + '/leiloes/lote-mel');
  await expect(page.locator('.admin-auction-result')).toContainText('62,00');
  await expect(page.getByRole('link', { name: 'Mel multifloral', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Licitar|Encerrar|Adjudicar/ })).toHaveCount(0);
});
test('serviços mostram cinco estados reais não observados e exemplos claramente simulados sem rede', async ({
  page,
}) => {
  await enter(page);
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:5173') && !request.url().startsWith('data:'))
      external.push(request.url());
  });
  await navigate(page, home + '/servicos');
  await expect(page.locator('.admin-services > li')).toHaveCount(5);
  await expect(page.locator('.admin-services h2')).toHaveText([
    'API',
    'Socket.io',
    'MongoDB Atlas',
    'Blob Storage',
    'Swagger UI',
  ]);
  await expect(page.locator('.admin-service-real strong')).toHaveText(
    Array(5).fill('Estado real: não monitorizado'),
  );
  await expect(page.locator('.admin-services h3')).toHaveText(Array(5).fill('Exemplo simulado'));
  expect(external).toEqual([]);
});
test('IDs inválidos recuperam em todas as entidades sem decisões e caminhos desconhecidos têm saída', async ({
  page,
}) => {
  await enter(page);
  for (const section of [
    'candidaturas',
    'produtores',
    'utilizadores',
    'encomendas',
    'moderacao',
    'leiloes',
  ]) {
    await navigate(page, home + '/' + section + '/nao-existe');
    await expect(
      page.getByRole('heading', { name: 'Este registo não está disponível.' }),
    ).toBeVisible();
    await expect(page.locator('.admin-decision-form')).toHaveCount(0);
    await page.getByRole('link', { name: 'Voltar à listagem' }).click();
    await expect(page.locator('.admin-list')).toBeVisible();
  }
  await navigate(page, home + '/inexistente/outra');
  await expect(page.getByRole('link', { name: 'Voltar à visão geral' })).toBeVisible();
});
for (const role of ['comprador', 'produtor'])
  test('papel ' + role + ' não acede aos 14 percursos administrativos', async ({ page }) => {
    await enter(page, role);
    for (const [path] of routes) {
      await navigate(page, path);
      await expect(page.locator('.private-unavailable')).toBeVisible();
      await expect(page.locator('.admin-workspace')).toHaveCount(0);
    }
  });
test('visitante retoma detalhes administrativos apenas com papel compatível', async ({ page }) => {
  await page.goto(home + '/moderacao/denuncia-1');
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await page.getByRole('button', { name: 'Explorar como administrador', exact: true }).click();
  await expect(page.locator('.admin-review-detail')).toBeVisible();
});
test('carrinho e área do produtor ficam isolados das decisões administrativas', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/produtos/tomate-coracao');
  await page
    .getByRole('button', { name: 'Adicionar Tomate coração-de-boi ao carrinho', exact: true })
    .click();
  await navigate(page, home + '/candidaturas/horta-ribeira');
  await decide(page, 'rejeitado');
  await navigate(page, '/carrinho');
  await expect(page.locator('.cart-line')).toHaveCount(1);
  await navigate(page, home);
  await page.getByRole('button', { name: 'Sair da demonstração' }).click();
  await page.getByRole('button', { name: 'Explorar como produtor', exact: true }).click();
  await navigate(page, '/area/produtor/candidatura');
  await expect(page.locator('.producer-application')).toContainText('Pendente');
  await navigate(page, '/area/produtor/produtos/tomate-coracao');
  await expect(page.locator('.producer-product-detail')).toContainText('2,80');
});
test('loading usa Suspense real antes de apresentar o módulo administrativo', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/src/pages/private/admin/AdminServicesPage.tsx*', async (route) => {
    await gate;
    await route.continue();
  });
  await enter(page);
  try {
    await navigate(page, home + '/servicos');
    await expect(
      page.getByRole('status', { name: 'A carregar a área administrativa', exact: true }),
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(page.locator('.admin-services')).toBeVisible();
});
for (const [path, content] of routes)
  test('cenários administrativos vazio erro e recuperação em ' + path, async ({ page }) => {
    await enter(page);
    await navigate(page, path);
    await expect(page.locator(content)).toBeVisible();
    await scenario(page, 'vazio');
    if (path === home)
      await expect(page.locator('.admin-metrics dd')).toHaveText(Array(6).fill('0'));
    else await expect(page.locator('.admin-workspace .empty-state')).toBeVisible();
    await scenario(page, 'erro');
    await expect(page.getByRole('alert')).toContainText(
      'A supervisão precisa de uma nova tentativa',
    );
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Voltar à atividade ilustrativa' }).click();
    await expect(page.locator(content)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
test('navegação móvel teclado Escape e decisão com foco acessível', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  const toggle = page.getByRole('button', { name: 'Abrir navegação da área', exact: true });
  await toggle.focus();
  await toggle.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Fechar navegação da área', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await toggle.press('Enter');
  await page
    .getByRole('navigation', { name: 'Navegação da área de demonstração' })
    .getByRole('link', { name: 'Candidaturas', exact: true })
    .click();
  await expect(page.locator('main')).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('link', { name: 'Consultar candidatura', exact: true }).first().click();
  const button = page.getByRole('button', { name: 'Simular decisão de candidatura' });
  await button.focus();
  await button.press('Enter');
  await expect(page.getByRole('alert')).toBeFocused();
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(
    '14 percursos administrativos sem overflow e com ações acessíveis a ' + width + 'px',
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await enter(page);
      for (const [path, content] of routes) {
        await navigate(page, path);
        await expect(page.locator(content)).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        for (const image of await page.locator('main img').all()) {
          await image.scrollIntoViewIfNeeded();
          await expect
            .poll(() =>
              image.evaluate(
                (node) =>
                  (node as HTMLImageElement).complete &&
                  (node as HTMLImageElement).naturalWidth > 0,
              ),
            )
            .toBe(true);
        }
        await expect(page.locator('h1')).toHaveCount(1);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        ).toBe(true);
        for (const control of await page
          .locator(
            '.admin-workspace .market-button, .admin-workspace input, .admin-workspace select',
          )
          .all())
          if (await control.isVisible()) {
            const box = await control.boundingBox();
            expect(box?.height).toBeGreaterThanOrEqual(44);
            expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width + 1);
          }
      }
      expect(errors).toEqual([]);
    },
  );
