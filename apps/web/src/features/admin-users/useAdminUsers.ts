import { useContext } from 'react';
import { AdminUsersContext } from './AdminUsersContext';
export function useAdminUsers() {
  const value = useContext(AdminUsersContext);
  if (!value) throw Error('Gestão de utilizadores indisponível.');
  return value;
}
