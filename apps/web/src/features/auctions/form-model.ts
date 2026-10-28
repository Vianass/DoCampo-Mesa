import type { OwnProduct } from './contracts';
import { cents } from './model';
export function validateAuctionForm(
  values: {
    title: string;
    description: string;
    base: string;
    increment: string;
    start: string;
    end: string;
    quantity: string;
  },
  product?: OwnProduct,
  edit = false,
) {
  const errors: Record<string, string> = {},
    base = cents(values.base),
    increment = cents(values.increment);
  if (!values.title.trim() || [...values.title.trim()].length > 180)
    errors.title = 'Indica um título até 180 caracteres.';
  if (!values.description.trim() || [...values.description.trim()].length > 5000)
    errors.description = 'Descreve o lote, até 5 000 caracteres.';
  if (base === undefined) errors.base = 'Indica um preço em euros, com até duas casas decimais.';
  if (increment === undefined || increment < 1)
    errors.increment = 'O incremento tem de ser pelo menos 0,01 €.';
  if (
    base !== undefined &&
    increment !== undefined &&
    BigInt(base) + BigInt(increment) > BigInt(Number.MAX_SAFE_INTEGER)
  )
    errors.base = 'O preço e o incremento excedem o limite suportado.';
  const end = Date.parse(values.end),
    start = values.start ? Date.parse(values.start) : undefined;
  if (!Number.isFinite(end)) errors.end = 'Indica uma data e hora de fim válidas.';
  if (start !== undefined && !Number.isFinite(start))
    errors.start = 'Indica um início válido ou deixa vazio para começar de imediato.';
  if (start !== undefined && Number.isFinite(end) && end <= start)
    errors.end = 'O fim tem de ser posterior ao início.';
  if (!edit) {
    if (!product) errors.product = 'Seleciona um produto publicado da tua produção.';
    const q = Number(values.quantity);
    if (!/^\d+$/.test(values.quantity) || !Number.isSafeInteger(q) || q <= 0)
      errors.quantity = 'Indica uma quantidade inteira na unidade indicada.';
    else if (
      product &&
      (q < product.unidadeVenda.quantidadeMinima ||
        (q - product.unidadeVenda.quantidadeMinima) % product.unidadeVenda.incrementoCompra !== 0 ||
        q > product.stockDisponivel)
    )
      errors.quantity = 'Respeita o mínimo, o incremento e o stock disponível do produto.';
  }
  return { errors, base, increment };
}
