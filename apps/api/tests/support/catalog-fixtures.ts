import { randomUUID } from 'node:crypto';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import type { Connection } from 'mongoose';
import { decisionInput, producerInput, userInput } from './identity-fixtures.js';
import { producerCommercialInput } from './producer-commercial-fixtures.js';
import { publishedProductInput } from './product-fixtures.js';
import { authConfiguration, authToken } from './auth-fixtures.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createCatalogService } from '../../src/modules/catalog/catalog.service.js';
import { createApp } from '../../src/app.js';

export async function catalogHarness(connection: Connection) {
  const config = authConfiguration(),
    auth = createAuthService(connection, config),
    catalog = createCatalogService(connection, config.secret);
  await auth.prepare();
  await catalog.prepare();
  return { config, auth, catalog, app: createApp({ auth, catalog, security: config }) };
}
export async function catalogActor(
  connection: Connection,
  status: 'pendente' | 'aprovado' = 'aprovado',
  name = 'Exploração fictícia',
  locality = 'Évora',
) {
  const user = await createUserModel(connection).create(
    userInput({ emailNormalizado: randomUUID() + '@example.invalid', papeis: ['produtor'] }),
  );
  const producer = await createProducerModel(connection).create(
    producerInput({
      userId: user._id,
      nomePublico: name,
      localidade: locality,
      aprovacao:
        status === 'aprovado'
          ? decisionInput()
          : { estado: 'pendente', submetidaEm: new Date('2026-10-01T10:00:00Z') },
      comercial: producerCommercialInput({ localLevantamento: 'Local oficial fictício privado' }),
    }),
  );
  return { user, producer };
}
export function productHttpInput(overrides: Record<string, unknown> = {}) {
  return {
    nome: 'Produto fictício HTTP',
    descricao: 'Descrição do produto fictício.',
    categoriaId: 'cat-001',
    precoCent: 150,
    unidadeVenda: { modalidade: 'peso', quantidadeMinima: 250, incrementoCompra: 50 },
    stockDisponivel: 10_000,
    ingredientesAplicaveis: false,
    ingredientes: [],
    etiquetas: ['local'],
    epocaMeses: [6, 7],
    modoProducao: 'Biológico',
    imagens: [
      { url: 'https://example.invalid/catalogo.jpg', alt: 'Fotografia fictícia', principal: true },
    ],
    ...overrides,
  };
}
export async function publishedCatalogProduct(
  connection: Connection,
  actor: Awaited<ReturnType<typeof catalogActor>>,
  overrides: Record<string, unknown> = {},
) {
  return createProductModel(connection).create(
    publishedProductInput({
      produtor: actor.user._id,
      ...productHttpInput(),
      estadoPublicacao: 'publicado',
      ...overrides,
    }),
  );
}
export async function catalogDataset(connection: Connection) {
  const first = await catalogActor(connection, 'aprovado', 'Horta da Ágata', 'Évora');
  const second = await catalogActor(connection, 'aprovado', 'Bruno do Campo', 'Braga');
  const products = [];
  for (let i = 0; i < 15; i++)
    products.push(
      await publishedCatalogProduct(connection, i < 10 ? first : second, {
        nome: (i < 10 ? 'Tomate cereja ' : 'Mel local ') + String(i).padStart(2, '0'),
        precoCent: 100 + i * 10,
        categoriaId: i < 10 ? 'cat-001' : 'cat-007',
        stockDisponivel: i === 0 ? 0 : 1000,
        epocaMeses: i < 10 ? [6, 7] : [10, 11],
        modoProducao: i < 10 ? 'Biológico' : 'Convencional',
      }),
    );
  const draft = await createProductModel(connection).create({
    produtor: first.user._id,
    nome: 'Rascunho privado',
  });
  const archived = await createProductModel(connection).create({
    produtor: first.user._id,
    nome: 'Arquivo privado',
    estadoPublicacao: 'arquivado',
  });
  const withdrawn = await catalogActor(connection);
  const hidden = await publishedCatalogProduct(connection, withdrawn);
  withdrawn.producer.set('aprovacao', {
    estado: 'pendente',
    submetidaEm: new Date('2026-10-01T10:00:00Z'),
  });
  await withdrawn.producer.save();
  const inactive = await catalogActor(connection);
  const inactiveProduct = await publishedCatalogProduct(connection, inactive);
  inactive.user.ativo = false;
  await inactive.user.save();
  return { first, second, products, draft, archived, withdrawn, hidden, inactive, inactiveProduct };
}
export const catalogBearer = (
  harness: Awaited<ReturnType<typeof catalogHarness>>,
  actor: Awaited<ReturnType<typeof catalogActor>>,
) => authToken(harness.config, actor.user._id.toHexString());
