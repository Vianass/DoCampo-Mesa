import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createConnection, Types } from 'mongoose';
const api = 'http://127.0.0.1:3011/api';
interface Fixture {
  databaseName: string;
  contas: { papel: string; email: string; password: string }[];
  produtoId: string;
  leiloes: { ativo: string; agendado: string; terminado: string; cancelado: string };
}
let f: Fixture;
test.beforeAll(async () => {
  f = JSON.parse(await readFile(process.env.DOCAMPO_AUCTION_REVIEW_FILE!, 'utf8'));
  expect(f.databaseName).toMatch(/^docampo_test_web_/);
});
async function login(page: Page, index: number) {
  await page.goto('/entrar');
  await page.getByLabel('Email', { exact: true }).fill(f.contas[index]!.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(f.contas[index]!.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('.account-identity')).toBeVisible();
}
async function navigate(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState(null, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function producerToken(request: APIRequestContext) {
  const r = await request.post(api + '/auth/login', {
    data: { email: f.contas[2]!.email, password: f.contas[2]!.password },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).accessToken as string;
}
async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
}
async function readyImages(page: Page) {
  const photos = page.locator('.auction-photo');
  const count = await photos.count();
  await expect(page.locator('.auction-photo img[src*="tomatoes.webp"]')).toHaveCount(count);
  for (const img of await photos.locator('img').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        img.evaluate(
          (n) => (n as HTMLImageElement).complete && (n as HTMLImageElement).naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
}
function localDate(ms: number) {
  const date = new Date(ms);
  return new Date(ms - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}
test('catálogo REST público: estados, pesquisa local, filtros, imagens e detalhe sem sessão', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/leiloes');
  await expect(page.locator('.auction-lot-card')).toHaveCount(4);
  await expect(page.locator('.auction-state--agendado')).toHaveCount(1);
  await expect(page.locator('.auction-state--ativo')).toHaveCount(1);
  await expect(page.locator('.auction-state--terminado')).toHaveCount(1);
  await expect(page.locator('.auction-state--cancelado')).toHaveCount(1);
  await page.getByLabel('Pesquisar nesta página').fill('próxima');
  await expect(page.locator('.auction-lot-card')).toHaveCount(1);
  expect(
    requests.some((u) => new URL(u).searchParams.has('pesquisa') && u.includes('/auctions')),
  ).toBe(false);
  await page.getByLabel('Pesquisar nesta página').fill('');
  await page.getByLabel('Estado do leilão').selectOption('ativo');
  await expect(page.locator('.auction-lot-card')).toHaveCount(1);
  await page.getByRole('link', { name: /Conhecer o lote/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Tomate da horta. Uma colheita para partilhar.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Entrar para acompanhar/ })).toBeVisible();
  expect(requests.filter((u) => u.includes('/api/auctions/' + f.leiloes.ativo))).toHaveLength(0);
  await page.goto('/leiloes/000000000000000000000001');
  await expect(page.getByRole('link', { name: /Entrar para acompanhar/ })).toBeVisible();
});
test('dois React reais: ofertas, liderança, relógio, desconexão, reconexão e resultado MongoDB', async ({
  browser,
  request,
}, info) => {
  const token = await producerToken(request);
  const created = await request.post(api + '/auctions', {
    headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': randomUUID() },
    data: {
      produtoId: f.produtoId,
      quantidade: 500,
      titulo: 'Colheita partilhada · duas sessões reais',
      descricao: 'Lote efémero para demonstração integrada.',
      precoBaseCent: 1200,
      incrementoCent: 100,
      terminaEm: new Date(Date.now() + 40000).toISOString(),
    },
  });
  expect(created.status()).toBe(201);
  const auction = await created.json();
  const a = await browser.newContext(),
    b = await browser.newContext();
  const A = await a.newPage(),
    B = await b.newPage();
  const errors: string[] = [];
  A.on('pageerror', (e) => errors.push(e.message));
  B.on('pageerror', (e) => errors.push(e.message));
  try {
    await login(A, 0);
    await login(B, 1);
    await navigate(A, '/leiloes/' + auction.id);
    await navigate(B, '/leiloes/' + auction.id);
    await expect(A.getByText('Ligado à sala', { exact: true })).toBeVisible();
    await expect(B.getByText('Ligado à sala', { exact: true })).toBeVisible();
    await expect(B.locator('.auction-presence')).toContainText('2 ligações');
    for (const width of [320, 430, 768, 1024, 1280, 1440]) {
      await A.setViewportSize({ width, height: 940 });
      await expect(A.getByRole('form', { name: 'Apresentar oferta' })).toHaveCount(1);
      await expect(A.locator('.auction-bid-panel .auction-clock')).toHaveCount(1);
      await expect(B.locator('.auction-presence')).toContainText('2 ligações');
    }
    await A.getByRole('button', { name: 'Confirmar oferta', exact: true }).click();
    await expect(A.getByTestId('auction-lead')).toContainText('tua oferta está na liderança');
    await expect(A.locator('.auction-bid-feedback')).toContainText('13,00');
    await expect(A.locator('.auction-bid-feedback')).toContainText(
      'aceite e registada no histórico',
    );
    await expect(B.getByTestId('auction-current-value')).toContainText('13,00');
    await B.getByRole('button', { name: 'Confirmar oferta', exact: true }).click();
    await expect(B.getByTestId('auction-lead')).toContainText('tua oferta está na liderança');
    await expect(A.getByTestId('auction-lead')).toContainText('ultrapassada');
    await expect(A.locator('.auction-bid-feedback')).toHaveClass(/--historical/);
    await expect(A.locator('.auction-bid-feedback')).toContainText(
      'Esta oferta foi entretanto ultrapassada.',
    );
    await expect(A.locator('.auction-bid-feedback')).toContainText('13,00');
    await expect(A.locator('.auction-history li')).toHaveCount(2);
    await expect(
      A.locator('.auction-history li').filter({ hasText: 'A tua oferta' }),
    ).toContainText('13,00');
    const times = await Promise.all(
      [A, B].map((p) => p.locator('.auction-clock').getAttribute('data-remaining-ms')),
    );
    expect(Math.abs(Number(times[0]) - Number(times[1]))).toBeLessThan(2200);
    await a.setOffline(true);
    await expect(A.getByText('A reconectar', { exact: true })).toBeVisible();
    await expect(A.getByRole('button', { name: 'Confirmar oferta', exact: true })).toBeDisabled();
    await a.setOffline(false);
    await expect(A.getByText('Ligado à sala', { exact: true })).toBeVisible();
    await expect(A.getByTestId('auction-current-value')).toContainText('14,00');
    await Promise.all([
      A.screenshot({ path: info.outputPath('buyer-a-live.png'), fullPage: true }),
      B.screenshot({ path: info.outputPath('buyer-b-live.png'), fullPage: true }),
    ]);
    await expect(B.getByText('A tua oferta terminou na liderança.', { exact: true })).toBeVisible({
      timeout: 55000,
    });
    await expect(A.getByText('O leilão chegou ao fim.', { exact: true })).toBeVisible();
    for (const p of [A, B]) {
      await expect(p.locator('.auction-final')).toContainText('14,00');
      await expect(p.getByRole('button', { name: 'Confirmar oferta', exact: true })).toBeDisabled();
      const storage = await p.evaluate(() => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }));
      expect(JSON.stringify(storage)).not.toMatch(
        /eyJ[A-Za-z0-9_-]{10,}\.|accessToken|passwordHash/,
      );
      await expect(p.locator('.auction-history')).not.toContainText(f.contas[0]!.email);
      await expect(p.locator('.auction-history')).not.toContainText(f.contas[1]!.email);
    }
    const db = await createConnection(
      'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      { dbName: f.databaseName },
    ).asPromise();
    try {
      const persisted = await db
        .collection('auctions')
        .findOne({ _id: new Types.ObjectId(auction.id) });
      expect(persisted).toMatchObject({
        estado: 'terminado',
        sequencia: 2,
        licitacaoAtual: { valorCent: 1400 },
        reserva: { estado: 'afeta_vencedor' },
      });
      expect(
        await db.collection('bids').countDocuments({ leilao: new Types.ObjectId(auction.id) }),
      ).toBe(2);
    } finally {
      await db.close();
    }
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});
test('produtor cria, edita com ETag e cancela um lote real; stock reservado e libertado', async ({
  page,
  request,
}) => {
  await login(page, 2);
  await navigate(page, '/area/produtor/leiloes/novo');
  await expect(
    page.getByRole('heading', { name: 'Da tua colheita, um novo leilão.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Criar leilão e reservar stock' }).click();
  await expect(page.getByRole('alert')).toContainText('Há dados a rever.');
  await page.getByLabel('Produto da tua produção', { exact: true }).selectOption(f.produtoId);
  await page.getByLabel('Título do leilão').fill('Lote de revisão criado no React');
  await page.getByLabel('Descrição do lote').fill('Colheita fictícia em ambiente isolado.');
  await page.getByLabel('Preço inicial do lote (€)').fill('8,50');
  await page.getByLabel('Início (opcional)').fill(localDate(Date.now() + 3600000));
  await page.getByLabel('Fim do leilão').fill(localDate(Date.now() + 7200000));
  const creation = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/auctions' && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Criar leilão e reservar stock' }).click();
  const response = await creation;
  expect(response.status()).toBe(201);
  const id = (await response.json()).id;
  await expect(
    page.getByRole('heading', { name: 'Lote de revisão criado no React' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Editar leilão', exact: true }).click();
  await page.getByLabel('Título do leilão').fill('Lote afinado no React');
  const edition = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/auctions/' + id && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Guardar alterações', exact: true }).click();
  expect((await edition).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Lote afinado no React' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar leilão', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(page.locator('.auction-room .auction-state')).toHaveText('Cancelado');
  const token = await producerToken(request);
  const result = await request.get(api + '/auctions/' + id, {
    headers: { Authorization: 'Bearer ' + token },
  });
  expect((await result.json()).reserva.estado).toBe('libertada');
  await expect(page.getByRole('link', { name: 'Editar leilão', exact: true })).toHaveCount(0);
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(
    'responsividade real: catálogo, detalhe, gestão e formulário a ' + width + ' px',
    async ({ page }, info) => {
      await page.setViewportSize({ width, height: 940 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/leiloes');
      await expect(page.locator('.auction-lot-card').first()).toBeVisible();
      await readyImages(page);
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath('catalog-' + width + '.png'), fullPage: true });
      await login(page, 0);
      await navigate(page, '/leiloes/' + f.leiloes.ativo);
      await expect(page.getByText('Ligado à sala', { exact: true })).toBeVisible();
      await readyImages(page);
      await noOverflow(page);
      await expect(page.getByLabel('A tua oferta pelo lote (€)')).toBeVisible();
      await expect(page.getByRole('form', { name: 'Apresentar oferta' })).toHaveCount(1);
      await expect(page.locator('.auction-bid-panel .auction-clock')).toHaveCount(1);
      await expect(page.locator('.auction-presence')).toContainText('1 ligações');
      const layout = await page.evaluate(() => {
        const panel = document
          .querySelector('.auction-room-grid--participation > .auction-bid-panel')!
          .getBoundingClientRect();
        const story = document.querySelector('.auction-room-story')!.getBoundingClientRect();
        const price = document.querySelector('.auction-current-value')!.getBoundingClientRect();
        return {
          panel: { x: panel.x, y: panel.y, bottom: panel.bottom },
          story: { x: story.x, y: story.y },
          priceY: price.y,
        };
      });
      if (width < 1024) {
        expect(layout.panel.bottom).toBeLessThanOrEqual(layout.story.y);
        expect(layout.priceY).toBeLessThan(layout.story.y);
      } else {
        expect(layout.story.x).toBeLessThan(layout.panel.x);
        expect(Math.abs(layout.story.y - layout.panel.y)).toBeLessThan(1);
      }
      await page.screenshot({ path: info.outputPath('room-' + width + '.png'), fullPage: true });
      await login(page, 2);
      await navigate(page, '/area/produtor/leiloes');
      await expect(page.getByRole('link', { name: /Criar um leilão/ })).toBeVisible();
      await expect(page.locator('.auction-lot-card').first()).toBeVisible();
      await readyImages(page);
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath('producer-' + width + '.png'),
        fullPage: true,
      });
      await page.getByRole('link', { name: /Criar um leilão/ }).click();
      await expect(page.getByLabel('Produto da tua produção', { exact: true })).toBeVisible();
      await expect(
        page.locator('#auction-product option[value="' + f.produtoId + '"]'),
      ).toHaveCount(1);
      await noOverflow(page);
      const typography = await page.locator('.auction-producer-form').evaluate((form) =>
        [...form.querySelectorAll('legend, fieldset > h2')].map((e) => {
          const s = getComputedStyle(e);
          return {
            family: s.fontFamily,
            size: s.fontSize,
            weight: s.fontWeight,
            lineHeight: s.lineHeight,
            color: s.color,
          };
        }),
      );
      expect(typography).toHaveLength(2);
      expect(typography[0]).toEqual(typography[1]);
      await page.screenshot({ path: info.outputPath('form-' + width + '.png'), fullPage: true });
      expect(errors).toEqual([]);
    },
  );
test('V04: erro da oferta é anunciado uma vez, associado ao campo e limpo ao editar', async ({
  page,
}) => {
  await login(page, 0);
  await navigate(page, '/leiloes/' + f.leiloes.ativo);
  await expect(page.getByText('Ligado à sala', { exact: true })).toBeVisible();
  const amount = page.getByRole('textbox', { name: 'A tua oferta pelo lote (€)' });
  await expect(amount).not.toHaveAttribute('aria-invalid');
  await expect(amount).toHaveAttribute('aria-describedby', 'auction-minimum auction-bid-error');
  await amount.fill('1');
  await amount.press('Tab');
  await expect(page.getByRole('button', { name: 'Confirmar oferta', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.locator('#auction-bid-error')).toHaveAttribute('role', 'alert');
  await expect(page.getByRole('alert')).toHaveText(
    'Indica um valor igual ou superior à próxima oferta mínima.',
  );
  await amount.fill('13,00');
  await expect(amount).not.toHaveAttribute('aria-invalid');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('#auction-bid-error')).toBeEmpty();
});
test('detalhe autenticado inexistente e sessão perdida após recarregar', async ({ page }) => {
  await login(page, 0);
  await navigate(page, '/leiloes/000000000000000000000001');
  await expect(page.getByText('Este leilão não está disponível.', { exact: true })).toBeVisible();
  await navigate(page, '/leiloes/' + f.leiloes.ativo);
  await expect(page.getByText('Ligado à sala', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: /Entrar para acompanhar/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar oferta', exact: true })).toHaveCount(0);
});
test('recupera pelo Socket o recibo persistido mesmo após o encerramento, sem duplicar a oferta', async ({
  page,
  request,
}) => {
  const token = await producerToken(request);
  const created = await request.post(api + '/auctions', {
    headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': randomUUID() },
    data: {
      produtoId: f.produtoId,
      quantidade: 500,
      titulo: 'Recuperação real de uma tentativa',
      descricao: 'Ensaio fictício de resposta perdida.',
      precoBaseCent: 1200,
      incrementoCent: 100,
      terminaEm: new Date(Date.now() + 8000).toISOString(),
    },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id;
  const response = await request.post(api + '/auth/login', {
    data: { email: f.contas[0]!.email, password: f.contas[0]!.password },
  });
  const buyer = await response.json();
  const me = await request.get(api + '/auth/me', {
    headers: { Authorization: 'Bearer ' + buyer.accessToken },
  });
  const identity = await me.json();
  const requestId = randomUUID();
  const accepted = await request.post(api + '/auctions/' + id + '/bids', {
    headers: { Authorization: 'Bearer ' + buyer.accessToken, 'Idempotency-Key': requestId },
    data: { valorCent: 1300 },
  });
  expect(accepted.status()).toBe(201);
  await login(page, 0);
  await page.evaluate(
    async ({ userId, id, requestId }) => {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode('docampo-auctions:' + userId),
      );
      const hash = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join(
        '',
      );
      sessionStorage.setItem(
        'docampo.auction-attempt.v1.' + hash + '.' + id,
        JSON.stringify({ requestId, leilaoId: id, valorCent: 1300 }),
      );
    },
    { userId: identity.id, id, requestId },
  );
  await navigate(page, '/leiloes/' + id);
  await expect(page.getByText('Ligado à sala', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar oferta', exact: true })).toBeDisabled();
  await expect(page.locator('.auction-room .auction-state')).toHaveText('Terminado', {
    timeout: 15000,
  });
  await page.getByRole('button', { name: 'Recuperar resultado da oferta', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'recuperámos a tua tentativa original' }),
  ).toBeVisible();
  const history = await request.get(api + '/auctions/' + id + '/bids', {
    headers: { Authorization: 'Bearer ' + buyer.accessToken },
  });
  expect((await history.json()).total).toBe(1);
  await expect(page.locator('.auction-room .auction-state')).toHaveText('Terminado');
  expect(
    await page.evaluate(
      () =>
        Object.keys(sessionStorage).filter((k) => k.startsWith('docampo.auction-attempt.')).length,
    ),
  ).toBe(0);
});
