import { createContext } from 'react';
import type { BuyerFeedback, BuyerResource, BuyerScenario, ReviewDraft } from './types';

export interface BuyerContextValue {
  resource: BuyerResource;
  scenario: BuyerScenario;
  reviewFeedback: BuyerFeedback | null;
  submitReview: (draft: ReviewDraft) => void;
  refresh: () => void;
}
export const BuyerContext = createContext<BuyerContextValue | null>(null);
