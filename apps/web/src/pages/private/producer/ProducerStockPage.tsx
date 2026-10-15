import { EmptyState } from '../../../components/EmptyState';
import { PriceDisplay } from '../../../components/PriceDisplay';
import { ProducerPageFrame } from '../../../features/producer/ProducerPageFrame';
import { ProducerProductList } from '../../../features/producer/ProducerLists';
import { ownProducts, producerSummary, stockSituation } from '../../../features/producer/selectors';
export default function ProducerStockPage() {
  return (
    <ProducerPageFrame
      title="Indicadores e stock."
      description="Saber o que há, reconhecer o que escasseia e preparar a próxima colheita."
    >
      {(data) => {
        const summary = producerSummary(data);
        const items = ownProducts(data);
        const attention = items.filter((product) => stockSituation(product) !== 'disponivel');
        return (
          <>
            <dl className="producer-metrics" aria-label="Indicadores de stock">
              <div>
                <dt>Unidades comerciais disponíveis</dt>
                <dd>{summary.availableUnits}</dd>
              </div>
              <div>
                <dt>Produtos com stock reduzido</dt>
                <dd>{summary.lowStockCount}</dd>
              </div>
              <div>
                <dt>Produtos indisponíveis</dt>
                <dd>{summary.unavailableCount}</dd>
              </div>
              <div>
                <dt>Produtos no cenário</dt>
                <dd>{summary.productCount}</dd>
              </div>
            </dl>
            <p className="producer-help">
              Soma de unidades comerciais de produtos diferentes, não uma medida em kg. Sem reservas
              ou stock comprometido simulado. Stock reduzido: quantidade positiva até ao limiar
              ilustrativo de cada produto; zero é indisponível.
            </p>
            <section
              className="producer-stock-attention"
              aria-labelledby="producer-attention-title"
            >
              <h2 id="producer-attention-title">O que merece atenção.</h2>
              {attention.length ? (
                <ProducerProductList products={attention} />
              ) : (
                <EmptyState
                  title="Sem alertas neste cenário."
                  description="Não há produtos com stock reduzido ou indisponível no conjunto atual."
                />
              )}
            </section>
            <section className="producer-activity">
              <h2>O retrato das encomendas.</h2>
              <dl className="producer-facts">
                <div>
                  <dt>Encomendas recebidas</dt>
                  <dd>{summary.orderCount}</dd>
                </div>
                <div>
                  <dt>Encomendas pendentes</dt>
                  <dd>{summary.pendingOrderCount}</dd>
                </div>
                <div>
                  <dt>Valor das encomendas entregues</dt>
                  <dd>
                    <PriceDisplay amountCents={summary.deliveredValueCents} />
                  </dd>
                </div>
              </dl>
              <p className="producer-help">
                Todo o conjunto ilustrativo, sem período selecionado. Soma dos snapshots entregues,
                sem pagamentos, taxas, lucro ou projeções.
              </p>
            </section>
          </>
        );
      }}
    </ProducerPageFrame>
  );
}
