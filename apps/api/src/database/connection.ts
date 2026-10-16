import mongoose from 'mongoose';
import type { ApiConfiguration } from '../config/environment.js';

export class DatabaseConnectionError extends Error {
  constructor() {
    super('Não foi possível estabelecer a ligação à base de dados.');
    this.name = 'DatabaseConnectionError';
  }
}

export async function connectDatabase(configuration: ApiConfiguration) {
  const connection = mongoose.createConnection(configuration.mongoUri, {
    dbName: configuration.databaseName,
    serverSelectionTimeoutMS: configuration.selectionTimeoutMs,
    bufferCommands: false,
    autoIndex: false,
  });

  try {
    await connection.asPromise();
  } catch {
    await connection.close().catch(() => undefined);
    throw new DatabaseConnectionError();
  }

  return { connection, close: (force = false) => connection.close(force) };
}
