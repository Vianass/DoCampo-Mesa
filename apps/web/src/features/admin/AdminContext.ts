import { createContext } from 'react';
import type { AdminDecisionDraft, AdminFeedback, AdminResource, AdminScenario } from './types';
export interface AdminContextValue {
  resource: AdminResource;
  scenario: AdminScenario;
  feedback: AdminFeedback | null;
  decide: (draft: AdminDecisionDraft) => void;
  refresh: () => void;
}
export const AdminContext = createContext<AdminContextValue | null>(null);
