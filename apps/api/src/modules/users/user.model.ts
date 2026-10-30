import { Schema } from 'mongoose';
import type { Connection, Model, Types } from 'mongoose';
import { z } from 'zod';
import { requireDocumentValidation, textField } from '../shared/model-validation.js';
import { protectDocumentRevision } from '../concurrency/document-revision.js';
import { isArgonPasswordHash, bcryptHashPattern } from '../auth/passwords.js';

export const userRoles = ['comprador', 'produtor', 'administrador'] as const;
export type UserRole = (typeof userRoles)[number];

export interface UserRecord {
  _id: Types.ObjectId;
  nome: string;
  emailNormalizado: string;
  passwordHash: string;
  papeis: UserRole[];
  /** Ausente no legado equivale a ativo; nunca editável no registo público. */
  ativo?: boolean;
  revisaoOperacional?: number;
  createdAt: Date;
  updatedAt: Date;
}

const emailSchema = z.email().max(254);

export function createUserModel(connection: Connection): Model<UserRecord> {
  const existing = connection.models.User as Model<UserRecord> | undefined;
  if (existing) return existing;

  const schema = new Schema<UserRecord>(
    {
      nome: textField('nome', 120),
      emailNormalizado: {
        ...textField('emailNormalizado', 254),
        lowercase: true,
        validate: {
          validator: (value: string) => emailSchema.safeParse(value).success,
          message: 'Email inválido.',
        },
      },
      passwordHash: {
        type: String,
        required: true,
        select: false,
        cast: false,
        validate: {
          validator: (value: string) => bcryptHashPattern.test(value) || isArgonPasswordHash(value),
          message: 'É necessária uma representação de hash válida, nunca uma password em claro.',
        },
      },
      papeis: {
        type: [{ type: String, enum: userRoles, cast: false }],
        required: true,
        default: undefined,
        castNonArrays: false,
        validate: {
          validator: (values: UserRole[]) =>
            values.length > 0 && new Set(values).size === values.length,
          message: 'A lista de papéis deve ser não vazia e não conter repetições.',
        },
      },
      ativo: { type: Boolean, cast: false, default: true, required: true },
      revisaoOperacional: {
        type: Number,
        cast: false,
        required: true,
        default: 0,
        min: 0,
        validate: {
          validator: Number.isSafeInteger,
          message: 'Revisão inteira segura obrigatória.',
        },
      },
    },
    {
      collection: 'users',
      timestamps: true,
      strict: 'throw',
      autoIndex: false,
      autoCreate: false,
      bufferCommands: false,
      toJSON: {
        transform(_document, value) {
          Reflect.deleteProperty(value, 'passwordHash');
          Reflect.deleteProperty(value, 'revisaoOperacional');
          return value;
        },
      },
      toObject: {
        transform(_document, value) {
          Reflect.deleteProperty(value, 'passwordHash');
          Reflect.deleteProperty(value, 'revisaoOperacional');
          return value;
        },
      },
    },
  );
  schema.index({ emailNormalizado: 1 }, { unique: true });
  schema.index({ createdAt: -1, _id: 1 });
  schema.index({ papeis: 1, ativo: 1, createdAt: -1, _id: 1 });
  requireDocumentValidation(schema);
  protectDocumentRevision(schema);
  return connection.model<UserRecord>('User', schema);
}
