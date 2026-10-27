import { createHash, randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { hashPassword } from '../modules/auth/passwords.js';
import { createUserModel } from '../modules/users/user.model.js';
import { createProducerModel } from '../modules/producers/producer.model.js';
import { createProductModel } from '../modules/products/product.model.js';
import type { SaleUnitRecord } from '../modules/products/product.types.js';
export interface DevelopmentCatalog {
  producers: readonly {
    id: string;
    name: string;
    locality: string;
    description: string;
    image: string;
    imageAlt: string;
  }[];
  products: readonly {
    id: string;
    name: string;
    description: string;
    category: string;
    priceCents: number;
    unit: string;
    availableStock: number;
    producerId: string;
    organic: boolean;
    season: readonly string[];
    images: readonly { src: string; alt: string }[];
    createdAt: string;
  }[];
}
export function developmentId(kind: string, slug: string) {
  return new Types.ObjectId(
    createHash('sha256')
      .update('docampo-local-catalog-v1:' + kind + ':' + slug)
      .digest('hex')
      .slice(0, 24),
  );
}
export function assertLocalSeed(environment: string | undefined, uri: string, database: string) {
  if (environment !== 'development' || database !== 'docampo_dev_catalog')
    throw Error('Seed permitido apenas em development, na base dedicada docampo_dev_catalog.');
  const url = new URL(uri);
  if (
    url.protocol !== 'mongodb:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '27018' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.searchParams.get('replicaSet') !== 'rs-dcm-dev' ||
    url.searchParams.get('directConnection') !== 'true'
  )
    throw Error('Seed exige o MongoDB local de desenvolvimento documentado.');
}
const categoryMap: Record<string, string> = {
  Hortícolas: 'cat-001',
  Fruta: 'cat-002',
  'Mel e compotas': 'cat-007',
  'Queijos e laticínios': 'cat-005',
  'Azeite e azeitonas': 'cat-008',
  'Frutos secos': 'cat-009',
  'Ervas e aromáticas': 'cat-010',
};
export function developmentCategory(category: string, unit: string) {
  const id =
    category === 'Pão e cereais' ? (unit === 'kg' ? 'cat-003' : 'cat-004') : categoryMap[category];
  if (!id) throw Error('Categoria de demonstração sem mapeamento explícito.');
  return id;
}
export function developmentUnit(unit: string): SaleUnitRecord {
  if (unit === 'kg')
    return {
      modalidade: 'peso',
      unidadeBase: 'g',
      quantidadeReferencia: 1000,
      quantidadeMinima: 250,
      incrementoCompra: 50,
    };
  if (unit === 'L' || unit === 'litro')
    return {
      modalidade: 'volume',
      unidadeBase: 'ml',
      quantidadeReferencia: 1000,
      quantidadeMinima: 250,
      incrementoCompra: 50,
    };
  if (unit === 'unidade')
    return {
      modalidade: 'unidade',
      unidadeBase: 'un',
      quantidadeReferencia: 1,
      quantidadeMinima: 1,
      incrementoCompra: 1,
    };
  // O rótulo original identifica uma apresentação comercial; não se infere o conteúdo.
  return {
    modalidade: 'embalagem',
    unidadeBase: 'un',
    quantidadeReferencia: 1,
    quantidadeMinima: 1,
    incrementoCompra: 1,
    rotulo: unit,
  };
}
/** Inserção exclusiva em base dedicada dev ou test_*; IDs/colisões conferidos, sem atualizar nem apagar dados existentes. */
export async function seedCatalog(
  connection: Connection,
  data: DevelopmentCatalog,
  imageOrigin: string,
) {
  if (connection.name !== 'docampo_dev_catalog' && !connection.name.startsWith('docampo_test_'))
    throw Error('Base não autorizada para dados fictícios.');
  const origin = new URL(imageOrigin);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw Error('Origem de imagens inválida.');
  const User = createUserModel(connection),
    Producer = createProducerModel(connection),
    Product = createProductModel(connection);
  for (const model of [User, Producer, Product]) {
    await model.createCollection();
    await model.createIndexes();
  }
  const desired: {
    model: typeof User | typeof Producer | typeof Product;
    id: Types.ObjectId;
    match: Record<string, unknown>;
    input: Record<string, unknown>;
  }[] = [];
  for (const producer of data.producers) {
    const userId = developmentId('user', producer.id),
      profileId = developmentId('producer', producer.id);
    desired.push({
      model: User,
      id: userId,
      match: { emailNormalizado: producer.id + '@catalogo.example.invalid' },
      input: {
        _id: userId,
        nome: 'Produtor fictício · ' + producer.name,
        emailNormalizado: producer.id + '@catalogo.example.invalid',
        passwordHash: await hashPassword(randomBytes(48).toString('base64url')),
        papeis: ['produtor'],
      },
    });
    desired.push({
      model: Producer,
      id: profileId,
      match: { userId },
      input: {
        _id: profileId,
        userId,
        nomePublico: producer.name,
        localidade: producer.locality,
        concelho: producer.locality,
        descricao: producer.description,
        telefone: '+351 000 000 000',
        imagem: { url: new URL(producer.image, origin).href, alt: producer.imageAlt },
        aprovacao: {
          estado: 'aprovado',
          submetidaEm: new Date('2026-10-01T09:00:00Z'),
          decisao: {
            autor: developmentId('seed-decision', 'ficticio-sem-conta'),
            data: new Date('2026-10-02T09:00:00Z'),
          },
        },
        comercial: {
          modalidades: { levantamento: true, entrega: false },
          concelhosEntregaIds: [],
          disponibilidade: {
            fusoHorario: 'Europe/Lisbon',
            levantamento: [{ diaSemana: 6, inicio: '09:00', fim: '12:00' }],
            entrega: [],
          },
          metodosPagamento: ['dinheiro'],
        },
      },
    });
  }
  const seasonMonths: Record<string, number[]> = {
    Primavera: [3, 4, 5],
    Verão: [6, 7, 8],
    Outono: [9, 10, 11],
    Inverno: [12, 1, 2],
  };
  for (const product of data.products) {
    const sale = developmentUnit(product.unit);
    const id = developmentId('product', product.id);
    const owner = developmentId('user', product.producerId);
    if (!data.producers.some((p) => p.id === product.producerId))
      throw Error('Produtor fictício ausente.');
    desired.push({
      model: Product,
      id,
      match: { produtor: owner, nome: product.name },
      input: {
        _id: id,
        produtor: owner,
        nome: product.name,
        descricao: product.description,
        categoriaId: developmentCategory(product.category, product.unit),
        precoCent: product.priceCents,
        unidadeVenda: sale,
        stockDisponivel: product.availableStock * (sale.quantidadeReferencia ?? 1),
        estadoPublicacao: 'publicado',
        ingredientesAplicaveis: false,
        ingredientes: [],
        etiquetas: ['dados fictícios de desenvolvimento'],
        epocaMeses: [...new Set(product.season.flatMap((s) => seasonMonths[s] ?? []))],
        modoProducao: product.organic ? 'Biológico' : 'Convencional',
        imagens: product.images
          .filter((p) => !p.src.endsWith('product-placeholder.svg'))
          .slice(0, 2)
          .map((image, index) => ({
            url: new URL(image.src, origin).href,
            alt: image.alt,
            principal: index === 0,
          })),
        createdAt: new Date(product.createdAt),
      },
    });
  }
  // Os produtos sem fotografia usam o placeholder já existente, explicitamente identificado.
  for (const item of desired)
    if (
      item.model.modelName === 'Product' &&
      'imagens' in item.input &&
      Array.isArray(item.input.imagens) &&
      !item.input.imagens.length
    )
      item.input.imagens.push({
        url: new URL('/images/product-placeholder.svg', origin).href,
        alt: 'Fotografia não disponibilizada · exemplo de desenvolvimento',
        principal: true,
      });
  const session = await connection.startSession();
  let inserted = 0;
  try {
    await session.withTransaction(
      async () => {
        inserted = 0;
        for (const item of desired) {
          const existing = await item.model.collection.findOne({ _id: item.id }, { session });
          if (existing) {
            for (const [key, value] of Object.entries(item.match))
              if (String(existing[key]) !== String(value))
                throw Error('Colisão de ID: seed cancelado sem substituir dados.');
            continue;
          }
          const document = new item.model(item.input);
          await document.save({ session });
          inserted++;
        }
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
  } finally {
    await session.endSession();
  }
  return { inserted, producers: data.producers.length, products: data.products.length };
}
