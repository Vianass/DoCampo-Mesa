import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { DEMO_ADMIN_ID } from '../../data/admin';
import { useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { AdminContext } from './AdminContext';
import { applyAdminCommand } from './selectors';
import { parseAdminScenario, adminDemoSource, type AdminDataSource } from './source';
import type {
  AdminCommand,
  AdminDataset,
  AdminFeedback,
  AdminResource,
  AdminScenario,
  AdminDecisionDraft,
} from './types';
interface State {
  resource: AdminResource;
  scenario: AdminScenario;
  feedback: AdminFeedback | null;
}
type Action =
  | { type: 'loading'; scenario: AdminScenario }
  | { type: 'loaded'; data: AdminDataset }
  | { type: 'error' }
  | { type: 'command'; command: AdminCommand };
function reducer(state: State, action: Action): State {
  if (action.type === 'loading')
    return { resource: { status: 'loading' }, scenario: action.scenario, feedback: null };
  if (action.type === 'loaded')
    return { ...state, resource: { status: 'ready', data: action.data } };
  if (action.type === 'error') return { ...state, resource: { status: 'error' } };
  if (state.resource.status !== 'ready') return state;
  const result = applyAdminCommand(state.resource.data, action.command);
  return { ...state, resource: { status: 'ready', data: result.data }, feedback: result.feedback };
}
export function AdminProvider({
  children,
  source = adminDemoSource,
}: {
  children: ReactNode;
  source?: AdminDataSource;
}) {
  const { demonstration: session } = useAuth();
  const activeRole = session.kind === 'demonstration' && session.role === 'administrador';
  const location = useLocation();
  const [state, dispatch] = useReducer(reducer, {
    resource: { status: 'loading' },
    scenario: 'normal',
    feedback: null,
  });
  const [revision, reload] = useReducer((value: number) => value + 1, 0);
  const scenario = location.pathname.startsWith('/area/administrador')
    ? parseAdminScenario(new URLSearchParams(location.search).get('cenario'))
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
  const decide = useCallback(
    (draft: AdminDecisionDraft) => {
      if (activeRole)
        dispatch({
          type: 'command',
          command: { ...draft, actorId: DEMO_ADMIN_ID, now: new Date().toISOString() },
        });
    },
    [activeRole],
  );
  const refresh = useCallback(() => reload(), []);
  const value = useMemo(
    () => ({
      resource: state.scenario === scenario ? state.resource : { status: 'loading' as const },
      scenario,
      feedback: state.feedback,
      decide,
      refresh,
    }),
    [state, scenario, decide, refresh],
  );
  return <AdminContext value={value}>{children}</AdminContext>;
}
