import { Link } from 'react-router';
import type { Producer } from '../data/market';
import { Icon } from './Icon';
import { MarketImage } from './MarketImage';
import type { ProductCategory } from '../types/market';

export function ProducerCard({
  producer,
  categories,
}: {
  producer: Pick<Producer, 'id' | 'name' | 'locality' | 'image' | 'imageAlt' | 'description'> & {
    specialty?: string;
  };
  categories?: readonly ProductCategory[];
}) {
  return (
    <article className="producer-card">
      <Link to={`/produtores/${producer.id}`} className="producer-card__link">
        <div className="producer-card__image">
          <MarketImage
            src={producer.image}
            alt={producer.imageAlt}
            width="800"
            height="600"
            loading="lazy"
            decoding="async"
          />
          {producer.specialty && (
            <span className="producer-card__specialty">{producer.specialty}</span>
          )}
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
        {(categories || !producer.specialty) && (
          <div className="producer-card__editorial">
            <p>{producer.description}</p>
            <ul aria-label={`Categorias de ${producer.name}`}>
              {categories?.map((category) => (
                <li key={category}>{category}</li>
              ))}
            </ul>
            <span>
              Conhecer esta história <Icon name="arrow" />
            </span>
          </div>
        )}
      </Link>
    </article>
  );
}
