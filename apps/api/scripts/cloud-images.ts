import { connectDatabase } from '../src/database/connection.js';
import { cloudOperationEnvironment } from '../src/deployment/operations.js';
import { parseCloudinaryEnvironment } from '../src/config/media-environment.js';
import { cloudinaryImageStorage } from '../src/modules/images/cloudinary.storage.js';
import {
  inspectImageOrphans,
  markImageOrphans,
  removeImageOrphans,
} from '../src/modules/images/image.cleanup.js';
try {
  if (process.env.MEDIA_STORAGE !== 'cloudinary') throw Error();
  const args = process.argv.slice(2),
    mode = args.shift() ?? '--dry-run';
  if (
    !['--dry-run', '--mark-orphans', '--delete'].includes(mode) ||
    (mode !== '--delete' && args.length)
  )
    throw Error();
  const configuration = cloudOperationEnvironment(),
    storage = cloudinaryImageStorage(parseCloudinaryEnvironment());
  const offline = process.env.IMAGE_CLEANUP_CONFIRM === 'API_SUSPENSA_E_SEM_OUTROS_ESCRITORES';
  if (mode !== '--dry-run' && !offline) throw Error();
  const database = await connectDatabase(configuration);
  try {
    if (mode === '--delete')
      console.info(
        JSON.stringify(await removeImageOrphans(database.connection, storage, args, offline)),
      );
    else {
      const report =
        mode === '--mark-orphans'
          ? await markImageOrphans(database.connection, storage, offline)
          : await inspectImageOrphans(database.connection, storage);
      console.info(
        JSON.stringify({
          modo: mode,
          documentosVerificados: report.scanned,
          fotografias: report.assets.map((a) => ({
            id: a._id,
            referenciada: a.referenced,
            elegivel: a.eligible,
            marcada: !!a.orphanSince,
            removida: !!a.deletedAt,
          })),
        }),
      );
    }
  } finally {
    await database.close();
  }
} catch {
  console.error(
    'LIMPEZA_NAO_CONCLUIDA: não retomes a API sem resolver o inventário e os resultados indeterminados; não foram apresentados dados privados.',
  );
  process.exitCode = 1;
}
