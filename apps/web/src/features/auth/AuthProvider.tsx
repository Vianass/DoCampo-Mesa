import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router';
import { AuthContext } from './AuthContext';
import { isRole, type DemoSession, type Role } from './types';
import { createAccountSession } from './account-session';
import { demonstrationSite } from './demo-mode';
export function AuthProvider({ children }: { children: ReactNode }) {
  const [account] = useState(() => createAccountSession());
  const snapshot = useSyncExternalStore(account.subscribe, account.getSnapshot);
  const [demonstration, setDemonstration] = useState<DemoSession>({ kind: 'visitor' });
  const location = useLocation();
  useEffect(() => () => account.dispose(), [account]);
  useEffect(() => {
    if (
      !demonstrationSite &&
      (location.pathname.startsWith('/area') || location.pathname.startsWith('/checkout'))
    )
      void account.revalidate();
  }, [account, location.pathname]);
  useEffect(() => {
    const focus = () => {
      if (!demonstrationSite && document.visibilityState === 'visible') void account.revalidate();
    };
    window.addEventListener('focus', focus);
    window.addEventListener('pageshow', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      window.removeEventListener('focus', focus);
      window.removeEventListener('pageshow', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [account]);
  const startDemonstration = useCallback((role: Role) => {
    if (demonstrationSite && isRole(role)) setDemonstration({ kind: 'demonstration', role });
  }, []);
  const endDemonstration = useCallback(() => setDemonstration({ kind: 'visitor' }), []);
  const value = useMemo(
    () => ({
      ...snapshot,
      demonstration,
      startDemonstration,
      endDemonstration,
      login: account.login,
      logout: account.logout,
      revalidate: account.revalidate,
      request: account.request,
      socketAuth: account.socketAuth,
      trackConnection: account.trackConnection,
    }),
    [snapshot, demonstration, startDemonstration, endDemonstration, account],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}
