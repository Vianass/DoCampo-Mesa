import { producerDemoDataset } from '../../data/producer';
import type { ProducerDataset, ProducerScenario } from './types';

export interface ProducerDataSource {
  load: (scenario: ProducerScenario) => Promise<ProducerDataset>;
}
export function parseProducerScenario(value: string | null): ProducerScenario {
  return value === 'vazio' || value === 'erro' ? value : 'normal';
}
export const producerDemoSource: ProducerDataSource = {
  async load(scenario) {
    if (scenario === 'erro') throw new Error('Indisponibilidade demonstrativa.');
    return scenario === 'vazio'
      ? { ...producerDemoDataset, products: [], orders: [], auctions: [] }
      : producerDemoDataset;
  },
};
