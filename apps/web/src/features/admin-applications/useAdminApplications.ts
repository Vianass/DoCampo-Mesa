import { useContext } from 'react';
import { AdminApplicationsContext } from './AdminApplicationsContext';
export function useAdminApplications() {
  const value = useContext(AdminApplicationsContext);
  if (!value) throw new Error('Área administrativa de candidaturas indisponível.');
  return value;
}
