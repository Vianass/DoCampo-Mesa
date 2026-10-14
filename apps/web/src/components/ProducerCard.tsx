import { Link } from 'react-router';
import type { Producer } from '../data/market';
import { Icon } from './Icon';

export function ProducerCard({ producer }: { producer: Producer }) {
  return (
    <article className="producer-card">
      <Link to={`/produtores/${producer.id}`} className="producer-card__link">
        <div className="producer-card__image">
          <img
            src={producer.image}
            alt={producer.imageAlt}
            width="800"
            height="600"
            loading="lazy"
            decoding="async"
          />
          <span className="producer-card__specialty">{producer.specialty}</span>
        </div>
        <div className="producer-card__body">
          <div>
            <p>
              <Icon name="location" />
              {producer.locality}
            </p>
            <h3>{producer.name}</h3>
          </div>
          <span className="producer-card__arrow">
            <Icon name="diagonal" />
          </span>
        </div>
      </Link>
    </article>
  );
}
