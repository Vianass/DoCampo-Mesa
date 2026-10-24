import { Error as MongooseError } from 'mongoose';
import type { HydratedDocument, Schema } from 'mongoose';
import { ConcurrencyError, operationalRevision, revisionCondition } from './concurrency-error.js';

interface RevisionRecord {
  revisaoOperacional?: number;
}

/** CAS no próprio save; conserva __v e aceita o campo ausente em documentos antigos. */
export function protectDocumentRevision<T extends RevisionRecord>(schema: Schema<T>) {
  function restoreWhere(document: HydratedDocument<T>) {
    if (!document.$locals.operationalWhereActive) return;
    document.$where = document.$locals.operationalPreviousWhere as Record<string, unknown>;
    delete document.$locals.operationalWhereActive;
    delete document.$locals.operationalPreviousWhere;
  }
  function remember(document: HydratedDocument<T>) {
    document.$locals.operationalBaseline = operationalRevision(document.get('revisaoOperacional'));
    restoreWhere(document);
  }
  schema.post('init', remember);
  schema.post('save', remember);
  schema.pre('validate', function () {
    const current = operationalRevision(this.get('revisaoOperacional'));
    if (this.isNew) {
      if (current !== 0)
        throw new ConcurrencyError('VALIDACAO', 'Uma revisão nova começa em zero.');
      return;
    }
    if (!this.isSelected('revisaoOperacional') || this.$locals.operationalBaseline === undefined) {
      throw new ConcurrencyError(
        'LEITURA_INCOMPLETA',
        'Guardar exige documento completo e leitura completa da revisão.',
      );
    }
    if (current !== this.$locals.operationalBaseline)
      throw new ConcurrencyError(
        'CONFLITO_VERSAO',
        'Não atribuir a revisão operacional manualmente.',
      );
  });
  schema.pre('save', function () {
    if (this.isNew || !this.isModified()) return;
    const expected = operationalRevision(this.$locals.operationalBaseline);
    const condition = revisionCondition(expected);
    const existing = this.$where;
    this.$locals.operationalPreviousWhere = existing ?? {};
    this.$locals.operationalWhereActive = true;
    this.$where =
      existing && Object.keys(existing).length ? { $and: [existing, condition] } : condition;
    this.$inc('revisaoOperacional', 1);
  });
  schema.post(
    'save',
    function (error: Error, document: HydratedDocument<T>, next: (error?: Error) => void) {
      restoreWhere(document);
      if (
        error instanceof MongooseError.DocumentNotFoundError ||
        error instanceof MongooseError.VersionError
      ) {
        next(
          new ConcurrencyError(
            'CONFLITO_VERSAO',
            'O documento mudou ou deixou de estar disponível; reler antes de repetir.',
          ),
        );
      } else next(error);
    },
  );
}
