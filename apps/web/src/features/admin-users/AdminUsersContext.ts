import { createContext } from 'react';
import type { AdminUserDetail } from './contracts';
export interface UserState {
  owner: string;
  id: string;
  data?: AdminUserDetail;
  loading: boolean;
  busy: boolean;
  locked: boolean;
  reason: string;
  reasonError?: string;
  feedback?: { kind: 'error' | 'success'; message: string };
  event: number;
  revision: number;
  forbidden?: boolean;
}
export interface AdminUsersController {
  state: UserState;
  load: (id: string, automatic?: boolean) => Promise<void>;
  edit: (value: string) => void;
  validate: () => boolean;
  change: () => Promise<void>;
}
export const AdminUsersContext = createContext<AdminUsersController | null>(null);
