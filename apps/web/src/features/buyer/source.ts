import { buyerDemoDataset } from '../../data/buyer';
import type { BuyerDataset, BuyerScenario } from './types';

export interface BuyerDataSource {
  load: (scenario: BuyerScenario) => Promise<BuyerDataset>;
}
export function parseBuyerScenario(value: string | null): BuyerScenario {
  return value === 'vazio' || value === 'erro' ? value : 'normal';
}
export const buyerDemoSource: BuyerDataSource = {
  async load(scenario) {
    if (scenario === 'erro') throw new Error('Indisponibilidade demonstrativa.');
    return scenario === 'vazio'
      ? { observedAt: buyerDemoDataset.observedAt, orders: [], reviews: [], bids: [] }
      : buyerDemoDataset;
  },
};
