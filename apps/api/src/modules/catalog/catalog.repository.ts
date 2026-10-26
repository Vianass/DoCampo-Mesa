import { Types } from 'mongoose';
import type { Connection, PipelineStage } from 'mongoose';
import type { ProductRecord } from '../products/product.types.js';
import type { ProducerRecord } from '../producers/producer.model.js';
import { createProductModel } from '../products/product.model.js';
import { createProducerModel } from '../producers/producer.model.js';
import { catalogPattern, catalogSeasons } from './catalog.validation.js';
import type { CatalogQuery, ProducerQuery } from './catalog.validation.js';
import { productPublic, producerPublic } from './catalog.serialization.js';
import { ApiError } from '../../http/api-error.js';

const producerProjection = {
  _id: 1,
  nomePublico: 1,
  localidade: 1,
  concelho: 1,
  descricao: 1,
  imagem: 1,
  createdAt: 1,
  updatedAt: 1,
  'comercial.modalidades': 1,
  'comercial.taxaEntregaCent': 1,
  'comercial.concelhosEntregaIds': 1,
  'comercial.metodosPagamento': 1,
  'comercial.disponibilidade': 1,
};
/** Conta interna usada só na elegibilidade; nunca sai da projeção pública. */
function approvedProducerStages(): (PipelineStage.Match | PipelineStage.Lookup)[] {
  return [
    { $match: { 'aprovacao.estado': 'aprovado' } },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        pipeline: [
          { $match: { ativo: { $ne: false }, papeis: 'produtor' } },
          { $project: { _id: 1 } },
        ],
        as: 'contaElegivel',
      },
    },
    { $match: { 'contaElegivel.0': { $exists: true } } },
  ];
}
function termMatch(search: string | undefined, fields: string[]): PipelineStage.Match[] {
  return search
    ? [
        {
          $match: {
            $and: search.split(/\s+/).map((term) => ({
              $or: fields.map((field) => ({
                [field]: { $regex: catalogPattern(term), $options: 'i' },
              })),
            })),
          },
        },
      ]
    : [];
}
function sorting(order: string, search?: string): (PipelineStage.AddFields | PipelineStage.Sort)[] {
  if (order === 'preco-asc' || order === 'preco-desc')
    return [{ $sort: { precoCent: order === 'preco-asc' ? 1 : -1, nome: 1, _id: 1 } }];
  if (order === 'recentes') return [{ $sort: { createdAt: -1, _id: 1 } }];
  if (order === 'nome-desc') return [{ $sort: { nome: -1, _id: 1 } }];
  if (order === 'relevancia' && search)
    return [
      {
        $addFields: {
          pontuacao: {
            $switch: {
              branches: [
                {
                  case: {
                    $regexMatch: {
                      input: '$nome',
                      regex: catalogPattern(search, true),
                      options: 'i',
                    },
                  },
                  then: 100,
                },
                {
                  case: {
                    $regexMatch: {
                      input: '$nome',
                      regex: '^' + catalogPattern(search),
                      options: 'i',
                    },
                  },
                  then: 50,
                },
                {
                  case: {
                    $regexMatch: { input: '$nome', regex: catalogPattern(search), options: 'i' },
                  },
                  then: 25,
                },
              ],
              default: 0,
            },
          },
        },
      },
      { $sort: { pontuacao: -1, nome: 1, _id: 1 } },
    ];
  return [{ $sort: { nome: 1, _id: 1 } }];
}
interface Facet<T> {
  itens: T[];
  contagem: { total: number }[];
}
export function catalogPage<T, U>(
  facet: Facet<T> | undefined,
  pagina: number,
  porPagina: number,
  project: (value: T) => U,
) {
  const total = facet?.contagem[0]?.total ?? 0;
  return {
    itens: (facet?.itens ?? []).map(project),
    pagina,
    porPagina,
    total,
    totalPaginas: Math.ceil(total / porPagina),
  };
}
export function createCatalogRepository(connection: Connection) {
  const Product = createProductModel(connection),
    Producer = createProducerModel(connection);
  const options = {
    maxTimeMS: 5000,
    collation: { locale: 'pt', strength: 1, numericOrdering: true },
    readConcern: { level: 'majority' as const },
  };
  function productStages(query: CatalogQuery): PipelineStage[] {
    const months = query.mes ? [query.mes] : query.epoca ? catalogSeasons[query.epoca] : undefined;
    return [
      {
        $match: {
          estadoPublicacao: 'publicado',
          ...(query.categoria ? { categoriaId: query.categoria } : {}),
          ...(months ? { epocaMeses: { $in: [...months] } } : {}),
          ...(query.precoMax !== undefined ? { precoCent: { $lte: query.precoMax } } : {}),
          ...(query.modoProducao
            ? { modoProducao: { $regex: catalogPattern(query.modoProducao, true), $options: 'i' } }
            : {}),
        },
      },
      ...(query.bio === 'true'
        ? ([
            {
              $match: {
                modoProducao: { $regex: catalogPattern('Biológico', true), $options: 'i' },
              },
            },
          ] as PipelineStage[])
        : []),
      {
        $lookup: {
          from: 'producers',
          localField: 'produtor',
          foreignField: 'userId',
          pipeline: [...approvedProducerStages(), { $project: producerProjection }],
          as: 'perfil',
        },
      },
      { $unwind: '$perfil' },
      ...(query.produtor
        ? ([{ $match: { 'perfil._id': new Types.ObjectId(query.produtor) } }] as PipelineStage[])
        : []),
      ...(query.localidade
        ? ([
            {
              $match: {
                'perfil.localidade': {
                  $regex: catalogPattern(query.localidade, true),
                  $options: 'i',
                },
              },
            },
          ] as PipelineStage[])
        : []),
      ...termMatch(query.pesquisa, [
        'nome',
        'descricao',
        'perfil.nomePublico',
        'perfil.localidade',
      ]),
    ];
  }
  return {
    async products(query: CatalogQuery) {
      const result = await Product.aggregate<Facet<ProductRecord & { perfil: ProducerRecord }>>([
        ...productStages(query),
        {
          $facet: {
            itens: [
              ...sorting(query.ordem, query.pesquisa),
              { $skip: (query.pagina - 1) * query.porPagina },
              { $limit: query.porPagina },
            ],
            contagem: [{ $count: 'total' }],
          },
        },
      ]).option(options);
      return catalogPage(result[0], query.pagina, query.porPagina, (row) =>
        productPublic(row, row.perfil),
      );
    },
    async product(id: string) {
      const rows = await Product.aggregate<ProductRecord & { perfil: ProducerRecord }>([
        { $match: { _id: new Types.ObjectId(id) } },
        ...productStages({ pagina: 1, porPagina: 12, ordem: 'relevancia' }),
        { $limit: 1 },
      ]).option(options);
      if (!rows[0]) throw new ApiError(404, 'PRODUTO_NAO_ENCONTRADO', 'Produto não disponível.');
      return { record: rows[0], dto: productPublic(rows[0], rows[0].perfil) };
    },
    async producers(query: ProducerQuery) {
      const pipeline: PipelineStage[] = [
        ...approvedProducerStages(),
        ...(query.localidade
          ? ([
              {
                $match: {
                  localidade: { $regex: catalogPattern(query.localidade, true), $options: 'i' },
                },
              },
            ] as PipelineStage[])
          : []),
        ...termMatch(query.pesquisa, ['nomePublico', 'descricao', 'localidade', 'concelho']),
        { $project: { ...producerProjection, nome: '$nomePublico' } },
        {
          $facet: {
            itens: [
              ...sorting(query.ordem, query.pesquisa),
              { $skip: (query.pagina - 1) * query.porPagina },
              { $limit: query.porPagina },
            ],
            contagem: [{ $count: 'total' }],
          },
        },
      ];
      const result = await Producer.aggregate<Facet<ProducerRecord>>(pipeline).option(options);
      return catalogPage(result[0], query.pagina, query.porPagina, producerPublic);
    },
    async producer(id: string) {
      const result = await Producer.aggregate<ProducerRecord>([
        { $match: { _id: new Types.ObjectId(id) } },
        ...approvedProducerStages(),
        { $project: producerProjection },
        { $limit: 1 },
      ]).option(options);
      if (!result[0])
        throw new ApiError(404, 'PRODUTOR_NAO_ENCONTRADO', 'Produtor não disponível.');
      return producerPublic(result[0]);
    },
  };
}
