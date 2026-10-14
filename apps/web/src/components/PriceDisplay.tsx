import { formatPrice } from '../data/market';
export function PriceDisplay({
  amountCents,
  unit,
  large = false,
}: {
  amountCents: number;
  unit?: string;
  large?: boolean;
}) {
  return (
    <span className={`price-display ${large ? 'price-display--large' : ''}`}>
      <span>{formatPrice(amountCents)}</span>
      {unit && <span className="price-display__unit">/ {unit}</span>}
    </span>
  );
}
