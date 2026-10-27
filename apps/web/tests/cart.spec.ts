import { productDtos } from './support/catalog-fixtures';
import { adaptProduct } from '../src/features/api/catalog';
import { expect, test, type Page } from './support/test';
import { CART_STORAGE_KEY } from '../src/features/cart/storage';

const now = '2026-10-15T10:00:00.000Z';
const tomato = {
  productId: 'ee685adf80156cb9e1e85c27',
  producerId: 'fdbe9e7dd68e7983981d7b7e',
  quantity: 1,
  unitPriceSnapshotCents: 280,
  productSnapshot: adaptProduct(
    productDtos.find((p) => p.precoCent === 280 && p.nome === 'Tomate coração-de-boi')!,
  ),
  unit: 'unidade',
};
const pear = {
  productId: 'aa6b68cc89c59bc055a5699b',
  producerId: '1e65f31692c88a4dac46bf37',
  quantity: 1,
  unitPriceSnapshotCents: 240,
  productSnapshot: adaptProduct(productDtos.find((p) => p.nome === 'Pera Rocha')!),
  unit: 'unidade',
};
const storage = (items: unknown[]) => JSON.stringify({ version: 1, updatedAt: now, items });
async function seed(page: Page, raw: string) {
  await page.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem('cart-test-seeded') === null) {
        localStorage.setItem(key, raw);
        localStorage.setItem('cart-test-seeded', 'true');
      }
    },
    { key: CART_STORAGE_KEY, raw },
  );
}
async function headerCount(page: Page, count: number) {
  await expect(page.locator('.header-cart')).toHaveAttribute(
    'aria-label',
    `Carrinho, ${count} ${count === 1 ? 'unidade' : 'unidades'}`,
  );
}
async function addTomato(page: Page, quantity = '1') {
  await page.goto('/produtos/ee685adf80156cb9e1e85c27');
  await page.getByLabel('Quantidade a adicionar').fill(quantity);
  await page.getByRole('button', { name: 'Adicionar Tomate coração-de-boi ao carrinho' }).click();
}

test('adicionar a partir do catálogo atualiza imediatamente badge e feedback acessível', async ({
  page,
}) => {
  await page.goto('/produtos?pesquisa=Tomate');
  await page.getByRole('button', { name: 'Adicionar Tomate coração-de-boi ao carrinho' }).click();
  await headerCount(page, 1);
  await expect(page.getByRole('status', { name: 'Atualização do carrinho' })).toContainText(
    'foi adicionado à cesta',
  );
  await page.locator('.header-cart').click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A tua cesta.');
  await expect(page.locator('.cart-line h3')).toHaveText('Tomate coração-de-boi');
  await expect(page.locator('.cart-summary__total')).toContainText('2,80');
});

test('adicionar duas vezes reúne o produto numa única linha e soma quantidades', async ({
  page,
}) => {
  await addTomato(page);
  await page.getByRole('button', { name: 'Adicionar Tomate coração-de-boi ao carrinho' }).click();
  await headerCount(page, 2);
  await page.locator('.header-cart').click();
  await expect(page.locator('.cart-line')).toHaveCount(1);
  await expect(page.getByLabel('Quantidade de Tomate coração-de-boi', { exact: true })).toHaveValue(
    '2',
  );
  await expect(page.locator('.cart-summary__total')).toContainText('5,60');
});

test('produtos de diferentes produtores têm grupos, subtotais e total corretos', async ({
  page,
}) => {
  await seed(
    page,
    storage([
      { ...tomato, quantity: 2 },
      { ...pear, quantity: 3 },
    ]),
  );
  await page.goto('/carrinho');
  await headerCount(page, 5);
  await expect(page.locator('.cart-producer-group')).toHaveCount(2);
  await expect(page.locator('.cart-producer-group > footer').nth(0)).toContainText('5,60');
  await expect(page.locator('.cart-producer-group > footer').nth(1)).toContainText('7,20');
  await expect(page.locator('.cart-summary')).toContainText('5 unidades');
  await expect(page.locator('.cart-summary__total')).toContainText('12,80');
  await expect(page.locator('.cart-checkout-note')).toContainText(
    'finalização da compra ficará disponível numa fase futura',
  );
});

test('adicionar produtos de duas origens pela interface mantém ambas as escolhas', async ({
  page,
}) => {
  await addTomato(page, '2');
  await page.goto('/produtos/aa6b68cc89c59bc055a5699b');
  await page.getByRole('button', { name: 'Adicionar Pera Rocha ao carrinho' }).click();
  await headerCount(page, 3);
  await page.locator('.header-cart').click();
  await expect(page.locator('.cart-producer-group h2')).toHaveText([
    'Horta da Ribeira',
    'Pomar do Vale',
  ]);
  await expect(page.locator('.cart-summary__total')).toContainText('8,00');
});

test('aumentar e diminuir quantidade atualiza linha, subtotal e badge', async ({ page }) => {
  await seed(page, storage([tomato]));
  await page.goto('/carrinho');
  const decrease = page.getByRole('button', {
    name: 'Diminuir quantidade de Tomate coração-de-boi',
  });
  await expect(decrease).toBeDisabled();
  await page.getByRole('button', { name: 'Aumentar quantidade de Tomate coração-de-boi' }).click();
  await headerCount(page, 2);
  await expect(page.locator('.cart-line__subtotal')).toContainText('5,60');
  await decrease.click();
  await headerCount(page, 1);
  await expect(page.locator('.cart-summary__total')).toContainText('2,80');
});

test('edição direta só aplica na confirmação; valor inválido fica visível sem mudar o total', async ({
  page,
}) => {
  await seed(page, storage([tomato]));
  await page.goto('/carrinho');
  const input = page.getByLabel('Quantidade de Tomate coração-de-boi', { exact: true });
  await input.fill('4');
  await headerCount(page, 1);
  await input.press('Enter');
  await headerCount(page, 4);
  await expect(page.locator('.cart-summary__total')).toContainText('11,20');
  for (const value of ['2.5', '-1', '', '99']) {
    await input.fill(value);
    await input.press('Enter');
    await expect(input).toHaveValue(value);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.cart-quantity-field').getByRole('alert')).toBeVisible();
    await headerCount(page, 4);
  }
  await input.fill('3');
  await input.press('Tab');
  await headerCount(page, 3);
});

test('introduzir zero retira a linha e devolve foco ao título', async ({ page }) => {
  await seed(page, storage([tomato]));
  await page.goto('/carrinho');
  const input = page.getByLabel('Quantidade de Tomate coração-de-boi', { exact: true });
  await input.fill('0');
  await input.press('Enter');
  await expect(page.locator('.cart-line')).toHaveCount(0);
  await headerCount(page, 0);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});

test('retirar produto preserva as outras linhas; esvaziar limpa tudo', async ({ page }) => {
  await seed(page, storage([tomato, pear]));
  await page.goto('/carrinho');
  await page.getByRole('button', { name: 'Retirar Tomate coração-de-boi do carrinho' }).click();
  await headerCount(page, 1);
  await expect(page.locator('.cart-line h3')).toHaveText('Pera Rocha');
  await page.getByRole('button', { name: 'Esvaziar cesta' }).click();
  await headerCount(page, 0);
  await expect(page.locator('.cart-producer-group')).toHaveCount(0);
  await page.reload();
  await headerCount(page, 0);
});

test('cesta vazia apresenta mensagem editorial e ligação de recuperação', async ({ page }) => {
  await page.goto('/carrinho');
  await expect(
    page.getByRole('heading', { name: 'A tua cesta ainda está à espera dos primeiros sabores.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Explorar produtos', exact: true }).click();
  await expect(page).toHaveURL(/\/produtos$/);
});

test('persistência após reload contém apenas o esquema versionado e snapshots mínimos', async ({
  page,
}) => {
  await addTomato(page, '3');
  await headerCount(page, 3);
  await page.reload();
  await headerCount(page, 3);
  const persisted = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '{}'),
    CART_STORAGE_KEY,
  );
  expect(persisted.version).toBe(1);
  expect(persisted.items).toEqual([{ ...tomato, quantity: 3 }]);
  expect(Object.keys(persisted.items[0]).sort()).toEqual(
    [
      'productId',
      'producerId',
      'quantity',
      'unit',
      'unitPriceSnapshotCents',
      'productSnapshot',
    ].sort(),
  );
  await page.locator('.header-cart').click();
  await expect(page.locator('.cart-summary__total')).toContainText('8,40');
});

for (const [label, raw] of [
  ['JSON malformado', '{broken'],
  ['versão não suportada', JSON.stringify({ version: 999, items: [tomato], updatedAt: now })],
  ['esquema inválido', JSON.stringify({ version: 1, items: 'not-an-array', updatedAt: now })],
]) {
  test(`recuperação de ${label} não quebra a aplicação`, async ({ page }) => {
    await seed(page, raw ?? '');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/carrinho');
    await headerCount(page, 0);
    await expect(page.locator('.cart-recovery')).toContainText('reposta vazia');
    expect(errors).toEqual([]);
  });
}

test('produto removido e stock esgotado são descartados e linhas válidas mantidas', async ({
  page,
}) => {
  await seed(
    page,
    storage([
      { ...tomato, productId: 'produto-antigo' },
      { ...tomato, productId: 'brocolos' },
      pear,
    ]),
  );
  await page.goto('/carrinho');
  await headerCount(page, 1);
  await expect(page.locator('.cart-line h3')).toHaveText('Pera Rocha');
  await expect(page.locator('.cart-recovery')).toContainText('já não existe');
  await expect(page.locator('.cart-recovery')).toContainText('já não está disponível');
});

test('stock reduzido e preços adulterados são reconciliados com aviso e persistidos', async ({
  page,
}) => {
  await seed(
    page,
    storage([
      { ...tomato, quantity: 999, unitPriceSnapshotCents: 1, producerId: 'falso', unit: 'errada' },
    ]),
  );
  await page.goto('/carrinho');
  await headerCount(page, 18);
  await expect(page.locator('.cart-recovery')).toContainText('reduzida para 18');
  await expect(page.locator('.cart-recovery')).toContainText('atualizados');
  await expect(page.locator('.cart-summary__total')).toContainText('50,40');
  await expect(
    page.getByRole('button', { name: 'Aumentar quantidade de Tomate coração-de-boi' }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').items, CART_STORAGE_KEY),
    )
    .toEqual([{ ...tomato, quantity: 18 }]);
});

test('limite de stock impede nova adição e quantidade de detalhe inválida é recusada', async ({
  page,
}) => {
  await addTomato(page, '19');
  await expect(page.locator('.add-to-cart--detailed').getByRole('alert')).toContainText(
    'Só existem 18',
  );
  await headerCount(page, 0);
  await page.getByLabel('Quantidade a adicionar').fill('18');
  const button = page.getByRole('button', { name: 'Adicionar Tomate coração-de-boi ao carrinho' });
  await button.click();
  await headerCount(page, 18);
  await expect(button).toBeDisabled();
  await expect(button).toContainText('Limite na cesta');
});

test('produto esgotado não pode ser adicionado nos cartões nem no detalhe', async ({ page }) => {
  await page.goto('/produtos?pesquisa=Brócolos');
  await expect(page.getByRole('button', { name: 'Adicionar Brócolos ao carrinho' })).toBeDisabled();
  await page.getByRole('link', { name: 'Brócolos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Adicionar Brócolos ao carrinho' })).toBeDisabled();
  await headerCount(page, 0);
});

for (const failure of ['read', 'write'] as const) {
  test(`falha de localStorage em ${failure} mantém o carrinho utilizável em memória`, async ({
    page,
  }) => {
    await page.addInitScript((failure) => {
      if (failure === 'read')
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('Blocked', 'SecurityError');
          },
        });
      else
        Storage.prototype.setItem = function () {
          throw new DOMException('Full', 'QuotaExceededError');
        };
    }, failure);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await addTomato(page);
    await headerCount(page, 1);
    await expect(page.getByRole('status', { name: 'Informações do carrinho' })).toContainText(
      /sessão|neste browser/,
    );
    await page.locator('.header-cart').click();
    await expect(page.locator('.cart-line h3')).toHaveText('Tomate coração-de-boi');
    expect(errors).toEqual([]);
  });
}

test('navegação produto → carrinho → produto e histórico preservam as escolhas', async ({
  page,
}) => {
  await addTomato(page);
  await page.locator('.header-cart').click();
  await page.getByRole('link', { name: 'Tomate coração-de-boi', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tomate coração-de-boi');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A tua cesta.');
  await headerCount(page, 1);
  await page.goForward();
  await headerCount(page, 1);
});

test('interação móvel permite gerir a cesta pelo menu e por teclado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addTomato(page);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page
    .getByRole('navigation', { name: 'Navegação móvel' })
    .getByRole('link', { name: /Carrinho/ })
    .click();
  await expect(page.getByRole('navigation', { name: 'Navegação móvel' })).toBeHidden();
  const increase = page.getByRole('button', {
    name: 'Aumentar quantidade de Tomate coração-de-boi',
  });
  await increase.focus();
  await increase.press('Enter');
  await headerCount(page, 2);
  await expect(increase).toBeFocused();
  await page.getByRole('button', { name: 'Retirar Tomate coração-de-boi do carrinho' }).click();
  await headerCount(page, 0);
});

for (const width of [320, 430, 768, 1024, 1280, 1440]) {
  test(`carrinho com várias origens sem overflow e header utilizável a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(
      page,
      storage([
        { ...tomato, quantity: 2 },
        { ...pear, quantity: 3 },
      ]),
    );
    await page.goto('/carrinho');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.header-cart')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    for (const image of await page.locator('.cart-line img').all()) {
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
    const size = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.client);
    await expect(page.locator('.cart-summary__total')).toContainText('12,80');
  });
}
