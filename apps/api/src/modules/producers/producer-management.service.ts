import { createHmac } from 'node:crypto';
import { Error as MongooseError, Types, type Connection } from 'mongoose';
import { createProducerModel, type ProducerRecord } from './producer.model.js';
import { guardUserCapabilities, UserCapabilityError } from '../users/user-capability.repository.js';
import { ApiError } from '../../http/api-error.js';
import { ConcurrencyError, operationalRevision } from '../concurrency/concurrency-error.js';
import type { AuthPrincipal } from '../auth/auth.service.js';
import { isCheckoutReadUnavailable } from '../orders/checkout.idempotency.js';
import { profileInput, type ProfileInput } from './producer-management.validation.js';

export function createProducerManagementService(connection: Connection, key: Uint8Array) {
  const Producer = createProducerModel(connection);
  const tag = (p: ProducerRecord) =>
    '"' +
    createHmac('sha256', key)
      .update(`producer-profile-v1:${p._id}:${operationalRevision(p.revisaoOperacional)}`)
      .digest('base64url') +
    '"';
  const dto = (p: ProducerRecord) => ({
    id: p._id.toHexString(),
    nomePublico: p.nomePublico,
    localidade: p.localidade,
    concelho: p.concelho,
    descricao: p.descricao,
    telefone: p.telefone,
    ...(p.localizacaoPublica?.autorizada ? { localizacaoPublica: p.localizacaoPublica } : {}),
    ...(p.imagem ? { imagem: p.imagem } : {}),
    comercial: p.comercial ?? null,
    estadoAprovacao: p.aprovacao.estado,
    etag: tag(p),
  });
  function capability(user: AuthPrincipal) {
    if (!user.papeis.includes('produtor'))
      throw new ApiError(403, 'ACESSO_PROIBIDO', 'É necessária capacidade de produtor.');
  }
  const find = (user: AuthPrincipal) =>
    Producer.findOne({ userId: new Types.ObjectId(user.id) }).select(
      '+telefone +aprovacao.decisao.autor +historicoCandidaturas +comercial.pagamentoPrivado',
    );
  function available(p: ProducerRecord | null): asserts p is ProducerRecord {
    if (!p || !['pendente', 'aprovado'].includes(p.aprovacao.estado))
      throw new ApiError(403, 'PRODUTOR_INELEGIVEL', 'O perfil não permite esta gestão.');
  }
  return {
    async detail(user: AuthPrincipal) {
      capability(user);
      const p = await find(user).lean().maxTimeMS(5000);
      available(p);
      return dto(p);
    },
    async replace(user: AuthPrincipal, input: ProfileInput, match?: string) {
      capability(user);
      const parsed = profileInput.parse(input);
      const session = await connection.startSession();
      let attempts = 0;
      try {
        return await session.withTransaction(
          async () => {
            if (++attempts > 5)
              throw new ApiError(
                409,
                'CONFLITO_REVISAO',
                'O perfil mudou. Consulta antes de repetir.',
              );
            await guardUserCapabilities(
              connection,
              new Types.ObjectId(user.id),
              ['produtor'],
              session,
            );
            const p = await find(user).session(session);
            available(p);
            if (!match)
              throw new ApiError(428, 'PRECONDICAO_OBRIGATORIA', 'Envia o ETag atual em If-Match.');
            if (!/^"[A-Za-z0-9_-]{43}"$/.test(match))
              throw new ApiError(400, 'IF_MATCH_INVALIDO', 'Envia um único ETag forte.');
            if (tag(p) !== match)
              throw new ApiError(
                412,
                'PRECONDICAO_FALHOU',
                'O perfil mudou. Consulta antes de repetir.',
              );
            for (const field of [
              'nomePublico',
              'localidade',
              'concelho',
              'descricao',
              'telefone',
              'imagem',
            ] as const)
              p.set(field, parsed[field]);
            p.set('comercial', parsed.comercial ?? undefined);
            p.set('localizacaoPublica', parsed.localizacaoPublica ?? undefined);
            await p.save({ session });
            return dto(p.toObject({ transform: false }) as ProducerRecord);
          },
          {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
            readPreference: 'primary',
            timeoutMS: 10000,
          },
        );
      } catch (e) {
        if (e instanceof ApiError) throw e;
        if (e instanceof UserCapabilityError)
          throw new ApiError(
            403,
            'ACESSO_PROIBIDO',
            'A capacidade de produtor deixou de estar disponível.',
          );
        if (e instanceof ConcurrencyError)
          throw new ApiError(409, 'CONFLITO_REVISAO', 'O perfil mudou. Consulta antes de repetir.');
        if (e instanceof MongooseError.ValidationError)
          throw new ApiError(400, 'PERFIL_INVALIDO', 'Revê os dados e as condições da loja.');
        if (isCheckoutReadUnavailable(e))
          throw new ApiError(503, 'RESULTADO_INDETERMINADO', 'Consulta o perfil antes de repetir.');
        throw e;
      } finally {
        await session.endSession();
      }
    },
    async indicators(user: AuthPrincipal) {
      capability(user);
      const p = await find(user).lean();
      available(p);
      const owner = new Types.ObjectId(user.id);
      const [products, reviews] = await Promise.all([
        connection
          .db!.collection('products')
          .aggregate(
            [
              { $match: { produtor: owner, estadoPublicacao: { $ne: 'arquivado' } } },
              {
                $group: {
                  _id: null,
                  produtos: { $sum: 1 },
                  publicados: {
                    $sum: { $cond: [{ $eq: ['$estadoPublicacao', 'publicado'] }, 1, 0] },
                  },
                  semStock: { $sum: { $cond: [{ $eq: ['$stockDisponivel', 0] }, 1, 0] } },
                  stockBaixo: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $gt: ['$stockDisponivel', 0] },
                            { $isNumber: '$limiarStockBaixo' },
                            { $lte: ['$stockDisponivel', '$limiarStockBaixo'] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
            ],
            { maxTimeMS: 5000, readConcern: { level: 'majority' } },
          )
          .toArray(),
        connection
          .db!.collection('reviews')
          .aggregate(
            [
              { $match: { vendedor: owner, estado: 'publicada' } },
              {
                $group: { _id: '$alvoTipo', total: { $sum: 1 }, media: { $avg: '$classificacao' } },
              },
            ],
            { maxTimeMS: 5000, readConcern: { level: 'majority' } },
          )
          .toArray(),
      ]);
      const product = products[0];
      return {
        produtos: product?.produtos ?? 0,
        publicados: product?.publicados ?? 0,
        semStock: product?.semStock ?? 0,
        stockBaixo: product?.stockBaixo ?? 0,
        avaliacoes: ['produto', 'produtor'].map((alvoTipo) => {
          const r = reviews.find((v) => v._id === alvoTipo);
          return { alvoTipo, total: r?.total ?? 0, media: r?.media ?? null };
        }),
      };
    },
  };
}
export type ProducerManagementService = ReturnType<typeof createProducerManagementService>;
