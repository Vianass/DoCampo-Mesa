import { test as base, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures';
export const test = base.extend({
  page: async ({ page }, use) => {
    await mockCatalog(page);
    await use(page);
  },
});
export { expect };

export type { Page } from '@playwright/test';
