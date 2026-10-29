import { useContext } from 'react';
import { ApplicationContext } from './ApplicationContext';
export function useApplication() {
  const value = useContext(ApplicationContext);
  if (!value) throw new Error('O contexto de candidatura não está disponível.');
  return value;
}
