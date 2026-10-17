import { Error as MongooseError, Schema } from 'mongoose';
import type { SchemaTypeOptions } from 'mongoose';

export function textField(
  path: string,
  maximum?: number,
  required = true,
): SchemaTypeOptions<string> {
  return {
    type: String,
    required,
    set(value: unknown) {
      if (value === undefined || value === null) return value;
      if (typeof value !== 'string') {
        throw new MongooseError.CastError('String', '[tipo inválido]', path);
      }
      return value.normalize('NFC').trim();
    },
    validate: {
      validator: (value: string | null | undefined) =>
        value === undefined ||
        (typeof value === 'string' &&
          [...value].length > 0 &&
          (maximum === undefined || [...value].length <= maximum)),
      message: 'Texto obrigatório ou comprimento inválido.',
    },
  };
}

export function dateField(path: string): SchemaTypeOptions<Date> {
  return {
    type: Date,
    required: true,
    set(value: unknown) {
      if (value === undefined || value === null || value instanceof Date) return value;
      throw new MongooseError.CastError('Date', '[tipo inválido]', path);
    },
    validate: {
      validator: (value: Date) => value instanceof Date && Number.isFinite(value.getTime()),
      message: 'Data inválida.',
    },
  };
}

// Estas guardas restringem os caminhos de escrita deste primeiro bloco interno.
// Não substituem autenticação, autorização ou permissões na própria base de dados.
export function requireDocumentValidation<T>(schema: Schema<T>) {
  schema.pre(
    ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'],
    function () {
      throw new Error('Neste bloco, alterar documentos apenas com save e validação completa.');
    },
  );
  schema.pre('bulkWrite', function () {
    throw new Error('Escritas bulk não estão disponíveis neste bloco de modelos.');
  });
  schema.pre('insertMany', function () {
    throw new Error('Inserções bulk não estão disponíveis; utilizar create com validação.');
  });
  schema.pre('save', function (options) {
    if (
      options.validateBeforeSave === false ||
      options.validateModifiedOnly === true ||
      options.pathsToSave !== undefined
    ) {
      throw new Error('Não é permitido guardar documentos sem validação.');
    }
  });
}
