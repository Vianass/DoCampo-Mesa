import { expect, test, type Page } from '@playwright/test';
import { roles, roleLabels, type Role } from '../src/features/auth/types';
import { privateSections } from '../src/features/private-area/navigation';

async function explore(page: Page, role: Role) {
  await page.goto('/entrar');
  await page.getByRole('button', { name: `Explorar como ${role}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/area/${role}$`));
}
async function spaNavigate(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function fillRegistration(page: Page) {
  await page.getByLabel('Nome', { exact: true }).fill('Pessoa de teste');
  await page.getByLabel('Email', { exact: true }).fill('pessoa@example.test');
  await page.getByLabel('Palavra-passe', { exact: true }).fill('palavra-ficticia-123');
  await page
    .getByLabel('Confirmação da palavra-passe', { exact: true })
    .fill('palavra-ficticia-123');
}
test('entrada apresenta formulário separado dos três papéis de demonstração', async ({ page }) => {
  await page.goto('/entrar');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('É bom voltar');
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute(
    'autocomplete',
    'username',
  );
  await expect(page.getByLabel('Palavra-passe', { exact: true })).toHaveAttribute(
    'type',
    'password',
  );
  await expect(page.locator('.auth-prototype-note')).toContainText(
    'autenticação ainda não está disponível',
  );
  await expect(page.locator('.demo-access button')).toHaveCount(3);
  await expect(page.locator('form .demo-access')).toHaveCount(0);
  await page.getByRole('link', { name: 'Conhecer o registo' }).click();
  await expect(page).toHaveURL(/\/registo$/);
});
test('registo distingue comprador e produtor, incluindo campos e aprovação sem administrador', async ({
  page,
}) => {
  await page.goto('/registo');
  await expect(page.getByRole('radio', { name: 'Quero comprar' })).toBeChecked();
  await expect(page.getByLabel('Nome público do produtor')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Sou produtor' }).check();
  await expect(page.getByRole('radio', { name: 'Sou produtor' })).toBeChecked();
  await expect(page).toHaveURL(/perfil=produtor/);
  await expect(page.getByLabel('Nome público do produtor')).toBeVisible();
  await expect(page.getByLabel('Localidade do produtor')).toBeVisible();
  await expect(page.locator('.auth-producer-fields')).toContainText('decisão administrativa');
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole('radio', { name: 'Quero comprar' })).toBeChecked();
  await expect(page.getByLabel('Nome público do produtor')).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole('radio', { name: 'Sou produtor' })).toBeChecked();
  await expect(page.getByLabel('Nome público do produtor')).toBeVisible();
  await page.goto('/registo?perfil=administrador');
  await expect(page.getByRole('radio', { name: 'Quero comprar' })).toBeChecked();
  await expect(page.getByRole('radio', { name: /administrador/i })).toHaveCount(0);
});
test('validação obrigatória dá foco ao resumo e associa erros aos campos', async ({ page }) => {
  await page.goto('/registo');
  await page.getByRole('button', { name: 'Verificar registo demonstrativo' }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('Revê os campos assinalados');
  for (const name of ['Nome', 'Email', 'Palavra-passe', 'Confirmação da palavra-passe']) {
    const input = page.getByLabel(name, { exact: true });
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    const descriptionIds = (await input.getAttribute('aria-describedby'))?.split(' ') ?? [];
    expect(descriptionIds.length).toBeGreaterThan(0);
    for (const id of descriptionIds) await expect(page.locator(`[id="${id}"]`)).toBeVisible();
  }
});
for (const path of ['/entrar', '/registo', '/recuperar-palavra-passe']) {
  test(`email inválido é recusado em ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.getByLabel('Email', { exact: true }).fill('invalido@');
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByRole('alert')).toContainText('email válido');
    await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  });
}
test('palavra-passe e confirmação usam regras provisórias sem requisitos de composição', async ({
  page,
}) => {
  await page.goto('/registo');
  await fillRegistration(page);
  await page.getByLabel('Palavra-passe', { exact: true }).fill('curta');
  await page.getByLabel('Confirmação da palavra-passe', { exact: true }).fill('diferente');
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole('alert')).toContainText('pelo menos 8');
  await expect(page.getByRole('alert')).toContainText('não coincidem');
  await page.getByLabel('Palavra-passe', { exact: true }).fill('abcdefgh');
  await page.getByLabel('Confirmação da palavra-passe', { exact: true }).fill('abcdefgh');
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('.auth-form-status')).toContainText(
    'nenhuma conta ou candidatura foi criada',
  );
  await expect(page.getByLabel('Palavra-passe', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Confirmação da palavra-passe', { exact: true })).toHaveValue('');
});
test('visibilidade da palavra-passe e confirmação funciona por teclado com estado acessível', async ({
  page,
}) => {
  await page.goto('/registo');
  const input = page.getByLabel('Palavra-passe', { exact: true });
  await input.fill('exemplo-ficticio');
  const toggle = page.getByRole('button', { name: 'Mostrar palavra-passe', exact: true });
  await toggle.focus();
  await toggle.press('Enter');
  await expect(input).toHaveAttribute('type', 'text');
  await expect(
    page.getByRole('button', { name: 'Ocultar palavra-passe', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Ocultar palavra-passe', exact: true }).click();
  await expect(input).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostrar confirmação da palavra-passe' }).click();
  await expect(page.getByLabel('Confirmação da palavra-passe', { exact: true })).toHaveAttribute(
    'type',
    'text',
  );
});
test('login válido localmente nunca autentica, envia pedidos ou guarda credenciais', async ({
  page,
}) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url());
  });
  await page.goto('/entrar');
  await page.getByLabel('Email', { exact: true }).fill('pessoa@example.test');
  await page.getByLabel('Palavra-passe', { exact: true }).fill('segredo-ficticio');
  await page.getByRole('button', { name: 'Verificar acesso', exact: true }).click();
  await expect(page.locator('.auth-form-status')).toContainText(
    'Não validámos credenciais nem iniciámos uma sessão',
  );
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByLabel('Palavra-passe', { exact: true })).toHaveValue('');
  const stored = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(stored).not.toContain('pessoa@example.test');
  expect(stored).not.toContain('segredo-ficticio');
  expect(writes).toEqual([]);
  await spaNavigate(page, '/area/comprador');
  await expect(page).toHaveURL(/\/entrar\?destino=/);
});
test('verificação local apresenta loading e impede submissões duplicadas', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('Email', { exact: true }).fill('pessoa@example.test');
  await page.getByLabel('Palavra-passe', { exact: true }).fill('exemplo');
  await page.evaluate(() => {
    const queue: FrameRequestCallback[] = [];
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      queue.push(callback);
      return queue.length;
    };
    (window as unknown as { flushDemoFrames: () => void }).flushDemoFrames = () => {
      while (queue.length) queue.shift()?.(performance.now());
      window.requestAnimationFrame = original;
    };
    const form = document.querySelector('form');
    form?.requestSubmit();
    form?.requestSubmit();
  });
  await expect(page.getByRole('button', { name: 'A verificar…', exact: true })).toBeDisabled();
  await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.auth-form-status')).toContainText('A verificar');
  await page.evaluate(() =>
    (window as unknown as { flushDemoFrames: () => void }).flushDemoFrames(),
  );
  await expect(page.locator('.auth-form-status')).toContainText(
    'autenticação ainda não está disponível',
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('candidatura de produtor valida campos próprios e não aprova nem inicia sessão', async ({
  page,
}) => {
  await page.goto('/registo?perfil=produtor');
  await fillRegistration(page);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole('alert')).toContainText('nome público');
  await expect(page.getByRole('alert')).toContainText('localidade');
  await page.getByLabel('Nome público do produtor').fill('Horta de demonstração');
  await page.getByLabel('Localidade do produtor').fill('Viana do Castelo');
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('.auth-form-status')).toContainText(
    'nenhuma conta ou candidatura foi criada',
  );
  await expect(page).toHaveURL(/\/registo\?perfil=produtor$/);
});
test('recuperação navega desde login e informa que nenhum email foi enviado', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByRole('link', { name: 'Esqueceste-te da palavra-passe?' }).click();
  await expect(page).toHaveURL(/\/recuperar-palavra-passe$/);
  await page.getByLabel('Email', { exact: true }).fill('pessoa@example.test');
  await page.getByRole('button', { name: 'Verificar formulário' }).click();
  await expect(page.locator('.auth-form-status')).toContainText('Nenhum email foi enviado');
  await page.getByRole('link', { name: '← Voltar à entrada' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
});
for (const role of roles) {
  test(`demonstração de ${role} apresenta layout e navegação exclusivos do papel`, async ({
    page,
  }) => {
    await explore(page, role);
    await expect(page.locator('.private-role-line')).toContainText(roleLabels[role]);
    await expect(page.locator('main')).toBeFocused();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.private-prototype')).toContainText(
      'Não existe uma conta autenticada',
    );
    const nav = page.getByRole('navigation', { name: 'Navegação da área de demonstração' });
    for (const section of privateSections[role]) {
      await expect(nav.getByRole('link', { name: new RegExp(section.label) })).toBeVisible();
    }
    await expect(nav.locator(`a[href^="/area/"]:not([href^="/area/${role}"])`)).toHaveCount(0);
    const first = privateSections[role][0];
    if (!first) throw new Error('Secção em falta');
    await nav.getByRole('link', { name: new RegExp(first.label) }).click();
    if (role === 'comprador') {
      await expect(page.getByLabel('Filtrar por estado')).toBeVisible();
      await expect(page.locator('.buyer-order-card')).toHaveCount(6);
      await expect(page.locator('.buyer-demo-note')).toContainText('Dados fictícios');
    } else {
      await expect(page.locator('.private-prototype')).toContainText(
        'Funcionalidade ainda indisponível',
      );
    }
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${first.label}.`);
    if (role === 'comprador')
      await nav.getByRole('link', { name: 'Visão geral', exact: true }).click();
    else await page.getByRole('link', { name: 'Voltar à visão geral' }).click();
    await page.getByRole('button', { name: 'Sair da demonstração' }).click();
    await expect(page).toHaveURL(/\/entrar$/);
    await spaNavigate(page, `/area/${role}`);
    await expect(page).toHaveURL(/\/entrar\?destino=/);
  });
}
test('sem sessão redireciona e apenas o papel compatível retoma o destino interno', async ({
  page,
}) => {
  await page.goto('/area/produtor/produtos');
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await expect(page.locator('.auth-session-note')).toContainText('escolher um papel');
  await page.getByRole('button', { name: 'Explorar como produtor', exact: true }).click();
  await expect(page).toHaveURL(/\/area\/produtor\/produtos$/);
  await page.reload();
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await page.getByRole('button', { name: 'Explorar como comprador', exact: true }).click();
  await expect(page).toHaveURL(/\/area\/comprador$/);
});
test('papel incompatível mostra recuperação sem trocar a demonstração', async ({ page }) => {
  await explore(page, 'comprador');
  await spaNavigate(page, '/area/administrador/utilizadores');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Este percurso pertence a outro papel.',
  );
  await expect(page.locator('.private-role-line')).toContainText('Comprador');
  await expect(page.getByRole('button', { name: /Aprovar|Eliminar|Licitar/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Voltar à minha área' }).click();
  await expect(page).toHaveURL(/\/area\/comprador$/);
});
test('destino externo é ignorado e rotas privadas inválidas têm recuperação', async ({ page }) => {
  await page.goto('/entrar?destino=https%3A%2F%2Fexample.test');
  await page.getByRole('button', { name: 'Explorar como administrador', exact: true }).click();
  await expect(page).toHaveURL(/\/area\/administrador$/);
  for (const path of [
    '/area/administrador/inexistente',
    '/area/administrador/inexistente/outra',
    '/area/inexistente',
  ]) {
    await spaNavigate(page, path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Este caminho não existe na tua área.',
    );
    await page.getByRole('link', { name: 'Voltar à visão geral' }).click();
    await expect(page).toHaveURL(/\/area\/administrador$/);
  }
  await page.getByRole('link', { name: 'Voltar ao mercado' }).click();
  await expect(page).toHaveURL(/\/produtos$/);
  await expect(page.getByRole('link', { name: 'Área de demonstração' })).toBeVisible();
});
test('trocar papel atualiza navegação pública e mantém sessão apenas em memória', async ({
  page,
}) => {
  await explore(page, 'comprador');
  await page.getByRole('link', { name: 'Explorar outro papel' }).click();
  await page.getByRole('button', { name: 'Explorar como produtor', exact: true }).click();
  await expect(page.locator('.private-role-line')).toContainText('Produtor');
  const stored = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(stored).not.toContain('produtor');
  await page.getByRole('link', { name: 'Voltar ao mercado' }).click();
  await page.getByRole('link', { name: 'Área de demonstração' }).click();
  await expect(page).toHaveURL(/\/area\/produtor$/);
  await page.reload();
  await expect(page).toHaveURL(/\/entrar\?destino=/);
});
test('menu privado móvel usa teclado, Escape, foco e fecha após navegação', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await explore(page, 'comprador');
  const nav = page.getByRole('navigation', { name: 'Navegação da área de demonstração' });
  await expect(nav).toBeHidden();
  const toggle = page.getByRole('button', { name: 'Abrir navegação da área' });
  await toggle.focus();
  await toggle.press('Enter');
  await expect(nav).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await nav.getByRole('link', { name: /As minhas encomendas/ }).click();
  await expect(nav).toBeHidden();
  await expect(page.locator('main')).toBeFocused();
  await page.getByRole('link', { name: 'Voltar ao mercado' }).click();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page
    .getByRole('navigation', { name: 'Navegação móvel' })
    .getByRole('link', { name: /Demonstração: Comprador/ })
    .click();
  await expect(page).toHaveURL(/\/area\/comprador$/);
});
test('entrar, mudar papel e sair da demonstração preserva o carrinho e o mercado', async ({
  page,
}) => {
  await page.goto('/produtos/tomate-coracao');
  await page.getByRole('button', { name: 'Adicionar Tomate coração-de-boi ao carrinho' }).click();
  await page.locator('.header-actions__login').click();
  await page.getByRole('button', { name: 'Explorar como comprador', exact: true }).click();
  await page.getByRole('link', { name: 'A minha cesta' }).click();
  await expect(page.locator('.cart-line h3')).toHaveText('Tomate coração-de-boi');
  await expect(page.locator('.header-cart')).toHaveAttribute('aria-label', 'Carrinho, 1 unidade');
  await page.getByRole('link', { name: 'Área de demonstração' }).click();
  await page.getByRole('link', { name: 'Explorar outro papel' }).click();
  await page.getByRole('button', { name: 'Explorar como produtor', exact: true }).click();
  await page.getByRole('button', { name: 'Sair da demonstração' }).click();
  await page.getByRole('link', { name: '← Continuar pelo mercado' }).click();
  await page.locator('.header-cart').click();
  await expect(page.locator('.cart-line h3')).toHaveText('Tomate coração-de-boi');
  await expect(page.locator('.cart-summary__total')).toContainText('2,80');
  await page.reload();
  await expect(page.locator('.header-cart')).toHaveAttribute('aria-label', 'Carrinho, 1 unidade');
  await expect(page.locator('.header-actions__login')).toHaveText('Entrar');
});
for (const width of [320, 430, 768, 1024, 1280, 1440]) {
  test(`formulários e três áreas sem overflow a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const assertLayout = async () => {
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main')).toHaveCount(1);
      const size = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(size.scroll).toBeLessThanOrEqual(size.client);
    };
    for (const path of [
      '/entrar',
      '/registo',
      '/registo?perfil=produtor',
      '/recuperar-palavra-passe',
    ]) {
      await page.goto(path);
      await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
      await assertLayout();
    }
    for (const role of roles) {
      await explore(page, role);
      await assertLayout();
      if (width < 1024) await page.getByRole('button', { name: 'Abrir navegação da área' }).click();
      const nav = page.getByRole('navigation', { name: 'Navegação da área de demonstração' });
      await expect(nav).toBeVisible();
      await assertLayout();
      for (const link of await nav.getByRole('link').all()) await expect(link).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
