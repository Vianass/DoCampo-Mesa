import { createContext } from 'react';
import type {
  ProductDraft,
  ProfileDraft,
  ProducerFeedback,
  ProducerResource,
  ProducerScenario,
} from './types';
export interface ProducerContextValue {
  resource: ProducerResource;
  scenario: ProducerScenario;
  feedback: ProducerFeedback | null;
  saveProduct: (draft: ProductDraft, id?: string) => void;
  saveProfile: (draft: ProfileDraft) => void;
  refresh: () => void;
}
export const ProducerContext = createContext<ProducerContextValue | null>(null);
