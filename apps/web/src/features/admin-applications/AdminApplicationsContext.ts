import { createContext } from 'react';
import type { AdministrativeApplication, Decision } from './contracts';
export interface AdministrativeState {
  owner: string;
  id: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: AdministrativeApplication;
  reason: string;
  reasonVersion?: string;
  reasonError?: string;
  busy: boolean;
  locked: boolean;
  revision: number;
  event: number;
  forbidden?: boolean;
  feedback?: { kind: 'success' | 'error'; message: string };
}
export interface AdministrativeController {
  state: AdministrativeState;
  load: (id: string, automatic?: boolean) => Promise<void>;
  editReason: (value: string) => void;
  validateReason: () => boolean;
  decide: (decision: Decision) => Promise<void>;
}
export const AdminApplicationsContext = createContext<AdministrativeController | null>(null);
