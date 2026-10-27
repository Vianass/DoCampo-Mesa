import { expect, test, type Page } from './support/test';
async function enter(page: Page) {
  await page.goto('/entrar');
  await page.getByRole('button', { name: 'Explorar como produtor', exact: true }).click();
  await expect(page.locator('.producer-metrics')).toBeVisible();
}
async function navigate(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function scenario(page: Page, value: string) {
  const details = page.locator('.producer-scenario');
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
    await details.locator('summary').click();
  await page.getByLabel('Cenário do produtor', { exact: true }).selectOption(value);
}
const routes = [
  ['/area/produtor', '.producer-metrics'],
  ['/area/produtor/candidatura', '.producer-application'],
  ['/area/produtor/produtos', '.producer-product-list'],
  ['/area/produtor/produtos/novo', 'form[aria-label="Criar produto demonstrativo"]'],
  ['/area/produtor/produtos/tomate-coracao', '.producer-product-detail'],
  [
    '/area/produtor/produtos/tomate-coracao/editar',
    'form[aria-label="Editar produto demonstrativo"]',
  ],
  ['/area/produtor/perfil', 'form[aria-label="Editar perfil demonstrativo"]'],
  ['/area/produtor/perfil/pre-visualizacao', '.producer-profile-preview'],
  ['/area/produtor/encomendas', '.producer-order-list'],
  ['/area/produtor/encomendas/enc-261010', '.producer-order-detail'],
  ['/area/produtor/leiloes', '.producer-auction-list'],
  ['/area/produtor/leiloes/lote-cabazes', '.producer-auction-detail'],
  ['/area/produtor/indicadores', '.producer-stock-attention'],
] as const;
test('dashboard mostra indicadores derivados, origem, encomendas recentes e atalhos', async ({
  page,
}) => {
  await enter(page);
  await expect(page.locator('.producer-metrics dd')).toHaveText(['13', '4', '1', '1']);
  await expect(page.locator('.producer-identity')).toContainText('Horta da Ribeira');
  await expect(page.locator('.producer-order-row')).toHaveCount(2);
  await expect(page.locator('.producer-stock-aside')).toContainText('1 indisponíveis');
  await expect(page.locator('.producer-activity')).toContainText('6,45');
  await page
    .locator('.producer-metrics')
    .getByRole('link', { name: 'Encomendas pendentes', exact: true })
    .click();
  await expect(page.locator('.producer-order-row')).toHaveCount(1);
});
test('candidatura apresenta dados etapas e pendência fictícia sem aprovação nem submissão', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/area/produtor/candidatura');
  await expect(page.locator('.producer-application')).toContainText('Pendente · exemplo fictício');
  await expect(page.locator('.producer-steps li')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /Submeter|Aprovar|Rejeitar/ })).toHaveCount(0);
  await expect(page.locator('.producer-application')).toContainText('Q04');
});
test('produtos próprios têm pesquisa combinada filtros URL e recuperação pelo histórico', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/area/produtor/produtos');
  await expect(page.locator('.producer-product-row')).toHaveCount(13);
  const search = page.getByLabel('Pesquisar os meus produtos');
  await search.pressSequentially('abóbora');
  await expect(search).toHaveValue('abóbora');
  await expect(page.locator('.producer-product-row')).toHaveCount(1);
  await page.getByLabel('Disponibilidade dos produtos').selectOption('reduzido');
  await expect(page).toHaveURL(/stock=reduzido/);
  await expect(page.locator('.producer-product-row')).toContainText('Abóbora-menina');
  await page.getByLabel('Categoria dos produtos').selectOption('Ervas e aromáticas');
  await expect(
    page.getByRole('heading', { name: 'Sem produtos para esta escolha.' }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.locator('.producer-product-row')).toHaveCount(1);
  await page.getByLabel('Pesquisar os meus produtos').fill('sem-correspondencia');
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page.locator('.producer-product-row')).toHaveCount(13);
  await navigate(page, '/area/produtor/produtos?stock=errado&categoria=inventada');
  await expect(page.getByLabel('Disponibilidade dos produtos')).toHaveValue('todos');
  await expect(page.locator('.producer-product-row')).toHaveCount(13);
});
test('detalhe privado reutiliza galeria e apresenta preço quantidade e estado do produto', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/area/produtor/produtos/tomate-coracao');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Tomate coração-de-boi', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.product-gallery')).toBeVisible();
  await expect(page.locator('.producer-product-detail')).toContainText('2,80');
  await expect(page.locator('.producer-product-detail')).toContainText('18 unidades comerciais');
  await page.getByRole('link', { name: 'Editar este produto' }).click();
  await expect(page.getByLabel('Nome do produto')).toHaveValue('Tomate coração-de-boi');
});
test('formulário valida campos e foca erros antes de criar um produto local sem publicação', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/area/produtor/produtos/novo');
  await page.getByRole('button', { name: 'Guardar produto na demonstração' }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('Nome do produto')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Nome do produto').fill('Nabos de exemplo');
  await page.getByLabel('Preço por unidade (€)', { exact: true }).fill('-1');
  await page.getByLabel('Quantidade disponível', { exact: true }).fill('1,5');
  await page.getByRole('button', { name: 'Guardar produto na demonstração' }).click();
  await expect(page.getByRole('alert')).toContainText('preço não negativo');
  await page.getByLabel('Preço por unidade (€)', { exact: true }).fill('2,35');
  await page.getByLabel('Quantidade disponível', { exact: true }).fill('6');
  await page.getByRole('button', { name: 'Guardar produto na demonstração' }).click();
  await expect(page.locator('.producer-feedback')).toContainText('apenas nesta demonstração');
  await expect(
    page.getByRole('button', { name: 'Guardar produto na demonstração' }),
  ).toBeDisabled();
  await page.getByRole('link', { name: 'Consultar o produto guardado →' }).click();
  await expect(page.locator('.producer-product-detail')).toContainText('Nabos de exemplo');
  await expect(page.locator('.product-gallery img').first()).toHaveAttribute(
    'src',
    '/images/product-placeholder.svg',
  );
  await page.getByRole('link', { name: 'Voltar aos produtos', exact: true }).click();
  await expect(page.locator('.producer-product-row')).toHaveCount(14);
  await navigate(page, '/produtos?pesquisa=Nabos');
  await expect(page.locator('.product-card')).toHaveCount(0);
  await page.getByRole('link', { name: 'Área de demonstração', exact: true }).click();
  await expect(page.locator('.producer-metrics dd').first()).toHaveText('14');
  await page.reload();
  await expect(page).toHaveURL(/\/entrar/);
  await page.getByRole('button', { name: 'Explorar como produtor', exact: true }).click();
  await expect(page.locator('.producer-metrics dd').first()).toHaveText('13');
});
test('edição de preço e stock recalcula alertas sem alterar o catálogo público ou encomendas', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/area/produtor/produtos/tomate-coracao/editar');
  await page.getByLabel('Preço por unidade (€)', { exact: true }).fill('9,95');
  await page.getByLabel('Quantidade disponível', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Guardar produto na demonstração' }).click();
  await expect(page.locator('.producer-feedback')).toContainText('Produto guardado');
  await navigate(page, '/area/produtor/indicadores');
  await expect(page.locator('.producer-metrics dd')).toHaveText(['277', '1', '2', '13']);
  await navigate(page, '/area/produtor/encomendas/enc-261010');
  await expect(page.locator('.producer-order-total')).toContainText('6,45');
  await expect(page.locator('.producer-order-lines')).toContainText('2,50');
  await navigate(page, '/produtos/ee685adf80156cb9e1e85c27');
  await expect(page.locator('main')).toContainText('2,80');
  await expect(
    page.getByRole('button', { name: 'Adicionar Tomate coração-de-boi ao carrinho' }),
  ).toBeEnabled();
});
test('limiar provisório é editável e preço zero mantém o significado demonstrativo', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/area/produtor/produtos/abobora-menina/editar');
  await page.getByLabel('Limiar de stock reduzido').fill('1');
  await page.getByLabel('Preço por unidade (€)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Guardar produto na demonstração' }).click();
  await expect(page.locator('.producer-feedback')).toContainText('Produto guardado');
  await navigate(page, '/area/produtor');
  await expect(page.locator('.producer-metrics dd').last()).toHaveText('0');
});
test('perfil valida e pré-visualiza apenas dados locais sem alterar a candidatura nem o perfil público', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/area/produtor/perfil');
  await page.getByLabel('Nome público', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Guardar perfil na demonstração' }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await page.getByLabel('Nome público', { exact: true }).fill('Horta de demonstração local');
  await page.getByLabel('Localidade', { exact: true }).fill('Viana do Castelo');
  await page
    .getByLabel('Descrição do produtor (opcional)')
    .fill('Uma descrição apenas nesta sessão.');
  await page.getByRole('button', { name: 'Guardar perfil na demonstração' }).click();
  await expect(page.locator('.producer-feedback')).toContainText('perfil público não foi alterado');
  await page.getByRole('link', { name: 'Pré-visualizar o perfil', exact: true }).click();
  await expect(page.locator('.producer-profile-preview h2').first()).toHaveText(
    'Horta de demonstração local',
  );
  await expect(page.locator('.producer-map')).toContainText('Viana do Castelo');
  await page.getByRole('link', { name: 'Explorar os perfis públicos' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Boas coisas começam com pessoas.',
  );
  await page.getByRole('link', { name: 'Área de demonstração', exact: true }).click();
  await expect(page.locator('.producer-identity')).toContainText('Horta de demonstração local');
  await navigate(page, '/area/produtor/candidatura');
  await expect(page.locator('.producer-application .status-badge')).toContainText('Pendente');
});
test('encomendas filtram estados e detalhe mantém linhas valores e histórico só de leitura', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/area/produtor/encomendas');
  await expect(page.locator('.producer-order-row')).toHaveCount(4);
  await page.getByLabel('Estado das encomendas recebidas').selectOption('entregue');
  await expect(page.locator('.producer-order-row')).toHaveCount(1);
  await page.getByRole('link', { name: 'Ver encomenda DCM-261010', exact: true }).click();
  await expect(page.locator('.producer-order-lines li')).toHaveCount(2);
  await expect(page.locator('.producer-order-total')).toContainText('6,45');
  await expect(page.locator('.producer-steps strong')).toHaveText([
    'Pendente',
    'Confirmada',
    'Pronta',
    'Entregue',
  ]);
  await expect(page.getByRole('button', { name: /Confirmar|Entregar|Cancelar|Pagar/ })).toHaveCount(
    0,
  );
  await page.goBack();
  await expect(page.getByLabel('Estado das encomendas recebidas')).toHaveValue('entregue');
});
test('IDs inválidos e recursos públicos de outros produtores têm recuperação privada', async ({
  page,
}) => {
  await enter(page);
  for (const [path, message] of [
    ['/area/produtor/produtos/pera-rocha', 'Este produto não está na tua produção.'],
    ['/area/produtor/produtos/inexistente/editar', 'Este produto não está na tua produção.'],
    ['/area/produtor/encomendas/enc-261015', 'Esta encomenda não pertence à tua produção.'],
    ['/area/produtor/leiloes/lote-peras', 'Este leilão não pertence à tua produção.'],
  ]) {
    await navigate(page, path as string);
    await expect(page.getByRole('heading', { name: message as string, exact: true })).toBeVisible();
  }
});
test('leilões mostram três estados e término sem ofertas não inventa vencedor', async ({
  page,
}) => {
  await enter(page);
  await navigate(page, '/area/produtor/leiloes');
  await expect(page.locator('.producer-auction-row')).toHaveCount(4);
  await expect(page.locator('.producer-auction-row .status-badge')).toHaveText([
    'Ativo',
    'Agendado',
    'Terminado',
    'Terminado',
  ]);
  await page
    .locator('.producer-auction-row')
    .last()
    .getByRole('link', { name: 'Consultar o lote →', exact: true })
    .click();
  await expect(page.locator('.producer-auction-result')).toContainText('Não existe vencedor');
  await expect(page.locator('.producer-auction-detail')).toContainText('20,00');
  await expect(
    page.getByRole('button', { name: /Licitar|Enviar oferta|Encerrar|Criar leilão/ }),
  ).toHaveCount(0);
  await navigate(page, '/area/produtor/leiloes/lote-colheita-entregue');
  await expect(page.locator('.producer-auction-result')).toContainText('62,00');
  await expect(page.locator('.producer-auction-result')).toContainText(
    'Não foi criada uma encomenda',
  );
});
test('saída e troca de papel repõem edições locais e preservam a cesta', async ({ page }) => {
  await page.goto('/produtos/ee685adf80156cb9e1e85c27');
  await page.getByRole('button', { name: 'Adicionar Tomate coração-de-boi ao carrinho' }).click();
  await page.locator('.header-actions__login').click();
  await page.getByRole('button', { name: 'Explorar como produtor', exact: true }).click();
  await navigate(page, '/area/produtor/produtos/tomate-coracao/editar');
  await page.getByLabel('Quantidade disponível', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Guardar produto na demonstração' }).click();
  await expect(page.locator('.producer-feedback')).toContainText('Produto guardado');
  await navigate(page, '/carrinho');
  await expect(page.locator('.cart-summary__total')).toContainText('2,80');
  await page.getByRole('link', { name: 'Área de demonstração', exact: true }).click();
  await page.getByRole('button', { name: 'Sair da demonstração' }).click();
  await page.getByRole('button', { name: 'Explorar como comprador', exact: true }).click();
  await expect(page.locator('.buyer-cart-summary')).toContainText('1 unidade');
  await page.getByRole('button', { name: 'Sair da demonstração' }).click();
  await page.getByRole('button', { name: 'Explorar como produtor', exact: true }).click();
  await navigate(page, '/area/produtor/produtos/tomate-coracao');
  await expect(page.locator('.producer-product-detail')).toContainText('18 unidades comerciais');
});
for (const role of ['comprador', 'administrador'] as const) {
  test(role + ' não acede às páginas do produtor', async ({ page }) => {
    await page.goto('/entrar');
    await page.getByRole('button', { name: 'Explorar como ' + role, exact: true }).click();
    for (const [path] of routes) {
      await navigate(page, path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Este percurso pertence a outro papel.',
      );
      await expect(page.locator('.producer-workspace')).toHaveCount(0);
    }
  });
}
test('visitante retoma detalhe e edição internos depois de escolher o papel compatível', async ({
  page,
}) => {
  await page.goto('/area/produtor/produtos/tomate-coracao/editar');
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await page.getByRole('button', { name: 'Explorar como produtor', exact: true }).click();
  await expect(page).toHaveURL(/\/area\/produtor\/produtos\/tomate-coracao\/editar$/);
  await expect(page.getByLabel('Preço por unidade (€)', { exact: true })).toHaveValue('2,80');
});
test('loading real do módulo não deixa a área em branco', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/src/pages/private/producer/ProducerProductPage.tsx*', async (route) => {
    await gate;
    await route.continue();
  });
  await enter(page);
  try {
    await navigate(page, '/area/produtor/produtos/novo');
    await expect(
      page.getByRole('status', { name: 'A carregar a área do produtor', exact: true }),
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByLabel('Nome do produto')).toBeVisible();
});
for (const [path, content] of routes) {
  test('cenários vazio erro e recuperação em ' + path, async ({ page }) => {
    await enter(page);
    await navigate(page, path);
    await expect(page.locator(content)).toBeVisible();
    await scenario(page, 'vazio');
    if (path === '/area/produtor')
      await expect(page.locator('.producer-metrics dd')).toHaveText(['0', '0', '0', '0']);
    else if (/\/produtos\/tomate|\/encomendas\/enc-|\/leiloes\/lote-/.test(path))
      await expect(page.locator('.producer-workspace .empty-state')).toBeVisible();
    else if (
      path === '/area/produtor/produtos' ||
      path === '/area/produtor/encomendas' ||
      path === '/area/produtor/leiloes'
    )
      await expect(page.locator('.producer-workspace .empty-state')).toBeVisible();
    else await expect(page.locator(content)).toBeVisible();
    await scenario(page, 'erro');
    await expect(page.getByRole('alert')).toContainText('A produção precisa de uma nova tentativa');
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Voltar à atividade ilustrativa' }).click();
    await expect(page.locator(content)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
test('menu e formulário funcionam por teclado em telemóvel com movimento reduzido', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  const toggle = page.getByRole('button', { name: 'Abrir navegação da área', exact: true });
  await toggle.focus();
  await toggle.press('Enter');
  await page
    .getByRole('navigation', { name: 'Navegação da área de demonstração' })
    .getByRole('link', { name: /Os meus produtos/ })
    .click();
  await expect(page.locator('main')).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('link', { name: 'Criar produto demonstrativo', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar produto na demonstração' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toBeFocused();
});
for (const width of [320, 430, 768, 1024, 1280, 1440]) {
  test('produção sem overflow e com controlos acessíveis a ' + width + 'px', async ({ page }) => {
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
                (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0,
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
    }
    await scenario(page, 'erro');
    await expect(page.getByRole('alert')).toBeVisible();
    for (const button of await page.locator('.producer-actions button').all()) {
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
