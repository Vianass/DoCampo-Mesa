import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { bootstrapAdministrator } from '../../src/deployment/operations.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { verifyPassword } from '../../src/modules/auth/passwords.js';
import { registrationInput } from '../support/auth-fixtures.js';
import {
  catalogActor,
  publishedCatalogProduct,
  catalogHarness,
} from '../support/catalog-fixtures.js';
import { createImageService } from '../../src/modules/images/image.service.js';
import { createProducerManagementService } from '../../src/modules/producers/producer-management.service.js';
import { createApp } from '../../src/app.js';
import { authToken } from '../support/auth-fixtures.js';
import {
  prepareImageAssets,
  retainManagedImages,
} from '../../src/modules/images/image.references.js';
import {
  inspectImageOrphans,
  markImageOrphans,
  removeImageOrphans,
  orphanRetentionMs,
} from '../../src/modules/images/image.cleanup.js';
import type { ImageStorage } from '../../src/modules/images/image.storage.js';

let db: Awaited<ReturnType<typeof connectDatabase>>;
const now = new Date('2026-11-03T12:00:00Z');
const remove = vi.fn<NonNullable<ImageStorage['remove']>>().mockResolvedValue(undefined);
const storage: ImageStorage = {
  kind: 'cloud',
  provider: 'cloudinary',
  namespace: 'ficticia:ensaio',
  publicBase: 'https://api.example.invalid/api/media',
  put: async () => {},
  read: async () => Buffer.alloc(0),
  remove,
};
interface Asset {
  _id: string;
  createdAt: Date;
  storageProvider: string;
  storageNamespace: string;
  orphanSince?: Date;
  deletedAt?: Date;
  status?: string;
}
const assets = () => db.connection.db!.collection<Asset>('imageAssets');
async function asset(overrides: Partial<Asset> = {}) {
  const value = {
    _id: randomUUID() + '.webp',
    createdAt: new Date(now.getTime() - 30 * orphanRetentionMs),
    storageProvider: 'cloudinary',
    storageNamespace: storage.namespace!,
    ...overrides,
  };
  await assets().insertOne(value);
  return value;
}
beforeAll(async () => {
  db = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_cloud_' + randomUUID().replaceAll('-', ''),
    }),
  );
  await prepareImageAssets(db.connection);
});
afterAll(async () => {
  if (db)
    try {
      await db.connection.dropDatabase();
    } finally {
      await db.close();
    }
});
it('simulação não escreve; retenção conta sete dias desde a observação, não desde o upload', async () => {
  const a = await asset();
  const before = await assets().findOne({ _id: a._id });
  expect(
    (await inspectImageOrphans(db.connection, storage, now)).assets.find((v) => v._id === a._id)
      ?.eligible,
  ).toBe(false);
  expect(await assets().findOne({ _id: a._id })).toEqual(before);
  await expect(markImageOrphans(db.connection, storage, false, now)).rejects.toThrow();
  const marked = await markImageOrphans(db.connection, storage, true, now);
  expect(marked.assets.find((value) => value._id === a._id)?.orphanSince).toEqual(now);
  expect(
    (
      await inspectImageOrphans(
        db.connection,
        storage,
        new Date(now.getTime() + orphanRetentionMs - 1),
      )
    ).assets.find((v) => v._id === a._id)?.eligible,
  ).toBe(false);
  expect(
    (
      await inspectImageOrphans(db.connection, storage, new Date(now.getTime() + orphanRetentionMs))
    ).assets.find((v) => v._id === a._id)?.eligible,
  ).toBe(true);
});
it('preserva referências em produtos, perfis, encomendas, leilões, denúncias e auditoria histórica', async () => {
  for (const name of [
    'products',
    'producers',
    'orders',
    'auctions',
    'contentReports',
    'historicEvidence',
  ]) {
    const a = await asset({ orphanSince: new Date(now.getTime() - orphanRetentionMs) });
    await db.connection
      .db!.collection(name)
      .insertOne({ snapshot: { original: { url: storage.publicBase + '/' + a._id } } });
    await expect(removeImageOrphans(db.connection, storage, [a._id], true, now)).rejects.toThrow();
  }
  const report = await inspectImageOrphans(db.connection, storage, now);
  expect(report.assets.filter((v) => v.referenced)).toHaveLength(6);
  await markImageOrphans(db.connection, storage, true, now);
  expect(
    await assets().countDocuments({
      orphanSince: { $exists: true },
      _id: { $in: report.assets.filter((v) => v.referenced).map((v) => v._id) },
    }),
  ).toBe(0);
});
it('valida o lote inteiro, o namespace, a manutenção e a retenção antes de eliminar', async () => {
  const a = await asset({ orphanSince: new Date(now.getTime() - orphanRetentionMs) }),
    b = await asset(),
    outside = await asset({ storageNamespace: 'outra:conta', orphanSince: new Date(0) });
  remove.mockClear();
  for (const ids of [[a._id, b._id], [a._id, outside._id], [a._id, a._id], []])
    await expect(removeImageOrphans(db.connection, storage, ids, true, now)).rejects.toThrow();
  await expect(removeImageOrphans(db.connection, storage, [a._id], false, now)).rejects.toThrow();
  expect(remove).not.toHaveBeenCalled();
  expect(await removeImageOrphans(db.connection, storage, [a._id], true, now)).toEqual({
    removed: 1,
    alreadyDeleted: 0,
  });
  expect((await assets().findOne({ _id: a._id }))?.status).toBe('deleted');
  expect(await removeImageOrphans(db.connection, storage, [a._id], true, now)).toEqual({
    removed: 0,
    alreadyDeleted: 1,
  });
  expect(remove).toHaveBeenCalledTimes(1);
});
it('reatar uma imagem reinicia a retenção na transação; tombstones não podem voltar a ser associados', async () => {
  const a = await asset({ orphanSince: new Date(0) }),
    session = await db.connection.startSession();
  try {
    await session.withTransaction(() =>
      retainManagedImages(db.connection, { url: storage.publicBase + '/' + a._id }, session),
    );
  } finally {
    await session.endSession();
  }
  expect((await assets().findOne({ _id: a._id }))?.orphanSince).toBeUndefined();
  for (const state of [{ status: 'deleting' }, { status: 'deleted', deletedAt: now }]) {
    const tombstone = await asset(state),
      tx = await db.connection.startSession();
    try {
      await expect(
        tx.withTransaction(() =>
          retainManagedImages(db.connection, { url: storage.publicBase + '/' + tombstone._id }, tx),
        ),
      ).rejects.toMatchObject({ status: 400, codigo: 'IMAGEM_REMOVIDA' });
    } finally {
      await tx.endSession();
    }
  }
});
it('falha externa conserva o pedido de eliminação e permite repetição explícita segura', async () => {
  const a = await asset({ orphanSince: new Date(0) });
  remove.mockRejectedValueOnce(new Error('Falha simulada'));
  await expect(removeImageOrphans(db.connection, storage, [a._id], true, now)).rejects.toThrow(
    'Falha simulada',
  );
  expect(await assets().findOne({ _id: a._id })).toMatchObject({ status: 'deleting' });
  expect(await removeImageOrphans(db.connection, storage, [a._id], true, now)).toEqual({
    removed: 1,
    alreadyDeleted: 0,
  });
});
it('bootstrap recusa promover conta existente; concorrência cria um único administrador com Argon2id', async () => {
  const input = registrationInput(),
    User = createUserModel(db.connection);
  await User.createIndexes();
  const { userInput } = await import('../support/identity-fixtures.js');
  const existing = await User.create(
    userInput({ emailNormalizado: input.email, papeis: ['comprador'] }),
  );
  await expect(bootstrapAdministrator(db.connection, input)).rejects.toThrow(
    'substituir ou promover',
  );
  expect((await User.findById(existing._id))?.papeis).toEqual(['comprador']);
  const candidates = [registrationInput(), registrationInput()];
  const results = await Promise.allSettled(
    candidates.map((value) => bootstrapAdministrator(db.connection, value)),
  );
  expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
  expect(await User.countDocuments({ papeis: 'administrador' })).toBe(1);
  const admin = await User.findOne({ papeis: 'administrador' }).select('+passwordHash');
  expect(admin?.passwordHash).toMatch(/^\$argon2id\$/);
  expect(await verifyPassword(admin!.passwordHash, candidates[0]!.password)).toBe(true);
  expect(JSON.stringify(admin)).not.toContain('passwordHash');
  await expect(bootstrapAdministrator(db.connection, registrationInput())).rejects.toThrow(
    'Já existe',
  );
});

it('inventário precede o upload; falha externa mantém recibo rastreável e devolve erro sem segredos', async () => {
  const harness = await catalogHarness(db.connection),
    actor = await catalogActor(db.connection),
    product = await publishedCatalogProduct(db.connection, actor),
    token = await authToken(harness.config, actor.user.id);
  const profiles = createProducerManagementService(db.connection, harness.config.secret);
  const put = vi.fn(async (id: string) => {
    expect(await assets().findOne({ _id: id })).toMatchObject({
      status: 'pending',
      storageProvider: 'cloudinary',
    });
    throw Error('credencial-ficticia-nao-divulgar');
  });
  const app = createApp({
    auth: harness.auth,
    catalog: harness.catalog,
    producerManagement: profiles,
    images: createImageService(db.connection, harness.catalog, profiles, { ...storage, put }),
    security: harness.config,
  });
  const tag = (
    await request(app)
      .get('/api/me/products/' + product.id)
      .set('Authorization', 'Bearer ' + token)
      .expect(200)
  ).headers.etag!;
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#193c34' } })
    .png()
    .toBuffer();
  await request(app)
    .post('/api/me/products/' + product.id + '/images')
    .set('Content-Type', 'image/png')
    .send(bytes)
    .expect(401);
  expect(put).not.toHaveBeenCalled();
  const result = await request(app)
    .post('/api/me/products/' + product.id + '/images')
    .set('Authorization', 'Bearer ' + token)
    .set('If-Match', tag)
    .set('Content-Type', 'image/png')
    .send(bytes)
    .expect(503);
  expect(JSON.stringify(result.body)).not.toContain('credencial-ficticia');
  expect(put).toHaveBeenCalledTimes(1);
  expect(
    (
      await request(app)
        .get('/api/me/products/' + product.id)
        .set('Authorization', 'Bearer ' + token)
    ).headers.etag,
  ).toBe(tag);
  expect(await assets().findOne({ _id: put.mock.calls[0]![0] })).toMatchObject({
    status: 'pending',
  });
});

it('upload associado devolve só o gateway da API e reinicia a retenção na atualização real', async () => {
  const harness = await catalogHarness(db.connection),
    actor = await catalogActor(db.connection),
    product = await publishedCatalogProduct(db.connection, actor),
    token = await authToken(harness.config, actor.user.id);
  const profiles = createProducerManagementService(db.connection, harness.config.secret);
  const put = vi.fn(async (id: string) => {
    await assets().updateOne({ _id: id }, { $set: { orphanSince: new Date(0) } });
  });
  const app = createApp({
    auth: harness.auth,
    catalog: harness.catalog,
    producerManagement: profiles,
    images: createImageService(db.connection, harness.catalog, profiles, { ...storage, put }),
    security: harness.config,
  });
  const before = await request(app)
    .get('/api/me/products/' + product.id)
    .set('Authorization', 'Bearer ' + token)
    .expect(200);
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#193c34' } })
    .png()
    .toBuffer();
  const result = await request(app)
    .post('/api/me/products/' + product.id + '/images')
    .set('Authorization', 'Bearer ' + token)
    .set('If-Match', before.headers.etag!)
    .set('Content-Type', 'image/png')
    .send(bytes)
    .expect(200);
  const id = put.mock.calls[0]![0];
  expect(result.body.imagens.at(-1).url).toBe(storage.publicBase + '/' + id);
  const record = await assets().findOne({ _id: id });
  expect(record?.status).toBe('attached');
  expect(record?.orphanSince).toBeUndefined();
});
