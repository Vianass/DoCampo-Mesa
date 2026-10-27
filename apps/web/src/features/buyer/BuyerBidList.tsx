import { publicProducerPath } from '../../features/api/catalog';
import { Link } from 'react-router';
import { PriceDisplay } from '../../components/PriceDisplay';
import { StatusBadge } from '../../components/StatusBadge';
import { bidSituation, bidSituationLabels, buyerDate } from './selectors';
import type { BuyerBid } from './types';

export function BuyerBidList({ bids }: { bids: readonly BuyerBid[] }) {
  return (
    <div className="buyer-bid-list">
      {bids.map((bid) => {
        const situation = bidSituation(bid);
        return (
          <article
            className="buyer-bid"
            key={bid.id}
            aria-label={`Participação em ${bid.auction.title}`}
          >
            <div className="buyer-bid__identity">
              <StatusBadge
                tone={situation === 'ganho' || situation === 'mais-elevada' ? 'organic' : 'neutral'}
              >
                {bidSituationLabels[situation]}
              </StatusBadge>
              <h3>
                <Link to={`/area/comprador/licitacoes/${bid.auction.id}`}>{bid.auction.title}</Link>
              </h3>
              <p>{bid.auction.lot}</p>
              <Link to={publicProducerPath(bid.auction.producerId)} className="buyer-producer-link">
                {bid.auction.producerName}
              </Link>
            </div>
            <dl>
              <div>
                <dt>A tua oferta demonstrativa</dt>
                <dd>
                  <PriceDisplay amountCents={bid.amountCents} />
                </dd>
              </div>
              <div>
                <dt>Estado do leilão no cenário</dt>
                <dd>
                  {bid.auction.state === 'ativo'
                    ? 'Ativo'
                    : bid.auction.state === 'terminado'
                      ? 'Terminado'
                      : 'Agendado'}
                </dd>
              </div>
              <div>
                <dt>Oferta registada no cenário</dt>
                <dd>
                  <time dateTime={bid.acceptedAt}>{buyerDate(bid.acceptedAt)}</time>
                </dd>
              </div>
            </dl>
            <Link to={`/area/comprador/licitacoes/${bid.auction.id}`} className="buyer-detail-link">
              Ver detalhe do leilão <span aria-hidden="true">→</span>
            </Link>
          </article>
        );
      })}
    </div>
  );
}
