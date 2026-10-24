import { mongo } from 'mongoose';

export type ConcurrencyErrorCode =
  | 'VALIDACAO'
  | 'STOCK_INSUFICIENTE'
  | 'PRODUTO_INDISPONIVEL'
  | 'PRODUTOR_INELEGIVEL'
  | 'OFERTA_ALTERADA'
  | 'CONFIGURACAO_ALTERADA'
  | 'CONFLITO_VERSAO'
  | 'MODALIDADE_INDISPONIVEL'
  | 'METODO_NAO_ACEITE'
  | 'CONCELHO_NAO_ABRANGIDO'
  | 'HORARIO_INCOMPATIVEL'
  | 'TRANSACAO_OBRIGATORIA'
  | 'LEITURA_INCOMPLETA';

export class ConcurrencyError extends Error {
  constructor(
    readonly codigo: ConcurrencyErrorCode,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ConcurrencyError';
  }
}

/** Não embrulhar estes erros: o driver precisa dos labels originais para repetir transações. */
export function isMongoWriteConflict(error: unknown): boolean {
  return error instanceof mongo.MongoServerError && error.code === 112;
}

export function operationalRevision(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ConcurrencyError('VALIDACAO', 'Revisão operacional inválida.');
  }
  return value;
}

export function revisionCondition(expected: number): Record<string, unknown> {
  if (typeof expected !== 'number')
    throw new ConcurrencyError('VALIDACAO', 'Revisão esperada obrigatória.');
  operationalRevision(expected);
  if (expected === Number.MAX_SAFE_INTEGER)
    throw new ConcurrencyError('VALIDACAO', 'Revisão operacional esgotada.');
  return expected === 0
    ? { $or: [{ revisaoOperacional: 0 }, { revisaoOperacional: { $exists: false } }] }
    : { revisaoOperacional: expected };
}
