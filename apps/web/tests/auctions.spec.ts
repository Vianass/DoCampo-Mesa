import { test, expect } from './support/test';
import { mockAccount, accountLogin } from './support/auth-fixtures';
const id = '123456789012345678901234';
const auction = {
  id,
  produtoId: id,
  produtor: { perfilId: id, nome: 'Horta fictícia' },
  titulo: 'Lote fictício de ensaio',
  descricao: 'Exclusivo dos testes de componentes.',
  lote: {
    nome: 'Tomates',
    quantidade: 500,
    unidadeVenda: {
      modalidade: 'peso',
      unidadeBase: 'g',
      quantidadeReferencia: 1000,
      quantidadeMinima: 250,
      incrementoCompra: 50,
    },
  },
  precoBaseCent: 1200,
  incrementoCent: 100,
  iniciaEm: new Date(Date.now() - 10000).toISOString(),
  terminaEm: new Date(Date.now() + 3600000).toISOString(),
  estado: 'ativo',
  licitacaoAtual: { valorCent: 1200, bidId: null },
  sequencia: 0,
  versao: 0,
  serverNow: new Date().toISOString(),
};
const pageDto = { itens: [auction], pagina: 1, porPagina: 12, total: 1, totalPaginas: 1 };
test('carregamento é acessível e erro pode ser repetido sem perder a navegação', async ({
  page,
}) => {
  let unblock!: () => void;
  const gate = new Promise<void>((r) => {
    unblock = r;
  });
  let failed = true;
  await page.route('**/api/auctions?*', async (route) => {
    await gate;
    await route.fulfill(
      failed
        ? { status: 503, json: { codigo: 'SERVICO_INDISPONIVEL', mensagem: 'Erro' } }
        : { json: pageDto },
    );
  });
  await page.goto('/leiloes');
  await expect(page.getByRole('status', { name: 'A carregar os leilões' })).toBeVisible();
  unblock();
  await expect(page.getByRole('alert')).toContainText('Não foi possível consultar');
  failed = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.locator('.auction-lot-card')).toHaveCount(1);
  await expect(page.locator('.auction-date-line time')).toHaveCount(2);
});
test('sem resultados e pesquisa sem correspondências distinguem a consulta da página', async ({
  page,
}) => {
  await page.route('**/api/auctions?*', (r) => r.fulfill({ json: pageDto }));
  await page.goto('/leiloes');
  await page.getByLabel('Pesquisar nesta página').fill('inexistente');
  await expect(
    page.getByText('Nenhum lote corresponde nesta página.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Limpar pesquisa', exact: true }).click();
  await expect(page.locator('.auction-lot-card')).toHaveCount(1);
  await page.route('**/api/auctions?*', (r) =>
    r.fulfill({ json: { ...pageDto, itens: [], total: 0, totalPaginas: 0 } }),
  );
  await page.getByLabel('Estado do leilão').selectOption('terminado');
  await expect(page.getByText('Ainda sem leilões nesta consulta.', { exact: true })).toBeVisible();
});
test('paginação REST não acrescenta parâmetros de pesquisa não suportados', async ({ page }) => {
  const requests: URL[] = [];
  await page.route('**/api/auctions?*', (r) => {
    const url = new URL(r.request().url());
    requests.push(url);
    const pagina = Number(url.searchParams.get('pagina') ?? 1);
    return r.fulfill({
      json: {
        itens: Array.from({ length: pagina === 1 ? 12 : 1 }, (_, i) => ({
          ...auction,
          id: (pagina * 20 + i).toString(16).padStart(24, '0'),
        })),
        pagina,
        porPagina: 12,
        total: 13,
        totalPaginas: 2,
      },
    });
  });
  await page.goto('/leiloes');
  await expect(page.locator('.auction-lot-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Página seguinte' }).click();
  await expect(page.locator('.auction-lot-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Página seguinte' })).toBeDisabled();
  expect(requests.at(-1)?.searchParams.get('pagina')).toBe('2');
  expect([...requests.at(-1)!.searchParams.keys()].sort()).toEqual([
    'ordem',
    'pagina',
    'porPagina',
  ]);
});
test('identificador inválido não inicia consulta privada', async ({ page }) => {
  let privateRequests = 0;
  await page.route('**/api/auctions/*', async (r) => {
    privateRequests++;
    await r.abort();
  });
  await page.goto('/leiloes/endereco-invalido');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Esta página não está no mercado.',
  );
  expect(privateRequests).toBe(0);
});
test('detalhe exige sessão e preserva destino de regresso ao login', async ({ page }) => {
  await page.goto('/leiloes/' + id);
  const login = page.getByRole('link', { name: 'Entrar para acompanhar', exact: true });
  await expect(login).toHaveAttribute(
    'href',
    '/entrar?destino=' + encodeURIComponent('/leiloes/' + id),
  );
  await expect(page.getByRole('button', { name: 'Confirmar oferta', exact: true })).toHaveCount(0);
});
test('área do comprador oferece acesso real e não inventa uma listagem das participações', async ({
  page,
}) => {
  await mockAccount(page);
  await accountLogin(page);
  await page.getByRole('link', { name: 'As minhas licitações', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Há colheitas que merecem a tua oferta.' }),
  ).toBeVisible();
  await expect(
    page.getByText(/Uma listagem global das tuas participações ainda não está disponível/),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Encontrar o próximo lote ↗' })).toHaveAttribute(
    'href',
    '/leiloes',
  );
});
