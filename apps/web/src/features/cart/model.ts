import { mergeCatalog } from './remote';
import type { Product } from '../../types/market';
import type {
  CartAction,
  CartItem,
  CartOperation,
  CartProducerGroup,
  CartSession,
  CartState,
} from './types';

export function emptyCart(now: string): CartState {
  return { items: [], updatedAt: now };
}
export function quantityError(
  value: string | number,
  stock: number,
  allowZero = true,
): string | null {
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
    return 'Introduz uma quantidade inteira válida.';
  const quantity = Number(raw);
  if (quantity === 0 && !allowZero) return 'A quantidade deve ser pelo menos 1.';
  if (quantity > stock) return `Só existem ${stock} unidades disponíveis neste lote.`;
  return null;
}
function availableProduct(product: Product): boolean {
  return (
    !!product &&
    Number.isSafeInteger(product.availableStock) &&
    product.availableStock > 0 &&
    Number.isSafeInteger(product.priceCents) &&
    product.priceCents >= 0
  );
}
function itemFromProduct(product: Product, quantity: number): CartItem {
  return {
    productId: product.id,
    producerId: product.producerId,
    quantity,
    unitPriceSnapshotCents: product.priceCents,
    unit: product.unit,
    ...(product.source === 'api' ? { productSnapshot: product } : {}),
  };
}
function safeCartTotal(items: readonly CartItem[]) {
  let total = 0;
  for (const item of items) {
    const line = lineTotal(
      item.quantity,
      item.unitPriceSnapshotCents,
      item.productSnapshot?.sale?.quantidadeReferencia ?? 1,
    );
    if (!Number.isSafeInteger(line) || !Number.isSafeInteger(total + line)) return false;
    total += line;
  }
  return true;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function reconcileItems(raw: readonly unknown[], catalog: readonly Product[]) {
  const items: CartItem[] = [];
  const messages: string[] = [];
  for (const value of raw) {
    if (
      !record(value) ||
      typeof value.productId !== 'string' ||
      typeof value.producerId !== 'string' ||
      typeof value.unit !== 'string' ||
      typeof value.quantity !== 'number' ||
      !Number.isSafeInteger(value.quantity) ||
      value.quantity <= 0 ||
      typeof value.unitPriceSnapshotCents !== 'number' ||
      !Number.isSafeInteger(value.unitPriceSnapshotCents) ||
      value.unitPriceSnapshotCents < 0
    ) {
      messages.push('Uma linha inválida foi retirada do carrinho guardado.');
      continue;
    }
    const product = catalog.find((product) => product.id === value.productId);
    if (!product) {
      messages.push('Um produto que já não existe no catálogo foi retirado.');
      continue;
    }
    if (!availableProduct(product)) {
      messages.push(`${product.name} foi retirado porque já não está disponível.`);
      continue;
    }
    const existingIndex = items.findIndex((item) => item.productId === product.id);
    const previousQuantity = items[existingIndex]?.quantity ?? 0;
    const requested = previousQuantity + value.quantity;
    let quantity = Math.min(requested, product.availableStock);
    if (product.sale) {
      const { quantidadeMinima: min, incrementoCompra: step } = product.sale;
      quantity = quantity < min ? 0 : min + Math.floor((quantity - min) / step) * step;
      if (!quantity) {
        messages.push(`${product.name} não tem stock para a quantidade mínima e foi retirado.`);
        continue;
      }
    }
    if (previousQuantity) messages.push(`As linhas repetidas de ${product.name} foram reunidas.`);
    if (requested > product.availableStock)
      messages.push(
        `A quantidade de ${product.name} foi reduzida para ${quantity}, conforme o stock atual.`,
      );
    if (
      value.unitPriceSnapshotCents !== product.priceCents ||
      value.unit !== product.unit ||
      value.producerId !== product.producerId
    )
      messages.push(
        `O preço, a unidade ou a origem de ${product.name} foram atualizados conforme o catálogo.`,
      );
    const next = itemFromProduct(product, quantity);
    const candidate =
      existingIndex < 0
        ? [...items, next]
        : items.map((item, index) => (index === existingIndex ? next : item));
    if (!safeCartTotal(candidate)) {
      messages.push('Uma linha com um valor monetário inválido foi retirada.');
      continue;
    }
    if (existingIndex < 0) items.push(next);
    else items[existingIndex] = next;
  }
  return { items, messages: [...new Set(messages)] };
}

function applyOperation(
  cart: CartState,
  operation: CartOperation,
  catalog: readonly Product[],
  now: string,
) {
  const success = (items: readonly CartItem[], message: string) => ({
    cart: { items, updatedAt: now },
    message,
    kind: 'success' as const,
  });
  const error = (message: string) => ({ cart, message, kind: 'error' as const });
  if (operation.type === 'clear') return success([], 'A tua cesta foi esvaziada.');
  const existing = cart.items.find((item) => item.productId === operation.productId);
  const product = catalog.find((item) => item.id === operation.productId);
  if (operation.type === 'remove' || (operation.type === 'quantity' && operation.quantity === 0))
    return success(
      cart.items.filter((item) => item.productId !== operation.productId),
      `${product?.name ?? 'O produto'} foi retirado da cesta.`,
    );
  if (!product || !availableProduct(product))
    return error('Este produto não está disponível para adicionar à cesta.');
  if (operation.type === 'quantity' && !existing)
    return error('Este produto já não está na cesta.');
  const invalid = quantityError(operation.quantity, product.availableStock, false);
  if (invalid) return error(invalid);
  const quantity =
    operation.type === 'add' ? (existing?.quantity ?? 0) + operation.quantity : operation.quantity;
  if (quantity > product.availableStock)
    return error(
      `Só existem ${product.availableStock} unidades de ${product.name}; já tens ${existing?.quantity ?? 0} na cesta.`,
    );
  const commercialError = productQuantityError(quantity, product);
  if (commercialError) return error(commercialError);
  const next = itemFromProduct(product, quantity);
  const items = existing
    ? cart.items.map((item) => (item.productId === next.productId ? next : item))
    : [...cart.items, next];
  if (!safeCartTotal(items))
    return error('Não foi possível calcular um total válido para esta quantidade.');
  return success(
    items,
    operation.type === 'add'
      ? `${product.name} foi adicionado à cesta. Quantidade na cesta: ${quantity}.`
      : `Quantidade de ${product.name} atualizada para ${quantity}.`,
  );
}

export function cartReducer(session: CartSession, action: CartAction): CartSession {
  if (action.type === 'refresh')
    return cartReducer(session, {
      type: 'reconcile',
      catalog: mergeCatalog(
        session.cart.items.flatMap((i) => (i.productSnapshot ? [i.productSnapshot] : [])),
        action.catalog,
      ),
      now: action.now,
    });
  if (action.type === 'storage-failure')
    return session.storageIssue
      ? session
      : {
          ...session,
          storageIssue:
            'Não foi possível guardar a cesta neste browser. Podes continuar nesta sessão, mas as alterações podem perder-se ao recarregar.',
        };
  const reconciliation = reconcileItems(session.cart.items, action.catalog);
  const changed = JSON.stringify(reconciliation.items) !== JSON.stringify(session.cart.items);
  const cart = changed ? { items: reconciliation.items, updatedAt: action.now } : session.cart;
  const recoveryMessages = reconciliation.messages.length
    ? [...new Set([...session.recoveryMessages, ...reconciliation.messages])]
    : session.recoveryMessages;
  if (action.type === 'reconcile')
    return changed || reconciliation.messages.length
      ? { ...session, cart, recoveryMessages }
      : session;
  const result = applyOperation(cart, action.operation, action.catalog, action.now);
  return {
    ...session,
    cart: result.cart,
    recoveryMessages,
    feedback: {
      id: (session.feedback?.id ?? 0) + 1,
      kind: result.kind,
      message: result.message,
      productId: action.operation.type === 'clear' ? undefined : action.operation.productId,
    },
  };
}

export function cartSummary(cart: CartState, catalog: readonly Product[]) {
  const groups = new Map<string, CartProducerGroup>();
  const countByLine = cart.items.some(
    (i) => i.productSnapshot?.sale && i.productSnapshot.sale.unidadeBase !== 'un',
  );
  let subtotalCents = 0;
  let itemCount = 0;
  for (const item of cart.items) {
    const product = catalog.find((product) => product.id === item.productId);
    if (!product) continue;
    const subtotal = lineTotal(
      item.quantity,
      item.unitPriceSnapshotCents,
      product.sale?.quantidadeReferencia ?? 1,
    );
    let group = groups.get(product.producerId);
    if (!group) {
      group = {
        producerId: product.producerId,
        producerName: product.producerName,
        producerLocation: product.producerLocation,
        lines: [],
        subtotalCents: 0,
        quantity: 0,
      };
      groups.set(product.producerId, group);
    }
    group.lines.push({ item, product, subtotalCents: subtotal });
    group.subtotalCents += subtotal;
    group.quantity += countByLine ? 1 : item.quantity;
    subtotalCents += subtotal;
    itemCount += countByLine ? 1 : item.quantity;
  }
  return {
    producerGroups: [...groups.values()],
    itemCount,
    countByLine,
    subtotalCents,
    totalCents: subtotalCents,
  };
}

/** Half-up inteiro por linha; nunca multiplicar preço/kg por gramas como se fossem kg. */
export function lineTotal(quantity: number, price: number, reference = 1): number {
  if (
    !Number.isSafeInteger(quantity) ||
    !Number.isSafeInteger(price) ||
    !Number.isSafeInteger(reference) ||
    reference < 1
  )
    return NaN;
  const numerator = BigInt(quantity) * BigInt(price),
    denominator = BigInt(reference);
  const cents = (numerator * 2n + denominator) / (2n * denominator);
  return cents > BigInt(Number.MAX_SAFE_INTEGER) ? NaN : Number(cents);
}
export function productQuantityError(
  value: string | number,
  product: Product,
  allowZero = false,
): string | null {
  const basic = quantityError(value, product.availableStock, allowZero);
  if (basic) return basic;
  const q = Number(value);
  if (q === 0 && allowZero) return null;
  if (product.sale) {
    const { quantidadeMinima: min, incrementoCompra: step, unidadeBase: unit } = product.sale;
    if (q < min) return `A quantidade mínima é ${min} ${unit}.`;
    if ((q - min) % step !== 0)
      return `Escolhe ${min} ${unit} ou acrescenta múltiplos de ${step} ${unit}.`;
    if (lineTotal(q, product.priceCents, product.sale.quantidadeReferencia) < 1)
      return 'A quantidade escolhida não permite calcular um valor válido.';
  }
  return null;
}
