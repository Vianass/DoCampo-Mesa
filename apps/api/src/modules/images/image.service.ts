import { randomUUID } from 'node:crypto';
import { Types, type Connection } from 'mongoose';
import type { AuthPrincipal } from '../auth/auth.service.js';
import type { CatalogService } from '../catalog/catalog.service.js';
import { productReplaceSchema, productWriteFields } from '../catalog/catalog.validation.js';
import type { ProducerManagementService } from '../producers/producer-management.service.js';
import { profileInput } from '../producers/producer-management.validation.js';
import { ImageStorageUnavailable, type ImageStorage } from './image.storage.js';
import { normalizeImage } from './image.validation.js';
import { ApiError } from '../../http/api-error.js';
export function createImageService(
  connection: Connection,
  catalog: CatalogService,
  profiles: ProducerManagementService,
  storage: ImageStorage,
) {
  const url = (id: string) => storage.publicBase + '/' + id;
  async function create(owner: string, input: unknown, type: string) {
    const bytes = await normalizeImage(input, type),
      id = randomUUID() + '.webp';
    // Write-ahead: uma interrupção externa nunca deixa um upload sem identificador no inventário.
    await connection
      .db!.collection<{
        _id: string;
        owner: Types.ObjectId;
        createdAt: Date;
        status: string;
        storageProvider: string;
        storageNamespace?: string;
        uri: string;
      }>('imageAssets')
      .insertOne({
        _id: id,
        owner: new Types.ObjectId(owner),
        createdAt: new Date(),
        status: 'pending',
        storageProvider: storage.provider ?? 'development',
        ...(storage.namespace ? { storageNamespace: storage.namespace } : {}),
        uri: url(id),
      });
    try {
      await storage.put(id, bytes);
      await connection
        .db!.collection<{ _id: string }>('imageAssets')
        .updateOne({ _id: id }, { $set: { status: 'stored' } });
      return { id, uri: url(id) };
    } catch {
      throw new ApiError(
        503,
        'ARMAZENAMENTO_INDISPONIVEL',
        'Não foi possível confirmar o upload. Consulta o produto ou perfil antes de repetir.',
      );
    }
  }
  const attached = (id: string) =>
    connection
      .db!.collection<{ _id: string }>('imageAssets')
      .updateOne({ _id: id }, { $set: { status: 'attached' }, $unset: { orphanSince: '' } })
      .catch(() => undefined);
  return {
    async product(
      user: AuthPrincipal,
      id: string,
      input: unknown,
      type: string,
      tag?: string,
      replace?: number,
    ) {
      const item = await catalog.ownProduct(user, id);
      if (!tag)
        throw new ApiError(428, 'PRECONDICAO_OBRIGATORIA', 'Envia o ETag atual em If-Match.');
      if (tag !== item.etag)
        throw new ApiError(
          412,
          'PRECONDICAO_FALHOU',
          'O produto mudou. Consulta antes de repetir.',
        );
      if (replace === undefined && item.imagens.length >= 2)
        throw new ApiError(409, 'LIMITE_IMAGENS', 'Podes associar até duas fotografias.');
      if (replace !== undefined && !item.imagens[replace])
        throw new ApiError(400, 'IMAGEM_INVALIDA', 'A fotografia a substituir não existe.');
      const asset = await create(user.id, input, type);
      const image = {
        url: asset.uri,
        alt: item.nome,
        principal:
          replace === undefined
            ? !item.imagens.some((v) => v.principal)
            : item.imagens[replace]!.principal,
      };
      const images = [...item.imagens];
      if (replace === undefined) images.push(image);
      else images[replace] = image;
      const fields = Object.fromEntries(
        Object.keys(productWriteFields)
          .filter((k) => k in item)
          .map((k) => [k, item[k as keyof typeof item]]),
      );
      const result = await catalog.replace(
        user,
        id,
        productReplaceSchema.parse({
          ...fields,
          estadoPublicacao: item.estadoPublicacao,
          imagens: images,
        }),
        tag,
      );
      await attached(asset.id);
      return result;
    },
    async profile(user: AuthPrincipal, input: unknown, type: string, tag?: string) {
      const item = await profiles.detail(user);
      if (!tag)
        throw new ApiError(428, 'PRECONDICAO_OBRIGATORIA', 'Envia o ETag atual em If-Match.');
      if (item.etag !== tag)
        throw new ApiError(412, 'PRECONDICAO_FALHOU', 'O perfil mudou. Consulta antes de repetir.');
      const fields = {
        nomePublico: item.nomePublico,
        localidade: item.localidade,
        concelho: item.concelho,
        descricao: item.descricao,
        telefone: item.telefone,
        comercial: item.comercial,
        localizacaoPublica: item.localizacaoPublica,
      };
      const asset = await create(user.id, input, type);
      const result = await profiles.replace(
        user,
        profileInput.parse({
          ...fields,
          imagem: { url: asset.uri, alt: item.nomePublico },
        }),
        tag,
      );
      await attached(asset.id);
      return result;
    },
    async read(id: string, user?: AuthPrincipal) {
      const asset = await connection
        .db!.collection<{ _id: string; owner: Types.ObjectId }>('imageAssets')
        .findOne({ _id: id }, { maxTimeMS: 5000 });
      if (!asset) throw new ApiError(404, 'IMAGEM_NAO_ENCONTRADA', 'Imagem não disponível.');
      const uri = url(id),
        products = connection.db!.collection('products'),
        producers = connection.db!.collection('producers');
      const product = await products.findOne(
        { produtor: asset.owner, 'imagens.url': uri },
        {
          projection: { produtor: 1, estadoPublicacao: 1, 'moderacao.estado': 1 },
          maxTimeMS: 5000,
        },
      );
      const profile = await producers.findOne(
        { userId: asset.owner, 'imagem.url': uri },
        { projection: { userId: 1, aprovacao: 1, 'moderacao.estado': 1 }, maxTimeMS: 5000 },
      );
      const owner = product?.produtor ?? profile?.userId;
      const current = user
        ? await connection
            .db!.collection('users')
            .findOne(
              { _id: new Types.ObjectId(user.id), ativo: { $ne: false } },
              { projection: { papeis: 1 }, maxTimeMS: 5000 },
            )
        : null;
      let allowed =
        !!current &&
        (current.papeis.includes('administrador') ||
          (current.papeis.includes('produtor') && owner?.equals(new Types.ObjectId(user!.id))));
      if (
        !allowed &&
        owner &&
        ((product?.estadoPublicacao === 'publicado' && product.moderacao?.estado !== 'oculta') ||
          (profile && profile.moderacao?.estado !== 'oculta'))
      ) {
        const active = await connection
          .db!.collection('users')
          .findOne(
            { _id: owner, papeis: 'produtor', ativo: { $ne: false } },
            { projection: { _id: 1 }, maxTimeMS: 5000 },
          );
        const approved = await producers.findOne(
          { userId: owner, 'aprovacao.estado': 'aprovado', 'moderacao.estado': { $ne: 'oculta' } },
          { projection: { _id: 1 }, maxTimeMS: 5000 },
        );
        allowed = !!active && !!approved;
      }
      if (!allowed) throw new ApiError(404, 'IMAGEM_NAO_ENCONTRADA', 'Imagem não disponível.');
      try {
        return await storage.read(id);
      } catch (error) {
        if (error instanceof ImageStorageUnavailable)
          throw new ApiError(
            503,
            'ARMAZENAMENTO_INDISPONIVEL',
            'A fotografia está temporariamente indisponível.',
          );
        throw new ApiError(404, 'IMAGEM_NAO_ENCONTRADA', 'Imagem não disponível.');
      }
    },
  };
}
export type ImageService = ReturnType<typeof createImageService>;
