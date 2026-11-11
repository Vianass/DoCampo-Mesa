import type { Connection } from 'mongoose';
import { Types } from 'mongoose';
import { parseEnvironment } from '../config/environment.js';
import { ConfigurationError } from '../config/environment.js';
import { registrationSchema } from '../modules/auth/auth.validation.js';
import { hashPassword } from '../modules/auth/passwords.js';
import { createUserModel } from '../modules/users/user.model.js';

/** Confirmação operacional explícita: nunca inferir a base de dados a partir de credenciais. */
export function cloudOperationEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const configuration = parseEnvironment(environment);
  if (
    environment.CLOUD_DATABASE_CONFIRM !== configuration.databaseName ||
    !(
      configuration.databaseName === 'docampo_demo' ||
      (configuration.environment === 'test' &&
        configuration.databaseName.startsWith('docampo_test_'))
    )
  )
    throw new ConfigurationError(['CLOUD_DATABASE_CONFIRM']);
  return configuration;
}
export async function bootstrapAdministrator(connection: Connection, input: unknown) {
  const data = registrationSchema.parse(input),
    User = createUserModel(connection);
  const passwordHash = await hashPassword(data.password);
  await User.createIndexes();
  const locks = connection.db!.collection<{ _id: string; revision: number }>('bootstrapLocks');
  try {
    await locks.updateOne(
      { _id: 'initial-admin' },
      { $setOnInsert: { revision: 0 } },
      { upsert: true },
    );
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000))
      throw error;
  }
  const session = await connection.startSession();
  try {
    await session.withTransaction(
      async () => {
        await locks.updateOne({ _id: 'initial-admin' }, { $inc: { revision: 1 } }, { session });
        if (await User.exists({ papeis: 'administrador' }).session(session))
          throw new Error('Já existe uma conta administrativa. Nenhuma conta foi modificada.');
        if (await User.exists({ emailNormalizado: data.email }).session(session))
          throw new Error('Não é permitido substituir ou promover uma conta existente.');
        await User.create(
          [
            {
              _id: new Types.ObjectId(),
              nome: data.nome,
              emailNormalizado: data.email,
              passwordHash,
              papeis: ['administrador'],
              ativo: true,
            },
          ],
          { session },
        );
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        timeoutMS: 10_000,
      },
    );
  } finally {
    await session.endSession();
  }
}
