import type { Page } from '@playwright/test';
import { applicationFixture } from './producer-application-fixtures';
import { fixtureToken } from './auth-fixtures';
import type { ApplicationStatus } from '../../src/features/admin-applications/contracts';
import type {
  ProducerApplication,
  ApplicationDecision,
} from '../../src/features/producer-application/model';
export interface AdministrativeFixture extends Omit<ProducerApplication, 'decisao'> {
  utilizadorId: string;
  decisao?: ApplicationDecision & { administradorId: string };
}
export const applicationTag = '"' + 'a'.repeat(43) + '"';
export function administrativeFixture(
  state: ApplicationStatus = 'pendente',
  index = 1,
): AdministrativeFixture {
  const { decisao, ...application } = applicationFixture(state);
  return {
    ...application,
    id: (700 + index).toString(16).padStart(24, '0'),
    utilizadorId: (800 + index).toString(16).padStart(24, '0'),
    nomePublico: 'Exploração fictícia ' + index,
    ...(decisao ? { decisao: { ...decisao, administradorId: '000000000000000000000501' } } : {}),
  };
}
export async function mockAdministrativeApplications(page: Page, count = 1) {
  const api = {
    items: Array.from({ length: count }, (_, i) => administrativeFixture('pendente', i + 1)),
    tag: applicationTag,
    getStatus: 0,
    postStatus: 200,
    detailStatus: 0,
    posts: [] as { action: string; body: unknown; tag: string | undefined }[],
    queries: [] as string[],
    details: 0,
    getGate: undefined as Promise<void> | undefined,
    postGate: undefined as Promise<void> | undefined,
    conflictOutcome: 'aprovado' as ApplicationStatus,
  };
  await page.route('**/api/admin/dashboard', async (route) =>
    route.fulfill({
      json: {
        observadoEm: '2026-10-30T10:00:00Z',
        totalUtilizadores: 1,
        compradoresAtivos: 0,
        produtoresAprovados: 0,
        candidaturasPendentes: api.items.filter((i) => i.estado === 'pendente').length,
        produtosPublicados: 0,
        encomendas: 0,
        leiloesAtivos: 0,
      },
    }),
  );
  await page.route('**/api/admin/producer-applications**', async (route) => {
    const url = new URL(route.request().url()),
      segments = url.pathname.split('/'),
      id = segments[4],
      action = segments[5] ?? '';
    if (route.request().headers().authorization !== 'Bearer ' + fixtureToken) {
      await route.fulfill({ status: 401, json: { codigo: 'AUTENTICACAO_INVALIDA' } });
      return;
    }
    if (route.request().method() === 'GET') {
      await api.getGate;
      if (!id) {
        api.queries.push(url.search);
        let items = api.items.filter(
          (item) =>
            !url.searchParams.get('estado') || item.estado === url.searchParams.get('estado'),
        );
        if (url.searchParams.get('ordem') === 'antigas') items = [...items].reverse();
        const pagina = Number(url.searchParams.get('pagina') ?? 1),
          porPagina = Number(url.searchParams.get('porPagina') ?? 12);
        await route.fulfill({
          status: api.getStatus || 200,
          json: api.getStatus
            ? { codigo: 'ACESSO_PROIBIDO', mensagem: 'segredo interno não apresentar' }
            : {
                itens: items.slice((pagina - 1) * porPagina, pagina * porPagina),
                pagina,
                porPagina,
                total: items.length,
                totalPaginas: Math.ceil(items.length / porPagina),
              },
        });
        return;
      }
      api.details++;
      const item = api.items.find((item) => item.id === id);
      await route.fulfill({
        status: api.detailStatus || (item ? 200 : 404),
        headers: { ETag: api.tag },
        json: item ?? { codigo: 'CANDIDATURA_NAO_ENCONTRADA' },
      });
      return;
    }
    api.posts.push({
      action,
      body: route.request().postDataJSON(),
      tag: route.request().headers()['if-match'],
    });
    await api.postGate;
    const index = api.items.findIndex((item) => item.id === id);
    if (api.postStatus === 200 || api.postStatus === 412) {
      const prior = api.items[index]!;
      api.items[index] = {
        ...administrativeFixture(
          api.postStatus === 412
            ? api.conflictOutcome
            : action === 'approve'
              ? 'aprovado'
              : 'rejeitado',
        ),
        id: prior.id,
        utilizadorId: prior.utilizadorId,
        nomePublico: prior.nomePublico,
        historico: prior.historico,
        ...(action === 'reject' && api.postStatus === 200
          ? {
              decisao: {
                data: '2026-10-28T11:00:00Z',
                administradorId: '000000000000000000000501',
                justificacao: (route.request().postDataJSON() as { justificacao: string })
                  .justificacao,
              },
            }
          : {}),
      };
      api.tag = '"' + 'b'.repeat(43) + '"';
    }
    await route.fulfill({
      status: api.postStatus,
      headers: { ETag: api.tag },
      json:
        api.postStatus === 200
          ? api.items[index]
          : {
              codigo:
                api.postStatus === 412
                  ? 'PRECONDICAO_FALHOU'
                  : api.postStatus === 409
                    ? 'CANDIDATO_INELEGIVEL'
                    : 'RESULTADO_INDETERMINADO',
              mensagem: 'segredo interno não apresentar',
            },
    });
  });
  return api;
}
