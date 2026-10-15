import { Link } from 'react-router';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { Icon } from '../../../components/Icon';
import { MarketImage } from '../../../components/MarketImage';
import { BuyerPageFrame } from '../../../features/buyer/BuyerPageFrame';
import { BuyerCartSummary } from '../../../features/buyer/BuyerCartSummary';
import { BuyerBidList } from '../../../features/buyer/BuyerBidList';
import { OrderCard } from '../../../features/buyer/OrderCard';
import { dashboardSummary } from '../../../features/buyer/selectors';

export default function BuyerDashboardPage() {
  return (
    <BuyerPageFrame
      title="As tuas escolhas,"
      accent="mais perto da origem."
      description="Da última colheita às próximas descobertas: um espaço para acompanhar o que gostas de levar à mesa."
    >
      {(data) => {
        const summary = dashboardSummary(data);
        return (
          <>
            <dl className="buyer-summary" aria-label="Resumo da atividade demonstrativa">
              {[
                {
                  label: 'Encomendas realizadas',
                  value: summary.orderCount,
                  to: '/area/comprador/encomendas',
                },
                {
                  label: 'Encomendas em curso',
                  value: summary.ongoingOrderCount,
                  to: '/area/comprador/encomendas',
                },
                {
                  label: 'Avaliações publicadas · demonstração',
                  value: summary.reviewCount,
                  to: '/area/comprador/avaliacoes',
                },
                {
                  label: 'Licitações em leilões ativos · cenário',
                  value: summary.activeBidCount,
                  to: '/area/comprador/licitacoes',
                },
              ].map((metric) => (
                <div key={metric.label}>
                  <dt>
                    <Link to={metric.to}>{metric.label}</Link>
                  </dt>
                  <dd>{metric.value}</dd>
                </div>
              ))}
            </dl>
            <div className="buyer-dashboard-grid">
              <section aria-labelledby="recent-order-title">
                <div className="buyer-section-heading">
                  <h2 id="recent-order-title">A última escolha.</h2>
                  <Link to="/area/comprador/encomendas">Ver encomendas →</Link>
                </div>
                {summary.recentOrder ? (
                  <OrderCard order={summary.recentOrder} />
                ) : (
                  <EmptyState
                    title="A primeira história ainda está por escolher."
                    description="Este cenário não tem encomendas. Podes conhecer os produtos do mercado."
                    action={
                      <Button to="/produtos" variant="secondary">
                        Explorar produtos
                      </Button>
                    }
                  />
                )}
              </section>
              <BuyerCartSummary />
            </div>
            <section className="buyer-dashboard-bids" aria-labelledby="dashboard-bids-title">
              <div className="buyer-section-heading">
                <h2 id="dashboard-bids-title">Pelas colheitas em leilão.</h2>
                <Link to="/area/comprador/licitacoes">Ver participações →</Link>
              </div>
              {summary.relevantBids.length ? (
                <BuyerBidList bids={summary.relevantBids} />
              ) : (
                <EmptyState
                  title="Ainda sem participações neste cenário."
                  description="Os leilões públicos mostram a proposta do mercado, sem licitações reais."
                  action={
                    <Button to="/leiloes" variant="secondary">
                      Conhecer os leilões
                    </Button>
                  }
                />
              )}
            </section>
            <section className="buyer-discover" aria-labelledby="buyer-discover-title">
              <div>
                <p className="eyebrow">Há sempre uma nova origem</p>
                <h2 id="buyer-discover-title">
                  A próxima mesa
                  <br />
                  <em>começa no campo.</em>
                </h2>
                <p>Descobre os sabores da época e as histórias de quem os prepara.</p>
                <Button to="/produtos" variant="text">
                  Voltar a descobrir <Icon name="arrow" />
                </Button>
              </div>
              <MarketImage
                src="/images/harvest.webp"
                alt="Hortícolas numa caixa de madeira, fotografia ilustrativa"
                width="1200"
                height="800"
                loading="lazy"
              />
            </section>
          </>
        );
      }}
    </BuyerPageFrame>
  );
}
