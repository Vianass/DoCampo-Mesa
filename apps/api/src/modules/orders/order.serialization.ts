import { Types } from 'mongoose';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pick(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!object(value)) return {};
  return Object.fromEntries(
    fields.filter((field) => value[field] !== undefined).map((field) => [field, value[field]]),
  );
}

function identifier(value: unknown): string | undefined {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'string') return value;
  if (object(value) && value._id instanceof Types.ObjectId) return value._id.toHexString();
  return undefined;
}

/** Resumo comum minimizado, não uma projeção autorizada por papel ou DTO HTTP definitivo. */
export function serializeOrderSummary(value: unknown): Record<string, unknown> {
  if (!object(value)) return {};
  const result = pick(value, [
    'estado',
    'subtotalProdutosCent',
    'taxaEntregaCent',
    'totalCent',
    'moeda',
    'createdAt',
    'updatedAt',
  ]);
  const id = identifier(value._id);
  if (id !== undefined) result.id = id;
  if (Array.isArray(value.linhas)) {
    result.linhas = value.linhas.filter(object).map((line) => {
      const summary = pick(line, [
        'id',
        'nome',
        'quantidade',
        'precoReferenciaCent',
        'subtotalCent',
      ]);
      const produtoId = identifier(line.produto);
      if (produtoId !== undefined) summary.produtoId = produtoId;
      if (object(line.unidadeSnapshot)) {
        const unit = pick(line.unidadeSnapshot, [
          'modalidade',
          'unidadeBase',
          'quantidadeReferencia',
          'quantidadeMinima',
          'incrementoCompra',
          'rotulo',
        ]);
        if (object(line.unidadeSnapshot.conteudoPorUnidade)) {
          unit.conteudoPorUnidade = pick(line.unidadeSnapshot.conteudoPorUnidade, [
            'quantidade',
            'unidade',
          ]);
        }
        summary.unidadeSnapshot = unit;
      }
      return summary;
    });
  }
  if (object(value.pagamento)) result.pagamento = pick(value.pagamento, ['metodo', 'estado']);
  return result;
}
