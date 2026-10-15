import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { ProducerPageFrame } from '../../../features/producer/ProducerPageFrame';
import { ProducerAuctionList } from '../../../features/producer/ProducerLists';
import { ownAuctions, producerSummary } from '../../../features/producer/selectors';
export default function ProducerAuctionsPage() {
  return (
    <ProducerPageFrame
      title="Os meus leilões."
      description="As tuas colheitas em lote, num retrato estático da atividade demonstrativa."
    >
      {(data) => {
        const items = ownAuctions(data);
        const summary = producerSummary(data);
        return (
          <>
            <dl className="producer-facts">
              <div>
                <dt>Leilões neste cenário</dt>
                <dd>{items.length}</dd>
              </div>
              <div>
                <dt>Ativos no retrato</dt>
                <dd>{summary.activeAuctionCount}</dd>
              </div>
              <div>
                <dt>Ofertas aceites no conjunto</dt>
                <dd>{summary.bidCount}</dd>
              </div>
            </dl>
            {items.length ? (
              <section aria-labelledby="producer-auctions-list">
                <h2 className="visually-hidden" id="producer-auctions-list">
                  Lista de leilões do produtor
                </h2>
                <ProducerAuctionList auctions={items} />
              </section>
            ) : (
              <EmptyState
                title="Sem leilões neste cenário."
                description="A proposta pública de leilões continua disponível para conhecer."
                action={
                  <Button to="/leiloes" variant="secondary">
                    Conhecer os leilões públicos
                  </Button>
                }
              />
            )}
            <p className="producer-help">
              Sem criação, edição, licitações ou atualizações em tempo real. Não há reservas de
              produtos nem conversão automática em encomendas.
            </p>
          </>
        );
      }}
    </ProducerPageFrame>
  );
}
