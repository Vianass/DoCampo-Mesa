import { createContext } from 'react';
import type { DemoSession, Role } from './types';

export interface AuthContextValue {
  session: DemoSession;
  startDemonstration: (role: Role) => void;
  endDemonstration: () => void;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
