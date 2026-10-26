import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import {
  catalogActor,
  catalogBearer,
  catalogDataset,
  catalogHarness,
  productHttpInput,
} from '../support/catalog-fixtures.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import { userInput } from '../support/identity-fixtures.js';
import { authToken } from '../support/auth-fixtures.js';

let database: Awaited<ReturnType<typeof connectDatabase>> | undefined;
let harness: Awaited<ReturnType<typeof catalogHarness>>;
let dataset: Awaited<ReturnType<typeof catalogDataset>>;
function connection() {
  if (!database) throw Error('Test database missing');
  return database.connection;
}
beforeAll(async () => {
  database = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
    }),
  );
  harness = await catalogHarness(connection());
  dataset = await catalogDataset(connection());
});
afterAll(async () => {
  if (!database) return;
  try {
    await connection().dropDatabase();
  } finally {
    await database.close();
  }
});
async function writer(status: 'pendente' | 'aprovado' = 'aprovado') {
  const actor = await catalogActor(connection(), status);
  return { actor, token: await catalogBearer(harness, actor) };
}
async function draft(
  token: string,
  input: Record<string, unknown> = { nome: 'Rascunho fictício' },
) {
  const response = await request(harness.app)
    .post('/api/products')
    .set('Authorization', 'Bearer ' + token)
    .send(input)
    .expect(201);
  const { etag, location } = response.headers;
  if (typeof etag !== 'string' || typeof location !== 'string')
    throw Error('Resposta sem ETag/Location obrigatórios.');
  return { body: response.body, headers: { ...response.headers, etag, location } };
}

describe('catálogo público', () => {
  it('lista apenas publicados de contas ativas e produtores aprovados com paginação', async () => {
    const first = await request(harness.app).get('/api/products').expect(200);
    expect(first.body).toMatchObject({ pagina: 1, porPagina: 12, total: 15, totalPaginas: 2 });
    expect(first.body.itens).toHaveLength(12);
    const second = await request(harness.app).get('/api/products?pagina=2').expect(200);
    expect(second.body.itens).toHaveLength(3);
    expect(
      new Set([...first.body.itens, ...second.body.itens].map((p: { id: string }) => p.id)).size,
    ).toBe(15);
    const empty = await request(harness.app).get('/api/products?pagina=1000').expect(200);
    expect(empty.body.itens).toEqual([]);
    expect(empty.body.total).toBe(15);
  });
  it.each([
    ['pesquisa=tomate%20evora', 10],
    ['categoria=cat-007', 5],
    ['localidade=evora', 10],
    ['epoca=Ver%C3%A3o', 10],
    ['mes=10', 5],
    ['modoProducao=biologico', 10],
    ['bio=true', 10],
    ['precoMax=1%2C25', 3],
    ['pesquisa=a.*', 0],
  ])('aplica filtro %s', async (query, total) => {
    const result = await request(harness.app)
      .get('/api/products?' + query)
      .expect(200);
    expect(result.body.total).toBe(total);
  });
  it('filtra pelo ID do perfil e combina filtros sem usar IDs de conta públicos', async () => {
    const result = await request(harness.app)
      .get('/api/products')
      .query({
        produtor: dataset.first.producer._id.toHexString(),
        categoria: 'cat-001',
        bio: 'true',
        localidade: 'Évora',
      })
      .expect(200);
    expect(result.body.total).toBe(10);
    expect(result.body.itens[0].produtor.id).toBe(dataset.first.producer._id.toHexString());
    expect(JSON.stringify(result.body)).not.toContain(dataset.first.user._id.toHexString());
  });
  it.each(['preco-asc', 'preco-desc', 'nome-asc', 'nome-desc', 'recentes', 'relevancia'])(
    'ordenação %s é estável e determinística',
    async (order) => {
      const first = await request(harness.app)
        .get('/api/products')
        .query({ ordem: order, porPagina: '36' })
        .expect(200);
      const second = await request(harness.app)
        .get('/api/products')
        .query({ ordem: order, porPagina: '36' })
        .expect(200);
      expect(first.body.itens.map((p: { id: string }) => p.id)).toEqual(
        second.body.itens.map((p: { id: string }) => p.id),
      );
      if (order === 'preco-asc' || order === 'preco-desc') {
        const prices = first.body.itens.map((p: { precoCent: number }) => p.precoCent);
        expect(prices).toEqual(
          [...prices].sort((a: number, b: number) => (order === 'preco-asc' ? a - b : b - a)),
        );
      }
    },
  );
  it.each([
    'porPagina=100',
    'pagina=0',
    'pagina=1001',
    'ordem=arbitraria',
    'categoria[$ne]=x',
    'produtor=slug-demo',
    'mes=13',
    'epoca=Outono&mes=10',
    'pesquisa[$gt]=x',
  ])('recusa query arbitrária %s', async (query) => {
    await request(harness.app)
      .get('/api/products?' + query)
      .expect(400);
  });
  it('detalhe inclui dados de cartão, unidade e disponibilidade sem dados privados', async () => {
    const response = await request(harness.app)
      .get('/api/products/' + dataset.products[0]!._id)
      .expect(200);
    expect(response.body).toMatchObject({
      nome: expect.any(String),
      precoCent: 100,
      moeda: 'EUR',
      disponivel: false,
      stockDisponivel: 0,
      categoria: { id: 'cat-001' },
      produtor: { localidade: 'Évora' },
      imagens: [{ url: expect.any(String) }],
    });
    expect(response.body.unidadeVenda.quantidadeReferencia).toBe(1000);
    for (const secret of [
      'telefone',
      'pagamentoPrivado',
      'revisaoOperacional',
      'catalogoConcelhosVersao',
      'Local oficial fictício privado',
      'PT77000000000000000000000',
    ])
      expect(JSON.stringify(response.body)).not.toContain(secret);
  });
  it.each(['draft', 'archived', 'hidden', 'inactiveProduct'] as const)(
    'não expõe produto %s',
    async (key) => {
      await request(harness.app)
        .get('/api/products/' + dataset[key]._id)
        .expect(404);
    },
  );
  it('distingue identificador inválido de inexistente', async () => {
    await request(harness.app).get('/api/products/slug').expect(400);
    await request(harness.app)
      .get('/api/products/' + new Types.ObjectId())
      .expect(404);
  });
  it('lista perfis públicos e detalhe inclui só produtos publicados paginados', async () => {
    const list = await request(harness.app)
      .get('/api/producers?pesquisa=agata&localidade=evora')
      .expect(200);
    expect(list.body.total).toBe(1);
    const detail = await request(harness.app)
      .get('/api/producers/' + dataset.first.producer._id)
      .expect(200);
    expect(detail.body.nomePublico).toBe('Horta da Ágata');
    expect(detail.body.produtos.total).toBe(10);
    expect(JSON.stringify(detail.body)).not.toContain('pagamentoPrivado');
    expect(JSON.stringify(detail.body)).not.toContain(dataset.first.user._id.toHexString());
    await request(harness.app)
      .get('/api/producers/' + dataset.withdrawn.producer._id)
      .expect(404);
    await request(harness.app)
      .get('/api/producers/' + dataset.inactive.producer._id)
      .expect(404);
    await request(harness.app)
      .get('/api/producers/' + new Types.ObjectId())
      .expect(404);
  });
});

describe('gestão privada de produtos', () => {
  it('visitante/comprador/admin sem capacidade produtor não pode criar', async () => {
    await request(harness.app).post('/api/products').send({ nome: 'Teste' }).expect(401);
    for (const role of ['comprador', 'administrador']) {
      const user = await createUserModel(connection()).create(
        userInput({ emailNormalizado: randomUUID() + '@example.invalid', papeis: [role] }),
      );
      const token = await authToken(harness.config, user._id.toHexString());
      await request(harness.app)
        .post('/api/products')
        .set('Authorization', 'Bearer ' + token)
        .send({ nome: 'Teste' })
        .expect(403);
    }
  });
  it('cria rascunho com Location, permite consulta privada e mantém GET público oculto', async () => {
    const { token } = await writer();
    const created = await draft(token);
    expect(created.body.estadoPublicacao).toBe('rascunho');
    expect(created.headers.location).toBe('/api/products/' + created.body.id);
    await request(harness.app).get(created.headers.location).expect(404);
    const own = await request(harness.app)
      .get('/api/me/products/' + created.body.id)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(own.headers.etag).toBe(created.headers.etag);
    const list = await request(harness.app)
      .get('/api/me/products?estado=rascunho')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(list.body.total).toBe(1);
  });
  it('PUT completo publica explicitamente, valida obrigatórios e devolve novo ETag', async () => {
    const { token } = await writer();
    const created = await draft(token);
    const invalid = await request(harness.app)
      .put(created.headers.location)
      .set('Authorization', 'Bearer ' + token)
      .set('If-Match', created.headers.etag)
      .send({ nome: 'Incompleto', estadoPublicacao: 'publicado' })
      .expect(400);
    expect(invalid.body.codigo).toBe('PRODUTO_INVALIDO');
    expect(invalid.body.campos).toContainEqual({
      campo: 'descricao',
      mensagem: expect.any(String),
    });
    const edited = await request(harness.app)
      .put(created.headers.location)
      .set('Authorization', 'Bearer ' + token)
      .set('If-Match', created.headers.etag)
      .send({ ...productHttpInput(), estadoPublicacao: 'publicado' })
      .expect(200);
    expect(edited.headers.etag).not.toBe(created.headers.etag);
    await request(harness.app).get(created.headers.location).expect(200);
  });
  it('PUT remove campos opcionais omitidos em vez de se comportar como PATCH', async () => {
    const { token } = await writer();
    const created = await draft(token, productHttpInput());
    const edited = await request(harness.app)
      .put(created.headers.location)
      .set('Authorization', 'Bearer ' + token)
      .set('If-Match', created.headers.etag)
      .send({ nome: 'Só nome', estadoPublicacao: 'rascunho' })
      .expect(200);
    expect(edited.body.descricao).toBeUndefined();
    expect(edited.body.precoCent).toBeUndefined();
    expect(edited.body.imagens).toEqual([]);
    expect(edited.body.etiquetas).toEqual([]);
  });
  it('produtor pendente prepara rascunho mas não pode publicar', async () => {
    const { token } = await writer('pendente');
    const created = await draft(token);
    await request(harness.app)
      .put(created.headers.location)
      .set('Authorization', 'Bearer ' + token)
      .set('If-Match', created.headers.etag)
      .send({ ...productHttpInput(), estadoPublicacao: 'publicado' })
      .expect(403);
  });
  it('propriedade é verificada em leitura, edição e arquivo', async () => {
    const owner = await writer(),
      other = await writer();
    const created = await draft(owner.token);
    await request(harness.app)
      .get('/api/me/products/' + created.body.id)
      .set('Authorization', 'Bearer ' + other.token)
      .expect(403);
    await request(harness.app)
      .put(created.headers.location)
      .set('Authorization', 'Bearer ' + other.token)
      .set('If-Match', created.headers.etag)
      .send({ nome: 'Alheio', estadoPublicacao: 'rascunho' })
      .expect(403);
    await request(harness.app)
      .delete(created.headers.location)
      .set('Authorization', 'Bearer ' + other.token)
      .set('If-Match', created.headers.etag)
      .expect(403);
  });
  it.each([
    { precoCent: 0 },
    { precoCent: 1_000_001 },
    { precoCent: 1.5 },
    { stockDisponivel: -1 },
    { stockDisponivel: 10_000_001 },
    { categoriaId: 'sem-categoria' },
    { revisaoOperacional: 0 },
    { produtor: 'outro' },
    { unidadeVenda: { modalidade: 'peso', unidadeBase: 'ml' } },
    { imagens: [{ url: 'javascript:alert(1)' }] },
  ])('recusa preço/stock/unidade/campos inválidos', async (extra) => {
    const { token } = await writer();
    await request(harness.app)
      .post('/api/products')
      .set('Authorization', 'Bearer ' + token)
      .send({ nome: 'Teste', ...extra })
      .expect(400);
  });
  it('If-Match é obrigatório e um ETag antigo não sobrepõe alterações', async () => {
    const { token } = await writer();
    const created = await draft(token);
    await request(harness.app)
      .put(created.headers.location)
      .set('Authorization', 'Bearer ' + token)
      .send({ nome: 'Novo', estadoPublicacao: 'rascunho' })
      .expect(428);
    const changed = await request(harness.app)
      .put(created.headers.location)
      .set('Authorization', 'Bearer ' + token)
      .set('If-Match', created.headers.etag)
      .send({ nome: 'Novo', estadoPublicacao: 'rascunho' })
      .expect(200);
    await request(harness.app)
      .put(created.headers.location)
      .set('Authorization', 'Bearer ' + token)
      .set('If-Match', created.headers.etag)
      .send({ nome: 'Velho', estadoPublicacao: 'rascunho' })
      .expect(412);
    expect(changed.body.nome).toBe('Novo');
  });
  it('DELETE arquiva com 204 sem corpo e impede restauro por PUT', async () => {
    const { token } = await writer();
    const created = await draft(token);
    const deleted = await request(harness.app)
      .delete(created.headers.location)
      .set('Authorization', 'Bearer ' + token)
      .set('If-Match', created.headers.etag)
      .expect(204);
    expect(deleted.text).toBe('');
    const raw = await createProductModel(connection()).findById(created.body.id).orFail();
    expect(raw.estadoPublicacao).toBe('arquivado');
    const own = await request(harness.app)
      .get('/api/me/products/' + created.body.id)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    await request(harness.app)
      .put(created.headers.location)
      .set('Authorization', 'Bearer ' + token)
      .set('If-Match', own.headers.etag!)
      .send({ nome: 'Reativar', estadoPublicacao: 'rascunho' })
      .expect(409);
  });
  it('CORS permite If-Match e expõe ETag/Location para React', async () => {
    const response = await request(harness.app)
      .options('/api/products/x')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'Authorization, Content-Type, If-Match')
      .expect(204);
    expect(response.headers['access-control-expose-headers']).toContain('ETag');
  });
});
