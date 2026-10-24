import { createHash } from 'node:crypto';
import type { CheckoutTechnicalLimits } from './checkout.contract.js';
import { canonicalizeCheckout } from './checkout.canonicalization.js';

export function fingerprintCheckout(
  context: unknown,
  key: unknown,
  request: unknown,
  limits: Partial<CheckoutTechnicalLimits> = {},
): string {
  return createHash('sha256')
    .update(canonicalizeCheckout(context, key, request, limits), 'utf8')
    .digest('hex');
}
