import { expect, test, type Page } from '@playwright/test';
import { producerReviews } from '../src/data/reviews';

async function enter(page: Page) {
  await page.goto('/entrar');
  await page.getByRole('button', { name: 'Explorar como comprador', exact: true }).click();
  await expect(page).toHaveURL(/\/area\/comprador$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('As tuas escolhas');
}
async function navigate(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function scenario(page: Page, value: string) {
  const details = page.locator('.buyer-data-note');
  if (!(await details.getAttribute('open'))) {
    if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
      await details.locator('summary').click();
  }
  await page.getByLabel('Cenário de demonstração').selectOption(value);
}
test('dashboard deriva indicadores, encomenda recente, participações e navegação', async ({
  page,
}) => {
  await enter(page);
  const summary = page.getByRole('definition').filter({ hasText: /^6$|^3$|^2$/ });
  await expect(page.locator('.buyer-summary dd')).toHaveText(['6', '3', '2', '2']);
  expect(await summary.count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('.buyer-dashboard-grid .buyer-order-card h3')).toHaveText('DCM-261015');
  await expect(page.locator('.buyer-dashboard-bids .buyer-bid')).toHaveCount(2);
  await expect(page.locator('.buyer-demo-note')).toContainText('sem atualizações em tempo real');
  await page.locator('.buyer-summary').getByRole('link', { name: 'Encomendas realizadas' }).click();
  await expect(page).toHaveURL(/\/encomendas$/);
  await expect(page.locator('.buyer-order-card')).toHaveCount(6);
});
test('encomendas mostram linhas, quantidades, produtores e totais corretos', async ({ page }) => {
  await enter(page);
  await page.getByRole('link', { name: 'Ver encomendas →', exact: true }).click();
  await expect(page.locator('.buyer-order-card')).toHaveCount(6);
  const recent = page.getByRole('article', { name: 'Encomenda DCM-261015', exact: true });
  await expect(recent).toContainText('Pera Rocha');
  await expect(recent).toContainText('Pomar do Vale');
  await expect(recent).toContainText('2 ×');
  await expect(recent).toContainText('2,40');
  await expect(recent.locator('footer')).toContainText('4,80');
  await expect(page.getByRole('button', { name: /Cancelar|Pagar|Confirmar entrega/ })).toHaveCount(
    0,
  );
});
test('filtros, ordenação e histórico funcionam sem alterar os dados', async ({ page }) => {
  await enter(page);
  await navigate(page, '/area/comprador/encomendas');
  await page.getByLabel('Filtrar por estado').selectOption('entregue');
  await expect(page.locator('.buyer-order-card h3')).toHaveText([
    'DCM-261010',
    'DCM-261008',
    'DCM-261006',
  ]);
  await page.getByLabel('Ordenar por data').selectOption('antigas');
  await expect(page.locator('.buyer-order-card h3')).toHaveText([
    'DCM-261006',
    'DCM-261008',
    'DCM-261010',
  ]);
  await page.goBack();
  await expect(page.getByLabel('Ordenar por data')).toHaveValue('recentes');
  await expect(page.locator('.buyer-order-card h3').first()).toHaveText('DCM-261010');
  await page.goBack();
  await expect(page.getByLabel('Filtrar por estado')).toHaveValue('todos');
  await expect(page.locator('.buyer-order-card')).toHaveCount(6);
  await navigate(page, '/area/comprador/encomendas?estado=cancelada&ordem=invalida');
  await expect(page.getByLabel('Filtrar por estado')).toHaveValue('todos');
  await expect(page.getByLabel('Ordenar por data')).toHaveValue('recentes');
});
test('detalhe preserva snapshots, grupos, subtotais e histórico sem ações de estado', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/area/comprador/encomendas');
  await page.getByRole('link', { name: 'Ver encomenda DCM-261010' }).click();
  await expect(page.getByRole('heading', { name: 'DCM-261010', exact: true })).toBeVisible();
  await expect(page.locator('.buyer-order-producer')).toHaveCount(1);
  await expect(page.locator('.buyer-order-line')).toHaveCount(2);
  await expect(page.locator('.buyer-order-line').first()).toContainText('2,50');
  await expect(page.locator('.buyer-order-line__total').first()).toContainText('5,00');
  await expect(page.locator('.buyer-order-producer > footer')).toContainText('6,45');
  await expect(page.locator('.buyer-order-total')).toContainText('6,45');
  await expect(page.locator('.buyer-order-history li strong')).toHaveText([
    'Pendente',
    'Confirmada',
    'Pronta',
    'Entregue',
  ]);
  await expect(page.getByRole('button', { name: /Alterar estado|Cancelar|Pagar/ })).toHaveCount(0);
  await page.getByRole('link', { name: '← Todas as encomendas' }).click();
  await expect(page.locator('.buyer-order-card')).toHaveCount(6);
});
test('IDs de encomenda e leilão inválidos oferecem recuperação', async ({ page }) => {
  await enter(page);
  await navigate(page, '/area/comprador/encomendas/inexistente');
  await expect(
    page.getByRole('heading', { name: 'Esta encomenda não está no teu percurso.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Voltar às encomendas' }).click();
  await expect(page.locator('.buyer-order-card')).toHaveCount(6);
  await navigate(page, '/area/comprador/licitacoes/inexistente');
  await expect(
    page.getByRole('heading', { name: 'Este leilão não está no teu percurso.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Voltar às licitações' }).click();
  await expect(page.locator('.buyer-bid')).toHaveCount(4);
});
test('avaliações identificam origem, classificação e ligação ao perfil público', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/area/comprador/avaliacoes');
  await expect(page.locator('.buyer-review')).toHaveCount(2);
  await expect(page.locator('.buyer-review .review-card__demo')).toHaveText([
    'Demonstração',
    'Demonstração',
  ]);
  await expect(page.getByLabel('5 de 5 estrelas')).toBeVisible();
  await expect(page.getByLabel('4 de 5 estrelas')).toBeVisible();
  await expect(page.locator('.buyer-review').first()).toContainText('Sem compra verificada');
  await page
    .locator('.buyer-review')
    .first()
    .getByRole('link', { name: 'Conhecer o produtor →' })
    .click();
  await expect(page).toHaveURL(/\/produtores\/horta-ribeira$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Horta da Ribeira');
});
test('criação demonstrativa exige entrega e classificação, sem alterar reviews públicas', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/area/comprador/avaliacoes');
  const form = page.getByRole('form', { name: 'Avaliação demonstrativa de produtor' });
  await expect(form.locator('select').first().locator('option')).toHaveText([
    'DCM-261006 · Forno da Aldeia',
  ]);
  await form.getByRole('button', { name: 'Acrescentar à demonstração' }).click();
  await expect(form.getByRole('alert')).toBeFocused();
  await expect(form.getByRole('alert')).toContainText('1 a 5');
  await page.getByLabel('Classificação', { exact: true }).selectOption('4');
  await page
    .getByLabel('Comentário (opcional)')
    .fill('Uma experiência inteiramente fictícia para o teste.');
  await form.getByRole('button', { name: 'Acrescentar à demonstração' }).click();
  await expect(page.locator('.buyer-review')).toHaveCount(3);
  await expect(page.locator('.buyer-review-feedback')).toContainText(
    'Não foi publicada no perfil público',
  );
  await expect(page.getByRole('form', { name: 'Avaliação demonstrativa de produtor' })).toHaveCount(
    0,
  );
  await page
    .locator('.buyer-review')
    .first()
    .getByRole('link', { name: 'Conhecer o produtor →' })
    .click();
  await expect(page).toHaveURL(/\/produtores\/forno-aldeia$/);
  await expect(page.locator('.review-card')).toHaveCount(
    producerReviews.filter((review) => review.producerId === 'forno-aldeia').length,
  );
  await page.getByRole('link', { name: 'Área de demonstração' }).click();
  await expect(page.locator('.buyer-summary dd').nth(2)).toHaveText('3');
  await page.getByRole('button', { name: 'Sair da demonstração' }).click();
  await page.getByRole('button', { name: 'Explorar como comprador', exact: true }).click();
  await expect(page.locator('.buyer-summary dd').nth(2)).toHaveText('2');
});
test('licitações mostram quatro situações estáticas e detalhe de lote sem envio de ofertas', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/area/comprador/licitacoes');
  await expect(page.locator('.buyer-bid')).toHaveCount(4);
  await expect(page.locator('.buyer-bid .status-badge')).toHaveText([
    'Licitação mais elevada',
    'Licitação ultrapassada',
    'Leilão terminado · outra oferta venceu',
    'Leilão ganho',
  ]);
  await expect(page.locator('.buyer-bid').first()).toContainText('317,00');
  await page
    .locator('.buyer-bid')
    .first()
    .getByRole('link', { name: /Ver detalhe do leilão/ })
    .click();
  await expect(page).toHaveURL(/\/licitacoes\/lote-cabazes$/);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Uma colheita para partilhar', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.buyer-auction-facts')).toContainText('280,00');
  await expect(page.locator('.buyer-auction-facts')).toContainText('10,00');
  await expect(page.getByRole('button', { name: /Licitar|Enviar oferta/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Conhecer os leilões públicos' }).click();
  await expect(page).toHaveURL(/\/leiloes$/);
});
test('cesta partilhada atualiza resumo e preserva produtos ao navegar e sair', async ({ page }) => {
  await page.goto('/produtos/tomate-coracao');
  await page.getByRole('button', { name: 'Adicionar Tomate coração-de-boi ao carrinho' }).click();
  await page.locator('.header-actions__login').click();
  await page.getByRole('button', { name: 'Explorar como comprador', exact: true }).click();
  const cart = page.getByRole('complementary', { name: 'A tua cesta, aqui ao lado.' });
  await expect(cart).toContainText('1 unidade');
  await expect(cart).toContainText('2,80');
  await cart.getByRole('link', { name: 'Continuar a explorar' }).click();
  await page.getByRole('button', { name: 'Adicionar Tomate coração-de-boi ao carrinho' }).click();
  await page.getByRole('link', { name: 'Área de demonstração' }).click();
  await expect(cart).toContainText('2 unidades');
  await expect(cart).toContainText('5,60');
  await cart.getByRole('link', { name: /Consultar a cesta/ }).click();
  await expect(page.locator('.cart-summary__total')).toContainText('5,60');
  await page.getByRole('link', { name: 'Área de demonstração' }).click();
  await page.getByRole('button', { name: 'Sair da demonstração' }).click();
  await page.getByRole('link', { name: '← Continuar pelo mercado' }).click();
  await expect(page.locator('.header-cart')).toHaveAttribute('aria-label', 'Carrinho, 2 unidades');
});
for (const role of ['produtor', 'administrador'] as const) {
  test(`${role} não recebe páginas nem dados do comprador`, async ({ page }) => {
    await page.goto('/entrar');
    await page.getByRole('button', { name: `Explorar como ${role}`, exact: true }).click();
    for (const path of [
      '/area/comprador',
      '/area/comprador/encomendas',
      '/area/comprador/encomendas/enc-261010',
      '/area/comprador/avaliacoes',
      '/area/comprador/licitacoes',
    ]) {
      await navigate(page, path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Este percurso pertence a outro papel.',
      );
      await expect(
        page.locator('.buyer-order-card, .buyer-review, .buyer-bid, .buyer-summary'),
      ).toHaveCount(0);
    }
  });
}
test('visitante é encaminhado e o comprador retoma o detalhe permitido', async ({ page }) => {
  await page.goto('/area/comprador/encomendas/enc-261010');
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await page.getByRole('button', { name: 'Explorar como comprador', exact: true }).click();
  await expect(page).toHaveURL(/\/area\/comprador\/encomendas\/enc-261010$/);
  await expect(page.getByRole('heading', { name: 'DCM-261010' })).toBeVisible();
});
const pages = [
  '/area/comprador',
  '/area/comprador/encomendas',
  '/area/comprador/encomendas/enc-261010',
  '/area/comprador/avaliacoes',
  '/area/comprador/licitacoes',
  '/area/comprador/licitacoes/lote-cabazes',
];
for (const path of pages) {
  test(`estados vazio, erro e recuperação em ${path}`, async ({ page }) => {
    await enter(page);
    await navigate(page, path);
    await scenario(page, 'vazio');
    if (path === '/area/comprador')
      await expect(page.locator('.buyer-summary dd')).toHaveText(['0', '0', '0', '0']);
    else await expect(page.locator('.buyer-page .empty-state')).toBeVisible();
    await scenario(page, 'erro');
    await expect(page.getByRole('alert')).toContainText('A atividade não pôde ser apresentada');
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('A atividade não pôde ser apresentada');
    await page.getByRole('button', { name: 'Voltar à atividade ilustrativa' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.buyer-page .empty-state')).toHaveCount(0);
    await expect(page.locator('h1')).toHaveCount(1);
  });
}
test('carregamento real do módulo de detalhe apresenta skeleton e recupera', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/src/pages/private/buyer/BuyerOrderDetailPage.tsx*', async (route) => {
    await gate;
    await route.continue();
  });
  await enter(page);
  try {
    await page.getByRole('link', { name: 'Ver encomenda DCM-261015' }).click();
    await expect(
      page.getByRole('status', { name: 'A carregar a área do comprador' }),
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByRole('heading', { name: 'DCM-261015' })).toBeVisible();
});
test('menu móvel permite navegar e criar uma avaliação por teclado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  const toggle = page.getByRole('button', { name: 'Abrir navegação da área' });
  await toggle.focus();
  await toggle.press('Enter');
  await page
    .getByRole('navigation', { name: 'Navegação da área de demonstração' })
    .getByRole('link', { name: /As minhas avaliações/ })
    .click();
  await expect(
    page.getByRole('navigation', { name: 'Navegação da área de demonstração' }),
  ).toBeHidden();
  await expect(page.locator('main')).toBeFocused();
  await page.getByLabel('Classificação', { exact: true }).selectOption('5');
  const submit = page.getByRole('button', { name: 'Acrescentar à demonstração' });
  await submit.focus();
  await submit.press('Enter');
  await expect(page.locator('.buyer-review')).toHaveCount(3);
});
for (const width of [320, 430, 768, 1024, 1280, 1440]) {
  test(`área do comprador legível e sem overflow a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await enter(page);
    for (const path of pages) {
      await navigate(page, path);
      const content: Record<string, string> = {
        '/area/comprador': '.buyer-summary',
        '/area/comprador/encomendas': '.buyer-order-filters',
        '/area/comprador/encomendas/enc-261010': '.buyer-order-detail',
        '/area/comprador/avaliacoes': '.buyer-review-form',
        '/area/comprador/licitacoes': '.buyer-bid-list',
        '/area/comprador/licitacoes/lote-cabazes': '.buyer-auction-facts',
      };
      await expect(page.locator(content[path] ?? '.buyer-page')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      for (const image of await page.locator('main img').all()) {
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
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main')).toHaveCount(1);
      const size = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(size.scroll).toBeLessThanOrEqual(size.client);
    }
    await scenario(page, 'erro');
    await expect(page.getByRole('alert')).toContainText('A atividade não pôde ser apresentada');
    const errorSize = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(errorSize.scroll).toBeLessThanOrEqual(errorSize.client);
    for (const button of await page.locator('.buyer-state-actions button').all()) {
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    }
    expect(errors).toEqual([]);
  });
}
