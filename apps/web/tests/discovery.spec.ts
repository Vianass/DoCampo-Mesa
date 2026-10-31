import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { producerDtos, productDtos, envelope } from './support/catalog-fixtures';
import { parsePublicLocation, mapLink } from '../src/features/discovery/location';
import { parseProducer } from '../src/features/api/catalog-contract';
const id = '123456789012345678901234';
function auction(overrides: Record<string, unknown> = {}) {
  return {
    id,
    produtoId: productDtos[0]!.id,
    produtor: { perfilId: producerDtos[0]!.id, nome: 'Origem em destaque' },
    titulo: 'Lote real recebido pela API',
    descricao: 'Descrição de ensaio',
    lote: {
      nome: 'Colheita de ensaio',
      quantidade: 500,
      unidadeVenda: {
        modalidade: 'peso',
        unidadeBase: 'g',
        quantidadeMinima: 250,
        incrementoCompra: 50,
        quantidadeReferencia: 1000,
      },
    },
    precoBaseCent: 1200,
    incrementoCent: 100,
    iniciaEm: new Date(Date.now() - 60000).toISOString(),
    terminaEm: new Date(Date.now() + 3600000).toISOString(),
    estado: 'ativo',
    licitacaoAtual: { valorCent: 1200, bidId: null },
    sequencia: 0,
    versao: 1,
    serverNow: new Date().toISOString(),
    ...overrides,
  };
}
const location = {
  latitude: 41.69,
  longitude: -8.83,
  descricao: 'Ponto público autorizado de ensaio',
};
async function profile(page: Page, p: unknown = location) {
  const producer = producerDtos[0]!;
  await page.route('**/api/producers/' + producer.id + '*', (r) =>
    r.fulfill({
      json: {
        ...producer,
        ...(p === undefined ? {} : { localizacaoPublica: p }),
        produtos: envelope([], new URLSearchParams()),
      },
    }),
  );
  await page.goto('/produtores/' + producer.id);
  return producer;
}
test('coordenadas válidas não são inferidas da localidade e links não transportam outros dados', () => {
  expect(parsePublicLocation(location)).toEqual(location);
  expect(mapLink(location)).toContain('https://www.openstreetmap.org/');
  expect(mapLink(location)).not.toContain(location.descricao);
  expect(parseProducer(producerDtos[0]).localizacaoPublica).toBeUndefined();
});
for (const p of [
  { ...location, latitude: 91 },
  { ...location, longitude: -181 },
  { ...location, latitude: '41' },
  { ...location, descricao: '' },
  { ...location, latitude: NaN },
])
  test('recusa localização pública malformada ' + JSON.stringify(p), () =>
    expect(() => parsePublicLocation(p)).toThrow(),
  );
test('mapa pede escolha antes de transmitir coordenadas; teclado e alternativa textual', async ({
  page,
}) => {
  let tiles = 0;
  await page.route('https://tile.openstreetmap.org/**', (r) => {
    tiles++;
    return r.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWpQAAAAASUVORK5CYII=',
        'base64',
      ),
    });
  });
  await profile(page);
  await expect(page.getByRole('heading', { name: location.descricao, exact: true })).toBeVisible();
  expect(tiles).toBe(0);
  const open = page.getByRole('button', { name: 'Mostrar mapa OpenStreetMap', exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  expect(tiles).toBeGreaterThan(0);
  const region = page.getByRole('region', { name: 'Mapa do ponto público: ' + location.descricao });
  await region.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Tab');
  await expect(region).not.toBeFocused();
  await expect(page.getByRole('button', { name: 'Ampliar mapa', exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Mapa do ponto público: ' + location.descricao }),
  ).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.producer-map--live')).toContainText('OpenStreetMap');
  await expect(page.locator('.producer-map--live a[href*="mlat="]')).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
});
test('falha da cartografia preserva texto e permite nova tentativa sem mudar o ponto', async ({
  page,
}) => {
  await page.route('https://tile.openstreetmap.org/**', (r) => r.abort());
  await profile(page);
  await page.getByRole('button', { name: 'Mostrar mapa OpenStreetMap', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Não foi possível carregar toda a cartografia',
  );
  await expect(page.getByRole('heading', { name: location.descricao, exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Tentar carregar o mapa novamente', exact: true }),
  ).toBeEnabled();
});
test('sem autorização/localização não aparece mapa, marcador ou pedido externo', async ({
  page,
}) => {
  const producer = producerDtos[0]!;
  await page.goto('/produtores/' + producer.id);
  await expect(
    page.getByRole('heading', { name: 'Localização indisponível', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.leaflet-container,iframe')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Mostrar mapa OpenStreetMap', exact: true }),
  ).toHaveCount(0);
});
test('homepage usa resumo API e nunca inventa ofertas; recusa destaques encerrados', async ({
  page,
}) => {
  let active = true;
  await page.route('**/api/auctions?*', (r) =>
    r.fulfill({
      json: envelope(
        active
          ? [auction()]
          : [
              auction({
                estado: 'terminado',
                resultado: { tipo: 'sem_licitacoes', valorCent: null, bidId: null },
              }),
            ],
        new URL(r.request().url()).searchParams,
      ),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('article', { name: 'Leilão real em destaque' })).toContainText(
    'Origem em destaque',
  );
  await expect(page.locator('.featured-auction')).toContainText('Preço base · ainda sem ofertas');
  await expect(page.locator('.featured-auction a.market-button')).toHaveAttribute(
    'href',
    '/leiloes/' + id,
  );
  active = false;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ainda sem leilões em direto.' })).toBeVisible();
  await expect(page.locator('.featured-auction')).toHaveCount(0);
});
test('homepage distingue loading, falha e vazio e recupera a consulta', async ({ page }) => {
  let fail = true;
  await page.route('**/api/auctions?*', (r) =>
    fail ? r.abort() : r.fulfill({ json: envelope([], new URLSearchParams()) }),
  );
  await page.goto('/');
  await expect(page.locator('.auction-section [role="alert"]')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Voltar a consultar leilões', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ainda sem leilões em direto.' })).toBeVisible();
});
test('homepage relê REST no limite temporal e ao recuperar ligação/foco', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/auctions?*', (r) => {
    calls++;
    return r.fulfill({
      json: envelope(
        calls === 1 ? [auction({ terminaEm: new Date(Date.now() + 2000).toISOString() })] : [],
        new URLSearchParams(),
      ),
    });
  });
  await page.goto('/');
  await expect(page.locator('.featured-auction')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ainda sem leilões em direto.' })).toBeVisible({
    timeout: 7000,
  });
  expect(calls).toBeGreaterThan(1);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => calls).toBeGreaterThan(2);
});
