import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { ProducerContext } from './ProducerContext';
import { applyProducerCommand } from './selectors';
import { parseProducerScenario, producerDemoSource, type ProducerDataSource } from './source';
import type {
  ProducerCommand,
  ProducerDataset,
  ProducerFeedback,
  ProducerResource,
  ProducerScenario,
  ProductDraft,
  ProfileDraft,
} from './types';
interface State {
  resource: ProducerResource;
  scenario: ProducerScenario;
  feedback: ProducerFeedback | null;
}
type Action =
  | { type: 'loading'; scenario: ProducerScenario }
  | { type: 'loaded'; data: ProducerDataset }
  | { type: 'error' }
  | { type: 'command'; command: ProducerCommand };
function reducer(state: State, action: Action): State {
  if (action.type === 'loading')
    return { resource: { status: 'loading' }, scenario: action.scenario, feedback: null };
  if (action.type === 'loaded')
    return { ...state, resource: { status: 'ready', data: action.data } };
  if (action.type === 'error') return { ...state, resource: { status: 'error' } };
  if (state.resource.status !== 'ready') return state;
  const result = applyProducerCommand(state.resource.data, action.command);
  return { ...state, resource: { status: 'ready', data: result.data }, feedback: result.feedback };
}
export function ProducerProvider({
  children,
  source = producerDemoSource,
}: {
  children: ReactNode;
  source?: ProducerDataSource;
}) {
  const { session } = useAuth();
  const activeRole = session.kind === 'demonstration' && session.role === 'produtor';
  const location = useLocation();
  const [state, dispatch] = useReducer(reducer, {
    resource: { status: 'loading' },
    scenario: 'normal',
    feedback: null,
  });
  const [revision, reload] = useReducer((value: number) => value + 1, 0);
  const scenario = location.pathname.startsWith('/area/produtor')
    ? parseProducerScenario(new URLSearchParams(location.search).get('cenario'))
    : state.scenario;
  useEffect(() => {
    let active = true;
    dispatch({ type: 'loading', scenario });
    if (activeRole)
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
  }, [activeRole, source, scenario, revision]);
  const saveProduct = useCallback(
    (draft: ProductDraft, id?: string) => {
      if (activeRole)
        dispatch({
          type: 'command',
          command: { type: 'product', draft, id, now: new Date().toISOString() },
        });
    },
    [activeRole],
  );
  const saveProfile = useCallback(
    (draft: ProfileDraft) => {
      if (activeRole) dispatch({ type: 'command', command: { type: 'profile', draft } });
    },
    [activeRole],
  );
  const refresh = useCallback(() => reload(), []);
  const value = useMemo(
    () => ({
      resource: state.scenario === scenario ? state.resource : { status: 'loading' as const },
      scenario,
      feedback: state.feedback,
      saveProduct,
      saveProfile,
      refresh,
    }),
    [state, scenario, saveProduct, saveProfile, refresh],
  );
  return <ProducerContext value={value}>{children}</ProducerContext>;
}
