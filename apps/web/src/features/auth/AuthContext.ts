import { createContext } from 'react';
import type { AccountSession, AccountUser, DemoSession, Role } from './types';
import type { Credentials } from './auth-api';
import type { createAccountSession } from './account-session';
export interface AuthContextValue {
  session: AccountSession;
  notice?: string;
  reason?: 'logout' | 'expired' | 'invalid';
  demonstration: DemoSession;
  startDemonstration: (role: Role) => void;
  endDemonstration: () => void;
  login: (credentials: Credentials, signal?: AbortSignal) => Promise<AccountUser>;
  logout: () => Promise<void>;
  revalidate: () => Promise<void>;
  request: ReturnType<typeof createAccountSession>['request'];
  socketAuth: ReturnType<typeof createAccountSession>['socketAuth'];
  trackConnection: ReturnType<typeof createAccountSession>['trackConnection'];
}
export const AuthContext = createContext<AuthContextValue | null>(null);
