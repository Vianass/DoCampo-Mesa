import { products } from '../../data/market';
import { DEMO_PRODUCER_ID } from '../../data/producer';
import { normalizeSearch } from '../catalog/catalog';
import { orderStatuses } from '../buyer/types';
import { orderTotal } from '../buyer/selectors';
import type { ProductCategory } from '../../types/market';
import type {
  FieldErrors,
  ProductDraft,
  ProductOptions,
  ProfileDraft,
  ProducerCommand,
  ProducerDataset,
  ProducerFeedback,
  ProducerProduct,
} from './types';

export const producerCategories: readonly ProductCategory[] = [
  ...new Set(products.map((product) => product.category)),
];
export const producerUnits = ['kg', 'molho', 'unidade', 'frasco de 500 g'] as const;
export function stockSituation(product: ProducerProduct): ProductOptions['stock'] {
  if (product.availableStock === 0) return 'indisponivel';
  return product.availableStock <= product.lowStockThreshold ? 'reduzido' : 'disponivel';
}
export const stockLabels = {
  disponivel: 'Disponível',
  reduzido: 'Stock reduzido',
  indisponivel: 'Indisponível',
  todos: 'Todos',
};
export function ownProducts(data: ProducerDataset, producerId = DEMO_PRODUCER_ID) {
  return data.products.filter((product) => product.producerId === producerId);
}
export function productOptions(params: URLSearchParams): ProductOptions {
  return {
    search: (params.get('pesquisa') ?? '').slice(0, 100),
    category: producerCategories.find((category) => category === params.get('categoria')) ?? '',
    stock:
      (['disponivel', 'reduzido', 'indisponivel'] as const).find(
        (value) => value === params.get('stock'),
      ) ?? 'todos',
  };
}
export function selectProducerProducts(data: ProducerDataset, options: ProductOptions) {
  const terms = normalizeSearch(options.search).split(/\s+/).filter(Boolean);
  return ownProducts(data)
    .filter((product) => {
      const text = normalizeSearch(product.name + ' ' + product.description);
      return (
        terms.every((term) => text.includes(term)) &&
        (!options.category || options.category === product.category) &&
        (options.stock === 'todos' || stockSituation(product) === options.stock)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-PT') || a.id.localeCompare(b.id));
}
export function selectProducerProduct(data: ProducerDataset, id: string | undefined) {
  return ownProducts(data).find((product) => product.id === id) ?? null;
}
export function ownOrders(data: ProducerDataset, status = 'todos', producerId = DEMO_PRODUCER_ID) {
  const validStatus = orderStatuses.find((value) => value === status) ?? 'todos';
  return data.orders
    .filter(
      (order) =>
        order.producerId === producerId &&
        order.items.every((item) => item.producerId === producerId) &&
        (validStatus === 'todos' || order.status === validStatus),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}
export function ownAuctions(data: ProducerDataset, producerId = DEMO_PRODUCER_ID) {
  return data.auctions.filter((auction) => auction.producerId === producerId);
}
export function producerSummary(data: ProducerDataset) {
  const items = ownProducts(data);
  const orders = ownOrders(data);
  const auctions = ownAuctions(data);
  const sum = (values: readonly number[]) => {
    const total = values.reduce((result, value) => result + value, 0);
    if (!Number.isSafeInteger(total)) throw new Error('Total fora do intervalo seguro.');
    return total;
  };
  return {
    productCount: items.length,
    orderCount: orders.length,
    pendingOrderCount: orders.filter((order) => order.status === 'pendente').length,
    availableUnits: sum(items.map((product) => product.availableStock)),
    lowStockCount: items.filter((product) => stockSituation(product) === 'reduzido').length,
    unavailableCount: items.filter((product) => stockSituation(product) === 'indisponivel').length,
    deliveredValueCents: sum(orders.filter((order) => order.status === 'entregue').map(orderTotal)),
    activeAuctionCount: auctions.filter((auction) => auction.state === 'ativo').length,
    bidCount: sum(auctions.map((auction) => auction.bidCount)),
  };
}
export function priceToCents(value: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole = '', fraction = ''] = value.trim().replace(',', '.').split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}
function integer(value: string) {
  return /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}
export function validateProduct(draft: ProductDraft): FieldErrors<ProductDraft> {
  const errors: FieldErrors<ProductDraft> = {};
  if (!draft.name.trim() || draft.name.trim().length > 120)
    errors.name = 'Indica um nome entre 1 e 120 caracteres.';
  if (draft.description.trim().length > 1000)
    errors.description = 'A descrição pode ter até 1000 caracteres.';
  if (!producerCategories.includes(draft.category as ProductCategory))
    errors.category = 'Escolhe uma categoria do cenário.';
  if (!producerUnits.some((unit) => unit === draft.unit))
    errors.unit = 'Escolhe uma unidade comercial.';
  if (priceToCents(draft.price) === null)
    errors.price = 'Indica um preço não negativo, com até duas casas decimais.';
  if (!integer(draft.stock)) errors.stock = 'Indica uma quantidade inteira não negativa.';
  if (!integer(draft.threshold)) errors.threshold = 'Indica um limiar inteiro não negativo.';
  return errors;
}
export function validateProfile(draft: ProfileDraft): FieldErrors<ProfileDraft> {
  const errors: FieldErrors<ProfileDraft> = {};
  if (!draft.name.trim() || draft.name.trim().length > 120)
    errors.name = 'Indica um nome público entre 1 e 120 caracteres.';
  if (!draft.locality.trim() || draft.locality.trim().length > 120)
    errors.locality = 'Indica uma localidade entre 1 e 120 caracteres.';
  if (draft.description.trim().length > 1000)
    errors.description = 'A descrição pode ter até 1000 caracteres.';
  return errors;
}
export function productDraft(product?: ProducerProduct | null): ProductDraft {
  return {
    name: product?.name ?? '',
    description: product?.description ?? '',
    category: product?.category ?? 'Hortícolas',
    unit: product?.unit ?? 'kg',
    price: product ? (product.priceCents / 100).toFixed(2).replace('.', ',') : '',
    stock: String(product?.availableStock ?? 0),
    threshold: String(product?.lowStockThreshold ?? 3),
  };
}
export function applyProducerCommand(
  data: ProducerDataset,
  command: ProducerCommand,
): { data: ProducerDataset; feedback: ProducerFeedback } {
  const reject = (message: string) => ({ data, feedback: { kind: 'error' as const, message } });
  if (data.producerId !== DEMO_PRODUCER_ID || data.profile.id !== DEMO_PRODUCER_ID)
    return reject('Este cenário não pertence ao produtor demonstrativo.');
  if (command.type === 'profile') {
    if (Object.keys(validateProfile(command.draft)).length)
      return reject('Revê os campos do perfil.');
    const profile = {
      ...data.profile,
      name: command.draft.name.trim(),
      locality: command.draft.locality.trim(),
      description: command.draft.description.trim(),
    };
    return {
      data: {
        ...data,
        profile,
        products: data.products.map((product) =>
          product.producerId === data.producerId
            ? { ...product, producerName: profile.name, producerLocation: profile.locality }
            : product,
        ),
      },
      feedback: {
        kind: 'success',
        message: 'Perfil guardado apenas nesta demonstração. O perfil público não foi alterado.',
      },
    };
  }
  if (Object.keys(validateProduct(command.draft)).length)
    return reject('Revê os campos do produto.');
  const previous = command.id ? selectProducerProduct(data, command.id) : null;
  if (command.id && !previous) return reject('Este produto não pertence ao teu cenário.');
  if (!Number.isSafeInteger(data.nextProductId + 1))
    return reject('Não foi possível criar outro produto.');
  const id = previous?.id ?? 'produto-local-' + data.nextProductId;
  const cents = priceToCents(command.draft.price);
  if (cents === null) return reject('Preço inválido.');
  const product: ProducerProduct = {
    id,
    name: command.draft.name.trim(),
    description: command.draft.description.trim(),
    category: command.draft.category as ProductCategory,
    unit: command.draft.unit,
    priceCents: cents,
    availableStock: Number(command.draft.stock),
    lowStockThreshold: Number(command.draft.threshold),
    producerId: data.producerId,
    producerName: data.profile.name,
    producerLocation: data.profile.locality,
    images: previous?.images ?? [
      { src: '/images/product-placeholder.svg', alt: 'Fotografia a preparar' },
    ],
    organic: previous?.organic ?? false,
    season: previous?.season ?? [],
    featured: previous?.featured ?? false,
    createdAt: previous?.createdAt ?? command.now,
  };
  const items = previous
    ? data.products.map((item) =>
        item.id === id && item.producerId === data.producerId ? product : item,
      )
    : [...data.products, product];
  // An invalid aggregate must not leave a partially applied stock edit.
  const next = { ...data, products: items, nextProductId: data.nextProductId + (previous ? 0 : 1) };
  try {
    producerSummary(next);
  } catch {
    return reject('A quantidade total excede o intervalo seguro. Reduz o stock indicado.');
  }
  return {
    data: next,
    feedback: {
      kind: 'success',
      targetId: id,
      message:
        'Produto guardado apenas nesta demonstração. O catálogo público e a cesta não foram alterados.',
    },
  };
}
