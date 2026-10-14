import type { Auction } from '../data/market';
import { Button } from './Button';
import { Icon } from './Icon';
import { PriceDisplay } from './PriceDisplay';
import { StatusBadge } from './StatusBadge';

export function AuctionCard({ auction }: { auction: Auction }) {
  return (
    <article className="auction-card">
      <div className="auction-card__image">
        <img
          src={auction.image}
          alt={auction.imageAlt}
          width="1200"
          height="800"
          loading="lazy"
          decoding="async"
        />
        <span className="auction-card__image-note">A terra dá. Nós aproximamos.</span>
      </div>
      <div className="auction-card__content">
        <StatusBadge tone="live">Em direto · exemplo</StatusBadge>
        <h3>{auction.title}</h3>
        <p className="auction-card__description">
          Há colheitas que não podem esperar. Descobre uma outra forma de trazer o que é bom para a
          tua mesa.
        </p>
        <p className="auction-card__origin">
          <Icon name="location" />
          {auction.producer} · {auction.locality}
        </p>
        <p className="auction-card__quantity">{auction.quantity}</p>
        <div className="auction-card__numbers">
          <div>
            <span>Licitação ilustrativa</span>
            <PriceDisplay amountCents={auction.currentPriceCents} large />
          </div>
          <div>
            <span>
              <Icon name="clock" />
              Tempo ilustrativo
            </span>
            <strong>{auction.remainingLabel}</strong>
          </div>
        </div>
        <Button to={`/leiloes/${auction.id}`} variant="light">
          Conhecer o leilão
          <Icon name="arrow" />
        </Button>
        <p className="auction-card__note">Demonstração visual. Sem licitações reais.</p>
      </div>
    </article>
  );
}
