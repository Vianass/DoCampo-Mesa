import { useOrderUpdates } from './OrderUpdatesContext';
export function OrderConnectionNote() {
  const { status } = useOrderUpdates();
  return (
    <p className="checkout-note" role="status">
      {status === 'ligada'
        ? 'Atualizações em direto ligadas. Os dados são confirmados pela API.'
        : status === 'a_ligar'
          ? 'A ligar às atualizações das encomendas…'
          : 'Atualizações em direto indisponíveis. A consulta é recuperada automaticamente; também podes atualizar manualmente.'}
    </p>
  );
}
