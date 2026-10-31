import { createContext, useContext } from 'react';
import type { OrderConnection } from './order-live-client';
export const OrderUpdatesContext = createContext<{
  revision: number;
  status: OrderConnection;
  refresh: () => void;
}>({ revision: 0, status: 'indisponivel', refresh: () => undefined });
export const useOrderUpdates = () => useContext(OrderUpdatesContext);
