import { useSearchParams } from 'react-router';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { orderStatuses } from '../../../features/buyer/types';
import { orderStatusLabels } from '../../../features/buyer/selectors';
import { ProducerPageFrame } from '../../../features/producer/ProducerPageFrame';
import { ProducerOrderList } from '../../../features/producer/ProducerLists';
import { ProducerSelect } from '../../../features/producer/ProducerFields';
import { ownOrders } from '../../../features/producer/selectors';
export default function ProducerOrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = orderStatuses.find((value) => value === params.get('estado')) ?? 'todos';
  return (
    <ProducerPageFrame
      title="As minhas encomendas."
      description="O que a tua produção inspira, da primeira escolha à entrega."
    >
      {(data) => {
        const orders = ownOrders(data, status);
        return (
          <>
            <div className="producer-filters">
              <ProducerSelect
                label="Estado das encomendas recebidas"
                value={status}
                onChange={(event) => {
                  const next = new URLSearchParams(params);
                  if (event.target.value === 'todos') next.delete('estado');
                  else next.set('estado', event.target.value);
                  setParams(next);
                }}
              >
                <option value="todos">Todos os estados</option>
                {orderStatuses.map((value) => (
                  <option key={value} value={value}>
                    {orderStatusLabels[value]}
                  </option>
                ))}
              </ProducerSelect>
            </div>
            <p className="producer-result-count" role="status">
              {orders.length} encomendas recebidas neste cenário
            </p>
            {orders.length ? (
              <section aria-labelledby="producer-orders-list">
                <h2 className="visually-hidden" id="producer-orders-list">
                  Lista de encomendas recebidas
                </h2>
                <ProducerOrderList orders={orders} />
              </section>
            ) : (
              <EmptyState
                title="Ainda sem encomendas para esta escolha."
                description="O filtro e os dados deste cenário não têm correspondências."
                action={
                  <Button to="/area/produtor/encomendas" variant="secondary">
                    Consultar todos os estados
                  </Button>
                }
              />
            )}
            <p className="producer-help">
              Consulta demonstrativa. Não são alterados estados, reservas ou stock; não existem
              notificações reais.
            </p>
          </>
        );
      }}
    </ProducerPageFrame>
  );
}
