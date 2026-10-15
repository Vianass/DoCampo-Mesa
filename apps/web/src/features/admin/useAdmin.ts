import { use } from 'react';
import { AdminContext } from './AdminContext';
export function useAdmin() {
  const value = use(AdminContext);
  if (!value) throw new Error('AdminProvider em falta.');
  return value;
}
