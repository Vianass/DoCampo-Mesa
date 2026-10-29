import type { Page } from '@playwright/test';
import type { ProducerApplication } from '../../src/features/producer-application/model';
import { fixtureToken } from './auth-fixtures';
export const applicationInput = {
  nomePublico: 'Horta fictícia da proximidade',
  localidade: 'Localidade fictícia',
  concelho: 'Concelho fictício',
  descricao: 'Produção hortícola fictícia para testes de candidatura.',
  telefone: '+351 000 000 000',
};
export function applicationFixture(
  state: ProducerApplication['estado'] = 'pendente',
): ProducerApplication {
  return {
    ...applicationInput,
    id: '000000000000000000000701',
    estado: state,
    submetidaEm: '2026-10-28T10:00:00.000Z',
    historico: [],
    ...(state === 'pendente'
      ? {}
      : {
          decisao: {
            data: '2026-10-28T11:00:00.000Z',
            ...(state === 'rejeitado'
              ? { justificacao: 'Descreve melhor os produtos da exploração.' }
              : {}),
          },
        }),
  };
}
export async function mockApplication(page: Page) {
  const api = {
    application: null as ProducerApplication | null,
    getStatus: 0,
    getGate: undefined as Promise<void> | undefined,
    postStatus: 201,
    postGate: undefined as Promise<void> | undefined,
    bodies: [] as object[],
    posts: 0,
  };
  await page.route('**/api/me/producer-application', async (route) => {
    if (route.request().headers().authorization !== 'Bearer ' + fixtureToken) {
      await route.fulfill({ status: 401, json: { codigo: 'AUTENTICACAO_INVALIDA' } });
      return;
    }
    if (route.request().method() === 'GET') {
      await api.getGate;
      await route.fulfill({
        status: api.getStatus || (api.application ? 200 : 404),
        json: api.application ?? { codigo: 'CANDIDATURA_NAO_ENCONTRADA' },
      });
      return;
    }
    api.posts++;
    const body = route.request().postDataJSON();
    api.bodies.push(body);
    await api.postGate;
    if (api.postStatus === 201) {
      const prior = api.application;
      api.application = {
        ...applicationFixture(),
        ...body,
        historico:
          prior?.estado === 'rejeitado'
            ? [...prior.historico, { ...prior, estado: 'rejeitado' }]
            : [],
      };
    }
    await route.fulfill({
      status: api.postStatus,
      json:
        api.postStatus === 201
          ? api.application
          : {
              codigo: api.postStatus === 409 ? 'CANDIDATURA_CONFLITO' : 'PEDIDO_INVALIDO',
              mensagem: 'detalhes internos confidenciais de teste',
            },
    });
  });
  return api;
}
export async function fillApplication(page: Page) {
  for (const [name, value] of Object.entries(applicationInput))
    await page.locator(`[name="${name}"]`).fill(value);
}
