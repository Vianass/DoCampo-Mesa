import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import { isRole, type DemoSession, type Role } from './types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DemoSession>({ kind: 'visitor' });
  const startDemonstration = useCallback((role: Role) => {
    if (isRole(role)) setSession({ kind: 'demonstration', role });
  }, []);
  const endDemonstration = useCallback(() => setSession({ kind: 'visitor' }), []);
  const value = useMemo(
    () => ({ session, startDemonstration, endDemonstration }),
    [session, startDemonstration, endDemonstration],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}
