import { useContext } from 'react';
import { ProducerContext } from './ProducerContext';
export function useProducer() {
  const context = useContext(ProducerContext);
  if (!context) throw new Error('useProducer deve ser usado dentro de ProducerProvider.');
  return context;
}
