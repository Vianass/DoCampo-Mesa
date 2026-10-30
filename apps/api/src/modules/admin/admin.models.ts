import { Schema, type Connection, type Types, type Model } from 'mongoose';
export interface AccountAuditRecord {
  utilizadorId: Types.ObjectId;
  administradorId: Types.ObjectId;
  ativoAnterior: boolean;
  ativoAtual: boolean;
  motivo: string;
  ocorridoEm: Date;
  revisao: number;
}
export function createAccountAuditModel(connection: Connection): Model<AccountAuditRecord> {
  if (connection.models.AccountStateAudit)
    return connection.models.AccountStateAudit as Model<AccountAuditRecord>;
  const schema = new Schema<AccountAuditRecord>(
    {
      utilizadorId: { type: Schema.Types.ObjectId, required: true, immutable: true },
      administradorId: { type: Schema.Types.ObjectId, required: true, immutable: true },
      ativoAnterior: { type: Boolean, required: true, immutable: true, cast: false },
      ativoAtual: { type: Boolean, required: true, immutable: true, cast: false },
      motivo: { type: String, required: true, immutable: true, maxlength: 4000 },
      ocorridoEm: { type: Date, required: true, immutable: true },
      revisao: {
        type: Number,
        required: true,
        min: 1,
        immutable: true,
        validate: Number.isSafeInteger,
      },
    },
    {
      collection: 'user_state_audit',
      strict: 'throw',
      autoCreate: false,
      autoIndex: false,
      versionKey: false,
    },
  );
  schema.index({ utilizadorId: 1, revisao: 1 }, { unique: true });
  schema.index({ utilizadorId: 1, ocorridoEm: -1, _id: 1 });
  // A aplicação só acrescenta eventos. Não há API de edição ou eliminação da auditoria.
  schema.pre('save', function () {
    if (!this.isNew) throw Error('Auditoria imutável.');
  });
  for (const operation of [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
    'replaceOne',
  ] as const)
    schema.pre(operation, function () {
      throw Error('Auditoria imutável.');
    });
  return connection.model<AccountAuditRecord>('AccountStateAudit', schema);
}
interface AdminGuard {
  _id: string;
  revisao: number;
}
export function createAdminGuardModel(connection: Connection): Model<AdminGuard> {
  if (connection.models.AdminStateGuard)
    return connection.models.AdminStateGuard as Model<AdminGuard>;
  return connection.model<AdminGuard>(
    'AdminStateGuard',
    new Schema<AdminGuard>(
      {
        _id: { type: String, required: true },
        revisao: { type: Number, required: true, default: 0 },
      },
      {
        collection: 'admin_state_guards',
        strict: 'throw',
        autoCreate: false,
        autoIndex: false,
        versionKey: false,
      },
    ),
  );
}
