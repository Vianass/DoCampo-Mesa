import type { ClientSession, Connection } from 'mongoose';
import { ApiError } from '../../http/api-error.js';
const identifier = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp/g;
export async function prepareImageAssets(connection: Connection) {
  await connection
    .db!.collection('imageAssets')
    .createIndex(
      { storageProvider: 1, storageNamespace: 1, orphanSince: 1 },
      { name: 'image_orphan_inventory' },
    );
}
export function referencedImageIds(value: unknown): Set<string> {
  const found = new Set<string>(),
    queue: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  while (queue.length) {
    const row = queue.pop()!;
    if (row.depth > 128) throw new Error('Não foi possível verificar todas as referências.');
    if (typeof row.value === 'string') {
      for (const match of row.value.matchAll(identifier)) found.add(match[0]);
    } else if (
      row.value &&
      typeof row.value === 'object' &&
      !Buffer.isBuffer(row.value) &&
      !(row.value instanceof Date) &&
      !('_bsontype' in row.value)
    )
      for (const child of Object.values(row.value))
        queue.push({ value: child, depth: row.depth + 1 });
  }
  return found;
}
/** A associação e o reinício da retenção pertencem à mesma transação do conteúdo. */
export async function retainManagedImages(
  connection: Connection,
  value: unknown,
  session: ClientSession,
) {
  const ids = [...referencedImageIds(value)];
  if (!ids.length) return;
  const assets = connection.db!.collection<{ _id: string; deletedAt?: Date; status?: string }>(
    'imageAssets',
  );
  if (
    await assets.findOne(
      { _id: { $in: ids }, $or: [{ deletedAt: { $exists: true } }, { status: 'deleting' }] },
      { session, projection: { _id: 1 } },
    )
  )
    throw new ApiError(
      400,
      'IMAGEM_REMOVIDA',
      'Uma fotografia foi removida. Envia uma nova fotografia.',
    );
  await assets.updateMany({ _id: { $in: ids } }, { $unset: { orphanSince: '' } }, { session });
}
