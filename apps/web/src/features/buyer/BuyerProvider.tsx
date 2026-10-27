import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { BuyerContext } from './BuyerContext';
import { buyerDemoSource, parseBuyerScenario, type BuyerDataSource } from './source';
import { createLocalReview, validateReview } from './selectors';
import type {
  BuyerDataset,
  BuyerFeedback,
  BuyerResource,
  BuyerScenario,
  ReviewDraft,
} from './types';

interface State {
  resource: BuyerResource;
  scenario: BuyerScenario;
  reviewFeedback: BuyerFeedback | null;
}
type Action =
  | { type: 'loading'; scenario: BuyerScenario }
  | { type: 'loaded'; data: BuyerDataset }
  | { type: 'error' }
  | { type: 'review'; draft: ReviewDraft; now: string };
function reducer(state: State, action: Action): State {
  if (action.type === 'loading')
    return { resource: { status: 'loading' }, scenario: action.scenario, reviewFeedback: null };
  if (action.type === 'loaded')
    return { ...state, resource: { status: 'ready', data: action.data } };
  if (action.type === 'error')
    return {
      ...state,
      resource: {
        status: 'error',
        message:
          'Não foi possível apresentar a atividade deste cenário. Podes voltar ao conjunto ilustrativo ou tentar novamente.',
      },
    };
  if (state.resource.status !== 'ready') return state;
  const data = state.resource.data;
  const error = validateReview(data, action.draft);
  if (error)
    return {
      ...state,
      reviewFeedback: { id: (state.reviewFeedback?.id ?? 0) + 1, kind: 'error', message: error },
    };
  return {
    ...state,
    resource: {
      status: 'ready',
      data: {
        ...data,
        reviews: [...data.reviews, createLocalReview(data, action.draft, action.now)],
      },
    },
    reviewFeedback: {
      id: (state.reviewFeedback?.id ?? 0) + 1,
      kind: 'success',
      message:
        'Avaliação acrescentada apenas a esta demonstração. Não foi publicada no perfil público nem corresponde a uma compra verificada.',
    },
  };
}
export function BuyerProvider({
  children,
  source = buyerDemoSource,
}: {
  children: ReactNode;
  source?: BuyerDataSource;
}) {
  const { demonstration: session } = useAuth();
  const isBuyer = session.kind === 'demonstration' && session.role === 'comprador';
  const location = useLocation();
  const [state, dispatch] = useReducer(reducer, {
    resource: { status: 'loading' },
    scenario: 'normal',
    reviewFeedback: null,
  });
  const [revision, reload] = useReducer((value: number) => value + 1, 0);
  const scenario = location.pathname.startsWith('/area/comprador')
    ? parseBuyerScenario(new URLSearchParams(location.search).get('cenario'))
    : state.scenario;
  useEffect(() => {
    let active = true;
    dispatch({ type: 'loading', scenario });
    if (isBuyer)
      source
        .load(scenario)
        .then((data) => {
          if (active) dispatch({ type: 'loaded', data });
        })
        .catch(() => {
          if (active) dispatch({ type: 'error' });
        });
    return () => {
      active = false;
    };
  }, [isBuyer, scenario, source, revision]);
  const submitReview = useCallback(
    (draft: ReviewDraft) => {
      if (isBuyer) dispatch({ type: 'review', draft, now: new Date().toISOString() });
    },
    [isBuyer],
  );
  const refresh = useCallback(() => reload(), []);
  const value = useMemo(
    () => ({
      resource: state.scenario === scenario ? state.resource : { status: 'loading' as const },
      scenario,
      reviewFeedback: state.reviewFeedback,
      submitReview,
      refresh,
    }),
    [state, scenario, submitReview, refresh],
  );
  return <BuyerContext value={value}>{children}</BuyerContext>;
}
