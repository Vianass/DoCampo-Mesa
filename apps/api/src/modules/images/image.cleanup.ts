import type { Connection } from 'mongoose';
import type { ImageStorage } from './image.storage.js';
import { referencedImageIds } from './image.references.js';

export const orphanRetentionMs = 7 * 24 * 60 * 60 * 1000;
interface Asset {
  _id: string;
  createdAt: Date;
  storageProvider?: string;
  storageNamespace?: string;
  orphanSince?: Date;
  deletedAt?: Date;
  status?: string;
  deleteRequestedAt?: Date;
}
export async function inspectImageOrphans(
  connection: Connection,
  storage: ImageStorage,
  now = new Date(),
) {
  if (storage.provider !== 'cloudinary' || !storage.namespace)
    throw new Error('Adaptador Cloudinary configurado obrigatório.');
  const assets = await connection
    .db!.collection<Asset>('imageAssets')
    .find({ storageProvider: 'cloudinary', storageNamespace: storage.namespace })
    .maxTimeMS(5000)
    .toArray();
  const referenced = new Set<string>();
  let scanned = 0;
  const collections = await connection.db!.listCollections({}, { nameOnly: true }).toArray();
  for (const { name } of collections) {
    if (name === 'imageAssets' || name.startsWith('system.')) continue;
    for await (const document of connection
      .db!.collection(name)
      .find({}, { maxTimeMS: 5000, batchSize: 100 })) {
      if (++scanned > 100_000)
        throw new Error('Inventário demasiado grande; nenhuma eliminação foi iniciada.');
      for (const id of referencedImageIds(document)) referenced.add(id);
    }
  }
  return {
    scanned,
    assets: assets.map((asset) => ({
      ...asset,
      referenced: referenced.has(asset._id),
      eligible:
        !referenced.has(asset._id) &&
        !asset.deletedAt &&
        asset.orphanSince instanceof Date &&
        now.getTime() - asset.orphanSince.getTime() >= orphanRetentionMs,
    })),
  };
}
export async function markImageOrphans(
  connection: Connection,
  storage: ImageStorage,
  offlineConfirmed: boolean,
  now = new Date(),
) {
  if (!offlineConfirmed)
    throw new Error('Para alterar o inventário, para a API e confirma a manutenção exclusiva.');
  const report = await inspectImageOrphans(connection, storage, now),
    assets = connection.db!.collection<Asset>('imageAssets');
  for (const asset of report.assets) {
    if (asset.referenced)
      await assets.updateOne({ _id: asset._id }, { $unset: { orphanSince: '' } });
    else if (!asset.orphanSince && !asset.deletedAt)
      await assets.updateOne(
        { _id: asset._id, orphanSince: { $exists: false } },
        { $set: { orphanSince: now } },
      );
  }
  return inspectImageOrphans(connection, storage, now);
}
/** Operação apenas de CLI: API parada, IDs explícitos e nova verificação de todas as referências. */
export async function removeImageOrphans(
  connection: Connection,
  storage: ImageStorage,
  ids: string[],
  offlineConfirmed: boolean,
  now = new Date(),
) {
  if (!offlineConfirmed || !ids.length || new Set(ids).size !== ids.length || !storage.remove)
    throw new Error('Confirma manutenção exclusiva e uma lista explícita de fotografias.');
  const report = await inspectImageOrphans(connection, storage, now);
  if (
    ids.some((id) => {
      const asset = report.assets.find((a) => a._id === id);
      return !asset || asset.referenced || (!asset.eligible && !asset.deletedAt);
    })
  )
    throw new Error(
      'Há fotografias referenciadas, sem retenção cumprida ou fora do inventário; nada foi eliminado.',
    );
  let removed = 0,
    alreadyDeleted = 0;
  for (const id of ids) {
    if (report.assets.find((a) => a._id === id)!.deletedAt) {
      alreadyDeleted++;
      continue;
    }
    await connection
      .db!.collection<Asset>('imageAssets')
      .updateOne({ _id: id }, { $set: { status: 'deleting', deleteRequestedAt: now } });
    await storage.remove(id);
    await connection
      .db!.collection<Asset>('imageAssets')
      .updateOne({ _id: id }, { $set: { deletedAt: now, status: 'deleted' } });
    removed++;
  }
  return { removed, alreadyDeleted };
}
