import { Error as MongooseError, Types, mongo } from 'mongoose';
import type { Connection, ClientSession } from 'mongoose';
import { ApiError } from '../../http/api-error.js';
import { createProductModel } from '../products/product.model.js';
import { createProducerModel } from '../producers/producer.model.js';
import { guardUserCapabilities, UserCapabilityError } from '../users/user-capability.repository.js';
import {
  ConcurrencyError,
  operationalRevision,
  revisionCondition,
} from '../concurrency/concurrency-error.js';
import type { AuthPrincipal } from '../auth/auth.service.js';
import { productOwn, productTag } from './catalog.serialization.js';
import { createCatalogRepository, catalogPage } from './catalog.repository.js';
import type { ProductCreate, ProductReplace, OwnCatalogQuery } from './catalog.validation.js';
import { catalogPattern, productWriteFields } from './catalog.validation.js';

export function createCatalogService(connection: Connection, key: Uint8Array) {
  if (key.byteLength < 32) throw Error('Chave interna de catálogo inválida.');
  const Product = createProductModel(connection),
    Producer = createProducerModel(connection);
  const repository = createCatalogRepository(connection);
  let preparation: Promise<void> | undefined;
  const prepare = () =>
    (preparation ??= (async () => {
      for (const model of [Producer, Product]) {
        await model.createCollection();
        await model.createIndexes();
      }
    })());
  function failure(error: unknown): never {
    if (error instanceof ApiError) throw error;
    if (error instanceof UserCapabilityError)
      throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta operação.');
    if (error instanceof ConcurrencyError)
      throw new ApiError(409, 'CONFLITO_REVISAO', 'O recurso mudou. Consulta-o antes de repetir.');
    if (
      error instanceof MongooseError.ValidationError ||
      error instanceof MongooseError.CastError
    ) {
      const paths =
        error instanceof MongooseError.ValidationError ? Object.keys(error.errors) : [error.path];
      const editable = new Set([...Object.keys(productWriteFields), 'estadoPublicacao']);
      throw new ApiError(
        400,
        'PRODUTO_INVALIDO',
        'Verifica os campos e as condições de publicação do produto.',
        paths
          .filter((path) => editable.has(path.split('.')[0]!))
          .map((campo) => ({
            campo,
            mensagem: 'Campo inválido ou incompatível com a publicação.',
          })),
      );
    }
    if (
      error instanceof mongo.MongoNetworkError ||
      error instanceof mongo.MongoServerSelectionError ||
      error instanceof mongo.MongoOperationTimeoutError ||
      (error instanceof mongo.MongoServerError &&
        (error.code === 50 ||
          error.code === 112 ||
          error.hasErrorLabel('UnknownTransactionCommitResult') ||
          error.hasErrorLabel('TransientTransactionError')))
    )
      throw new ApiError(
        503,
        'RESULTADO_INDETERMINADO',
        'Não foi possível confirmar o resultado. Consulta os teus produtos antes de repetir.',
      );
    throw error;
  }
  async function profile(userId: string, session?: ClientSession) {
    const query = Producer.findOne({ userId: new Types.ObjectId(userId) }).select(
      '_id userId aprovacao.estado revisaoOperacional',
    );
    if (session) query.session(session);
    const record = await query.lean();
    if (!record || !['pendente', 'aprovado'].includes(record.aprovacao.estado))
      throw new ApiError(403, 'PRODUTOR_INELEGIVEL', 'Perfil sem autorização para gerir produtos.');
    return record;
  }
  async function guardedProfile(userId: string, session: ClientSession) {
    const record = await profile(userId, session);
    await guardUserCapabilities(connection, new Types.ObjectId(userId), ['produtor'], session);
    const guarded = await Producer.collection.findOneAndUpdate(
      {
        _id: record._id,
        userId: record.userId,
        'aprovacao.estado': record.aprovacao.estado,
        ...revisionCondition(operationalRevision(record.revisaoOperacional)),
      },
      { $inc: { revisaoOperacional: 1 } },
      { session, returnDocument: 'after', includeResultMetadata: false, projection: { _id: 1 } },
    );
    if (!guarded) throw new ConcurrencyError('CONFLITO_VERSAO', 'Perfil alterado.');
    return record;
  }
  async function transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    await prepare();
    const session = await connection.startSession();
    let attempts = 0;
    try {
      return await session.withTransaction(
        async () => {
          if (++attempts > 3)
            throw new ApiError(
              409,
              'CONFLITO_REVISAO',
              'Demasiadas alterações concorrentes. Consulta o recurso antes de repetir.',
            );
          return work(session);
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          timeoutMS: 10_000,
        },
      );
    } catch (error) {
      return failure(error);
    } finally {
      await session.endSession();
    }
  }
  function matchTag(
    current: { _id: Types.ObjectId; revisaoOperacional?: number },
    tag: string | undefined,
  ) {
    if (!tag) throw new ApiError(428, 'PRECONDICAO_OBRIGATORIA', 'Envia o ETag atual em If-Match.');
    if (!/^"[A-Za-z0-9_-]{43}"$/.test(tag))
      throw new ApiError(
        400,
        'IF_MATCH_INVALIDO',
        'Envia um único ETag forte recebido do servidor.',
      );
    if (tag !== productTag(current, key))
      throw new ApiError(
        412,
        'PRECONDICAO_FALHOU',
        'O produto mudou. Consulta-o antes de repetir.',
      );
  }
  async function owned(user: AuthPrincipal, id: string, session?: ClientSession) {
    const query = Product.findById(id);
    if (session) query.session(session);
    const product = await query;
    if (!product) throw new ApiError(404, 'PRODUTO_NAO_ENCONTRADO', 'Produto não encontrado.');
    if (product.produtor.toHexString() !== user.id)
      throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a este produto.');
    return product;
  }
  return {
    prepare,
    ...repository,
    tag: (product: { _id: Types.ObjectId; revisaoOperacional?: number }) =>
      productTag(product, key),
    async ownProducts(user: AuthPrincipal, query: OwnCatalogQuery) {
      await profile(user.id);
      const match = {
        produtor: new Types.ObjectId(user.id),
        ...(query.estado ? { estadoPublicacao: query.estado } : {}),
        ...(query.pesquisa
          ? { nome: { $regex: catalogPattern(query.pesquisa), $options: 'i' } }
          : {}),
      };
      const sort: Record<string, 1 | -1> =
        query.ordem === 'recentes'
          ? { createdAt: -1, _id: 1 }
          : query.ordem === 'preco-asc'
            ? { precoCent: 1, _id: 1 }
            : query.ordem === 'preco-desc'
              ? { precoCent: -1, _id: 1 }
              : { nome: query.ordem === 'nome-desc' ? -1 : 1, _id: 1 };
      const rows = await Product.aggregate<{
        itens: import('../products/product.types.js').ProductRecord[];
        contagem: { total: number }[];
      }>([
        { $match: match },
        {
          $facet: {
            itens: [
              { $sort: sort },
              { $skip: (query.pagina - 1) * query.porPagina },
              { $limit: query.porPagina },
            ],
            contagem: [{ $count: 'total' }],
          },
        },
      ]).option({
        maxTimeMS: 5000,
        collation: { locale: 'pt', strength: 1, numericOrdering: true },
      });
      return catalogPage(rows[0], query.pagina, query.porPagina, (row) => productOwn(row, key));
    },
    async ownProduct(user: AuthPrincipal, id: string) {
      await profile(user.id);
      const product = await owned(user, id);
      return productOwn(product.toObject({ transform: false }), key);
    },
    async create(user: AuthPrincipal, input: ProductCreate) {
      const id = new Types.ObjectId();
      return transaction(async (session) => {
        await guardedProfile(user.id, session);
        const product = new Product({
          _id: id,
          ...input,
          produtor: new Types.ObjectId(user.id),
          estadoPublicacao: 'rascunho',
          moeda: 'EUR',
        });
        await product.save({ session });
        return productOwn(product.toObject({ transform: false }), key);
      });
    },
    async replace(user: AuthPrincipal, id: string, input: ProductReplace, tag: string | undefined) {
      return transaction(async (session) => {
        const product = await owned(user, id, session);
        matchTag(product, tag);
        const producer = await guardedProfile(user.id, session);
        if (
          producer.aprovacao.estado !== 'aprovado' &&
          (product.estadoPublicacao !== 'rascunho' || input.estadoPublicacao !== 'rascunho')
        )
          throw new ApiError(
            403,
            'PRODUTOR_INELEGIVEL',
            'Publicação e gestão comercial exigem aprovação.',
          );
        if (product.estadoPublicacao === 'arquivado' && input.estadoPublicacao !== 'arquivado')
          throw new ApiError(
            409,
            'RESTAURO_NAO_DISPONIVEL',
            'Um produto arquivado não pode ser reativado nesta etapa.',
          );
        for (const field of Object.keys(productWriteFields)) {
          product.set(field, undefined);
          product.set(field, input[field as keyof ProductCreate]);
        }
        product.set('estadoPublicacao', input.estadoPublicacao);
        await product.save({ session });
        return productOwn(product.toObject({ transform: false }), key);
      });
    },
    async archive(user: AuthPrincipal, id: string, tag: string | undefined) {
      return transaction(async (session) => {
        const product = await owned(user, id, session);
        matchTag(product, tag);
        const producer = await guardedProfile(user.id, session);
        if (producer.aprovacao.estado !== 'aprovado' && product.estadoPublicacao !== 'rascunho')
          throw new ApiError(403, 'PRODUTOR_INELEGIVEL', 'Produto sem autorização de gestão.');
        if (product.estadoPublicacao !== 'arquivado') {
          product.estadoPublicacao = 'arquivado';
          await product.save({ session });
        }
      });
    },
  };
}
export type CatalogService = ReturnType<typeof createCatalogService>;
