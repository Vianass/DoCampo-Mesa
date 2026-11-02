import { test, expect } from './support/test';
import { mockAccount, accountLogin } from './support/auth-fixtures';
import { productDtos } from './support/catalog-fixtures';
import { accountDestination } from '../src/features/private-area/navigation';
import {
  parseOwnReport,
  parseAdminReport,
  parseContentHistory,
  parseEvidence,
  parseVisibility,
} from '../src/features/moderation/contracts';
const id = '000000000000000000001101',
  target = productDtos[0]!.id,
  date = '2026-11-01T10:00:00Z';
const own = {
  id,
  alvoTipo: 'produto',
  alvoId: target,
  motivo: 'Rever a fotografia.',
  estado: 'pendente',
  criadaEm: date,
  atualizadaEm: date,
};
test('contrato do autor elimina campos administrativos e exige estados válidos', () => {
  const result = parseOwnReport({
    ...own,
    autorId: id,
    historico: ['privado'],
    passwordHash: 'fixture',
  });
  expect(result).toEqual(own);
  expect(() => parseOwnReport({ ...own, estado: 'em_analise' })).toThrow();
  expect(() => parseOwnReport({ ...own, alvoId: '//external.invalid' })).toThrow();
});
test('conteúdo antigo mantém visibilidade e estados inválidos são rejeitados', () => {
  expect(parseVisibility(undefined)).toBe('visivel');
  expect(parseVisibility('oculta')).toBe('oculta');
  expect(() => parseVisibility('aprovado')).toThrow();
});
test('denúncia concluída exige histórico e contexto de decisão', () => {
  const item = {
    ...own,
    estado: 'resolvida',
    autorId: id,
    evidencia: { nome: 'Produto', descricao: 'Original', imagens: [] },
    versao: 1,
    historico: [
      {
        administradorId: id,
        ocorridoEm: date,
        anterior: 'pendente',
        estado: 'resolvida',
        motivo: 'Revisão concluída.',
        versao: 1,
      },
    ],
  };
  expect(() => parseAdminReport(item)).toThrow();
  expect(
    parseAdminReport({
      ...item,
      conteudoNaDecisao: { disponivel: true, estado: 'oculta', versao: 1 },
    }).conteudoNaDecisao?.estado,
  ).toBe('oculta');
});
test('evidência rejeita URLs executáveis, credenciais e mais de duas fotografias', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,test',
    'https://fixture:fixture@example.invalid/photo',
  ])
    expect(() => parseEvidence({ nome: 'Produto', descricao: '', imagens: [{ url }] })).toThrow();
  expect(() =>
    parseEvidence({
      nome: 'Produto',
      descricao: '',
      imagens: Array(3).fill({ url: 'https://example.invalid/photo' }),
    }),
  ).toThrow();
});
test('histórico rejeita estados comerciais e versões incoerentes', () => {
  expect(() =>
    parseContentHistory({
      itens: [
        {
          administradorId: id,
          ocorridoEm: date,
          anterior: 'visivel',
          estado: 'aprovado',
          motivo: 'Rever',
          versao: 1,
        },
      ],
      pagina: 1,
      porPagina: 12,
      total: 1,
      totalPaginas: 1,
      versao: 1,
    }),
  ).toThrow();
});
for (const path of ['/produtos/' + target, '/produtores/' + target])
  test('regresso interno seguro após login: ' + path.split('/')[1], () => {
    expect(accountDestination(path, ['comprador'])).toBe(path);
  });
test('destinos administrativos novos exigem papel e não aceitam redirecionamentos externos', () => {
  const path = '/area/administrador/moderacao/denuncias/' + id;
  expect(accountDestination(path, ['administrador'])).toBe(path);
  expect(accountDestination(path, ['comprador'])).toBe('/area/comprador');
  for (const raw of [
    'https://external.invalid',
    '//external.invalid',
    '/produtos/../../admin',
    '/area/administrador/moderacao/denuncias?next=https://external.invalid',
  ])
    expect(accountDestination(raw, ['comprador'])).toBe('/area/comprador');
});
test('visitante encontra entrada para denunciar sem formulário anónimo', async ({ page }) => {
  await page.goto('/produtos/' + target);
  await expect(
    page.getByRole('link', { name: 'Entrar para denunciar este produto', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Motivo da denúncia', { exact: true })).toHaveCount(0);
});
test('denúncia confirma motivo e recupera resposta incerta sem segundo envio', async ({ page }) => {
  await mockAccount(page);
  let saved = false,
    posts = 0;
  await page.route('**/api/me/content-reports**', (route) =>
    route.fulfill({ json: { denuncia: saved ? own : null } }),
  );
  await page.route('**/api/content-reports', async (route) => {
    posts++;
    saved = true;
    expect(route.request().postDataJSON()).toEqual({
      alvoTipo: 'produto',
      alvoId: target,
      motivo: own.motivo,
    });
    await route.abort('failed');
  });
  await accountLogin(page);
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, '/produtos/' + target);
  await page.getByRole('button', { name: 'Denunciar este produto', exact: true }).click();
  await expect(page.getByLabel('Motivo da denúncia', { exact: true })).toBeEnabled();
  await page.getByLabel('Motivo da denúncia', { exact: true }).fill(own.motivo);
  await page.getByRole('button', { name: 'Rever denúncia', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(own.motivo);
  await page.getByRole('button', { name: 'Confirmar denúncia', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Consulta a tua denúncia');
  await expect(page.getByRole('button', { name: 'Rever denúncia', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Consultar a minha denúncia', exact: true }).click();
  await expect(
    page.getByText('A tua denúncia está registada · Pendente.', { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
});
test('admin vê estados vazios e identificadores inválidos sem pedidos de escrita', async ({
  page,
}) => {
  const auth = await mockAccount(page);
  auth.roles = ['administrador'];
  let writes = 0;
  await page.route('**/api/admin/content-reports**', async (route) => {
    if (route.request().method() !== 'GET') writes++;
    await route.fulfill({
      json: { itens: [], pagina: 1, porPagina: 12, total: 0, totalPaginas: 0 },
    });
  });
  await accountLogin(page);
  await page.evaluate(() => {
    history.pushState(null, '', '/area/administrador/moderacao/denuncias');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(
    page.getByRole('heading', { name: 'Nenhum resultado nesta consulta.', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Estado da denúncia', { exact: true }).selectOption('pendente');
  await expect(page).toHaveURL(/estado=pendente/);
  await page.evaluate(() => {
    history.pushState(null, '', '/area/administrador/moderacao/denuncias/invalid');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(
    page.getByRole('heading', { name: 'Este percurso não está disponível.', exact: true }),
  ).toBeVisible();
  expect(writes).toBe(0);
});
