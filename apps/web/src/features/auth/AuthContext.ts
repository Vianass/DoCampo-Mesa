import { createContext } from 'react';
import type { AccountSession, AccountUser, DemoSession, Role } from './types';
import type { Credentials } from './auth-api';
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
}
export const AuthContext = createContext<AuthContextValue | null>(null);
