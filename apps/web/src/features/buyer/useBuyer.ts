import { useContext } from 'react';
import { BuyerContext } from './BuyerContext';
export function useBuyer() {
  const value = useContext(BuyerContext);
  if (!value) throw new Error('useBuyer deve ser usado dentro de BuyerProvider.');
  return value;
}
