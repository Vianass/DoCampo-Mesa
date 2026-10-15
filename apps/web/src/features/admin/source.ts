import { adminDemoDataset } from '../../data/admin';
import type { AdminDataset, AdminScenario } from './types';
export interface AdminDataSource {
  load: (scenario: AdminScenario) => Promise<AdminDataset>;
}
export function parseAdminScenario(value: string | null): AdminScenario {
  return value === 'vazio' || value === 'erro' ? value : 'normal';
}
export const adminDemoSource: AdminDataSource = {
  async load(scenario) {
    if (scenario === 'erro') throw new Error('Indisponibilidade demonstrativa.');
    return scenario === 'vazio'
      ? {
          ...adminDemoDataset,
          users: [],
          producers: [],
          products: [],
          orders: [],
          cases: [],
          auctions: [],
          services: [],
        }
      : adminDemoDataset;
  },
};
