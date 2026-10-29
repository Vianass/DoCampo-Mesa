import { createContext } from 'react';
import type {
  ApplicationErrors,
  ApplicationField,
  ApplicationInput,
  ProducerApplication,
} from './model';
export interface ApplicationState {
  owner: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  application: ProducerApplication | null;
  draft: ApplicationInput;
  dirty: boolean;
  saving: boolean;
  uncertain: boolean;
  errors: ApplicationErrors;
  error?: string;
  notice?: string;
}
export interface ApplicationController {
  state: ApplicationState;
  load: () => Promise<ProducerApplication | null | undefined>;
  edit: (field: ApplicationField, value: string) => void;
  submit: () => Promise<void>;
}
export const ApplicationContext = createContext<ApplicationController | null>(null);
