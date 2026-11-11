import { connectDatabase } from '../src/database/connection.js';
import { cloudOperationEnvironment } from '../src/deployment/operations.js';
import { parseCloudinaryEnvironment } from '../src/config/media-environment.js';

try {
  const configuration = cloudOperationEnvironment();
  const media = process.env.MEDIA_STORAGE;
  if (media === 'cloudinary') parseCloudinaryEnvironment();
  else if (media && media !== 'disabled') throw Error('Adaptador de fotografias não disponível.');
  const database = await connectDatabase(configuration);
  try {
    const hello = await database.connection.db!.admin().command({ hello: 1, maxTimeMS: 5000 });
    const tls = database.connection.getClient().options.tls === true;
    if (
      !hello.setName ||
      !hello.isWritablePrimary ||
      !hello.logicalSessionTimeoutMinutes ||
      (configuration.environment === 'production' && !tls)
    )
      throw Error();
    const collections = await database.connection
      .db!.listCollections({}, { nameOnly: true })
      .toArray();
    console.info(
      JSON.stringify({
        ligacao: 'confirmada',
        replicaSet: true,
        tls,
        sessoes: true,
        colecoes: collections.length,
        fotografias:
          media === 'cloudinary'
            ? 'configuração candidata; ensaio real ainda necessário'
            : 'escolha e configuração pendentes',
        transacoes: 'ensaio funcional ainda necessário no ambiente aprovado',
      }),
    );
  } finally {
    await database.close();
  }
} catch {
  console.error(
    'PREFLIGHT_FALHOU: verifica configuração, TLS, rede, permissões e topologia. Nenhum valor privado foi apresentado.',
  );
  process.exitCode = 1;
}
