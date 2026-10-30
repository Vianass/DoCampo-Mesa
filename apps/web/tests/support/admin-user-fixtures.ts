import type { Page } from '@playwright/test';
import { mockAccount, accountLogin, fixtureUser } from './auth-fixtures';
export const userTag = '"' + 'a'.repeat(43) + '"';
export const userFixture = (index = 1) => ({
  id: (700 + index).toString(16).padStart(24, '0'),
  nome: 'Pessoa fictícia ' + index,
  email: 'pessoa' + index + '@example.invalid',
  papeis: ['comprador'],
  ativo: true,
  registadoEm: '2026-10-30T10:00:00Z',
  capacidades: { comprar: true, vender: false, administrar: false },
});
export async function mockAdminUsers(page: Page, count = 1) {
  const auth = await mockAccount(page);
  auth.roles = ['administrador'];
  const api = {
    users: Array.from({ length: count }, (_, i) => userFixture(i + 1)),
    audits: [] as {
      id: string;
      administradorId: string;
      ativoAnterior: boolean;
      ativoAtual: boolean;
      motivo: string;
      ocorridoEm: string;
    }[],
    status: 0,
    postStatus: 200,
    posts: [] as { body: { ativo: boolean; motivo: string }; tag?: string }[],
    queries: [] as string[],
    postGate: undefined as Promise<void> | undefined,
    gate: undefined as Promise<void> | undefined,
    tag: userTag,
  };
  await page.route('**/api/admin/**', async (route) => {
    const url = new URL(route.request().url()),
      parts = url.pathname.split('/'),
      id = parts[4];
    if (route.request().method() === 'GET') await api.gate;
    if (api.status) {
      await route.fulfill({
        status: api.status,
        json: { codigo: 'ACESSO_PROIBIDO', mensagem: 'segredo não apresentar' },
      });
      return;
    }
    if (url.pathname.endsWith('/dashboard')) {
      await route.fulfill({
        json: {
          observadoEm: '2026-10-30T10:00:00Z',
          totalUtilizadores: api.users.length + 1,
          compradoresAtivos: api.users.filter((u) => u.ativo).length,
          produtoresAprovados: 0,
          candidaturasPendentes: 0,
          produtosPublicados: 0,
          encomendas: 0,
          leiloesAtivos: 0,
        },
      });
      return;
    }
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as { ativo: boolean; motivo: string };
      api.posts.push({ body, tag: route.request().headers()['if-match'] });
      await api.postGate;
      const user = api.users.find((u) => u.id === id)!;
      if (api.postStatus === 200) {
        user.ativo = body.ativo;
        user.capacidades.comprar = body.ativo;
        api.audits.unshift({
          id: (900 + api.audits.length).toString(16).padStart(24, '0'),
          administradorId: fixtureUser.id,
          ativoAnterior: !body.ativo,
          ativoAtual: body.ativo,
          motivo: body.motivo,
          ocorridoEm: '2026-10-30T11:00:00Z',
        });
        api.tag = '"' + 'b'.repeat(43) + '"';
      }
      if (api.postStatus === 412) {
        user.ativo = false;
        user.capacidades.comprar = false;
        api.tag = '"' + 'b'.repeat(43) + '"';
      }
      await route.fulfill({
        status: api.postStatus,
        headers: { ETag: api.tag },
        json: api.postStatus === 200 ? user : { codigo: 'PRECONDICAO_FALHOU' },
      });
      return;
    }
    if (id && !url.pathname.endsWith('/audit')) {
      const user = api.users.find((u) => u.id === id);
      await route.fulfill({
        status: user ? 200 : 404,
        headers: { ETag: api.tag },
        json: user ?? { codigo: 'UTILIZADOR_NAO_ENCONTRADO' },
      });
      return;
    }
    api.queries.push(url.search);
    let items: unknown[] = url.pathname.endsWith('/audit')
      ? api.audits
      : api.users.filter(
          (u) =>
            (!url.searchParams.get('estado') ||
              u.ativo === (url.searchParams.get('estado') === 'ativo')) &&
            (!url.searchParams.get('papel') || u.papeis.includes(url.searchParams.get('papel')!)) &&
            (!url.searchParams.get('pesquisa') ||
              (u.nome + ' ' + u.email)
                .toLowerCase()
                .includes(url.searchParams.get('pesquisa')!.toLowerCase())),
        );
    if (url.searchParams.get('ordem') === 'antigas') items = [...items].reverse();
    const pagina = Number(url.searchParams.get('pagina') ?? 1),
      porPagina = Number(url.searchParams.get('porPagina') ?? 12);
    await route.fulfill({
      json: {
        itens: items.slice((pagina - 1) * porPagina, pagina * porPagina),
        pagina,
        porPagina,
        total: items.length,
        totalPaginas: Math.ceil(items.length / porPagina),
      },
    });
  });
  return { auth, api, login: () => accountLogin(page) };
}
