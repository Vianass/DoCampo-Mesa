import { connectDatabase } from '../src/database/connection.js';
import { cloudOperationEnvironment, bootstrapAdministrator } from '../src/deployment/operations.js';
try {
  if (
    process.argv.length > 2 ||
    process.stdin.isTTY ||
    process.env.BOOTSTRAP_ADMIN_CONFIRM !== 'CRIAR_PRIMEIRO_ADMINISTRADOR'
  )
    throw Error();
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += String(chunk);
    if (Buffer.byteLength(raw) > 16 * 1024) throw Error();
  }
  const input: unknown = JSON.parse(raw),
    configuration = cloudOperationEnvironment();
  const database = await connectDatabase(configuration);
  try {
    await bootstrapAdministrator(database.connection, input);
    console.info('ADMINISTRADOR_INICIAL_CRIADO: nenhum segredo foi apresentado.');
  } finally {
    await database.close();
  }
} catch {
  console.error(
    'BOOTSTRAP_NAO_CONCLUIDO: confirma a base, a operação e a inexistência de administrador ou conta com o mesmo email.',
  );
  process.exitCode = 1;
}
