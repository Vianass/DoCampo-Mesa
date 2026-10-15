import { Link } from 'react-router';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { PriceDisplay } from '../../../components/PriceDisplay';
import { ProducerPageFrame } from '../../../features/producer/ProducerPageFrame';
import { ProducerOrderList } from '../../../features/producer/ProducerLists';
import { ownOrders, producerSummary } from '../../../features/producer/selectors';
import { privateSections } from '../../../features/private-area/navigation';
export default function ProducerDashboardPage() {
  return (
    <ProducerPageFrame
      title="Da tua terra,"
      accent="para outras mesas."
      description="Um olhar sobre o que cresce, o que chega e o que merece cuidado na tua produção."
    >
      {(data) => {
        const summary = producerSummary(data);
        return (
          <>
            <p className="producer-identity">
              {data.profile.name} · {data.profile.locality}
            </p>
            <dl className="producer-metrics" aria-label="Resumo da atividade do produtor">
              {[
                ['Produtos no cenário', summary.productCount, 'produtos'],
                ['Encomendas recebidas', summary.orderCount, 'encomendas'],
                ['Encomendas pendentes', summary.pendingOrderCount, 'encomendas?estado=pendente'],
                ['Produtos com stock reduzido', summary.lowStockCount, 'indicadores'],
              ].map(([label, value, path]) => (
                <div key={label}>
                  <dt>
                    <Link to={'/area/produtor/' + path}>{label}</Link>
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="producer-dashboard-grid">
              <section aria-labelledby="producer-recent">
                <div className="producer-section-heading">
                  <h2 id="producer-recent">O que acaba de chegar.</h2>
                  <Link to="/area/produtor/encomendas">Todas as encomendas →</Link>
                </div>
                {summary.orderCount ? (
                  <ProducerOrderList orders={ownOrders(data).slice(0, 2)} />
                ) : (
                  <EmptyState
                    title="Ainda sem encomendas neste cenário."
                    description="As próximas escolhas terão aqui o seu lugar."
                    action={
                      <Button to="/area/produtor/produtos" variant="secondary">
                        Conhecer a produção
                      </Button>
                    }
                  />
                )}
              </section>
              <aside className="producer-stock-aside" aria-labelledby="producer-stock-title">
                <p className="eyebrow">Cuidar da próxima colheita</p>
                <h2 id="producer-stock-title">
                  Cada produto,
                  <br />
                  <em>no seu tempo.</em>
                </h2>
                <p>
                  {summary.lowStockCount} com stock reduzido · {summary.unavailableCount}{' '}
                  indisponíveis
                </p>
                <p>
                  O limiar é ilustrativo e pode ser ajustado por produto. A cesta não reserva stock.
                </p>
                <Button to="/area/produtor/indicadores" variant="secondary">
                  Consultar stock
                </Button>
              </aside>
            </div>
            <section className="producer-activity" aria-labelledby="producer-activity-title">
              <h2 id="producer-activity-title">O retrato desta atividade.</h2>
              <dl className="producer-facts">
                <div>
                  <dt>Valor das encomendas entregues</dt>
                  <dd>
                    <PriceDisplay amountCents={summary.deliveredValueCents} />
                  </dd>
                </div>
                <div>
                  <dt>Leilões ativos no retrato</dt>
                  <dd>{summary.activeAuctionCount}</dd>
                </div>
              </dl>
              <p className="producer-help">
                Agregados do conjunto fictício, sem filtro temporal. O valor entregue não representa
                pagamentos ou lucro.
              </p>
            </section>
            <section className="producer-paths" aria-labelledby="producer-paths-title">
              <h2 id="producer-paths-title">Da gestão ao próximo passo.</h2>
              {privateSections.produtor.map((section, index) => (
                <Link key={section.slug} to={'/area/produtor/' + section.slug}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <h3>{section.label}</h3>
                    <p>{section.description}</p>
                  </div>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </section>
          </>
        );
      }}
    </ProducerPageFrame>
  );
}
