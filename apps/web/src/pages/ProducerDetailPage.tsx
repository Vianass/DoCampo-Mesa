import { Link, useParams } from 'react-router';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Container } from '../components/Container';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { MarketImage } from '../components/MarketImage';
import { ProductCard } from '../components/ProductCard';
import { ProducerMap } from '../components/ProducerMap';
import { ReviewCard } from '../components/ReviewCard';
import { SectionHeading } from '../components/SectionHeading';
import { StatusBadge } from '../components/StatusBadge';
import { producers, products } from '../data/market';
import { producerReviews } from '../data/reviews';
import { EntityNotFound } from '../features/market/EntityNotFound';
import {
  producerCategories,
  reviewsForProducer,
  reviewSummary,
} from '../features/market/selectors';

export default function ProducerDetailPage() {
  const { id } = useParams();
  const producer = producers.find((item) => item.id === id);
  if (!producer) return <EntityNotFound kind="producer" />;
  const selection = products.filter((product) => product.producerId === producer.id);
  const categories = producerCategories(products, producer.id);
  const reviews = reviewsForProducer(producerReviews, producer.id);
  const summary = reviewSummary(reviews);
  return (
    <div className="producer-profile-page">
      <Container>
        <Breadcrumbs
          items={[
            { label: 'Início', to: '/' },
            { label: 'Produtores', to: '/produtores' },
            { label: producer.name },
          ]}
        />
        <header className="producer-profile-header">
          <div className="producer-profile-cover">
            <MarketImage
              src={producer.coverImage.src}
              alt={producer.coverImage.alt}
              width="1200"
              height="500"
              fetchPriority="high"
            />
            <span>Uma história do mercado · perfil fictício</span>
          </div>
          <div className="producer-profile-identity">
            <MarketImage
              className="producer-profile-portrait"
              src={producer.image}
              alt={producer.imageAlt}
              width="200"
              height="200"
            />
            <div className="producer-profile-name">
              <p className="eyebrow">{producer.specialty}</p>
              <h1>{producer.name}</h1>
              <p className="location-label">
                <Icon name="location" />
                {producer.locality} · {producer.region}
              </p>
            </div>
            <a className="producer-rating-link" href="#producer-reviews">
              {summary.average !== null ? (
                <>
                  <span className="producer-rating-link__value">
                    {summary.average.toLocaleString('pt-PT', {
                      maximumFractionDigits: 1,
                      minimumFractionDigits: 1,
                    })}
                    <span aria-hidden="true"> ★</span>
                    <span className="visually-hidden"> de 5</span>
                  </span>
                  <span>
                    {summary.count}{' '}
                    {summary.count === 1 ? 'avaliação fictícia' : 'avaliações fictícias'}
                  </span>
                </>
              ) : (
                <>
                  <Icon name="sun" />
                  <span>História por avaliar</span>
                </>
              )}
            </a>
          </div>
          <p className="producer-profile-intro">{producer.description}</p>
          <ul className="producer-category-list" aria-label="Categorias deste produtor">
            {categories.map((category) => (
              <li key={category}>
                <Link
                  to={`/produtos?${new URLSearchParams({ produtor: producer.id, categoria: category })}`}
                >
                  {category}
                  <Icon name="diagonal" width="14" height="14" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="profile-demo-note">
            Perfil, história, métodos e avaliações fictícios. As fotografias são ilustrativas e não
            representam esta exploração.
          </p>
        </header>
        <section className="producer-story-section" aria-labelledby="producer-story-title">
          <div>
            <p className="eyebrow">Por trás de cada colheita</p>
            <h2 id="producer-story-title">{producer.story.title}</h2>
            <span className="story-decoration" aria-hidden="true">
              ✳
            </span>
          </div>
          <div>
            {producer.story.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            <span className="story-signature">Da terra, com tempo.</span>
          </div>
        </section>
        <section className="producer-methods" aria-labelledby="producer-methods-title">
          <SectionHeading
            id="producer-methods-title"
            eyebrow="O cuidado faz parte"
            title="Como imaginamos a produção."
          />
          <div className="producer-methods__grid">
            {producer.methods.map((method, index) => (
              <article key={method.title}>
                <span aria-hidden="true">0{index + 1}</span>
                <h3>{method.title}</h3>
                <p>{method.description}</p>
              </article>
            ))}
          </div>
          {producer.organicCertification && (
            <div className="producer-certification">
              <Icon name="leaf" />
              <div>
                <StatusBadge tone="organic">{producer.organicCertification.label}</StatusBadge>
                <p>{producer.organicCertification.note}</p>
              </div>
            </div>
          )}
        </section>
        <section className="producer-selection" aria-labelledby="producer-products-title">
          <SectionHeading
            id="producer-products-title"
            eyebrow="Daqui para a tua cozinha"
            title="Os sabores desta origem."
            description={`${selection.length} produtos demonstrativos · ${selection.filter((product) => product.availableStock > 0).length} com stock disponível.`}
            action={
              <Link
                className="editorial-text-link"
                to={`/produtos?${new URLSearchParams({ produtor: producer.id })}`}
              >
                Ver no catálogo <Icon name="arrow" />
              </Link>
            }
          />
          {selection.length ? (
            <div className="product-grid">
              {selection.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Uma nova colheita está a caminho."
              description="Este perfil ainda não tem produtos na seleção demonstrativa."
            />
          )}
        </section>
        <section className="producer-place" aria-labelledby="producer-place-title">
          <div>
            <p className="eyebrow">Uma história com lugar</p>
            <h2 id="producer-place-title">
              {producer.locality}.<br />
              <em>A origem aproxima.</em>
            </h2>
            <p>
              {producer.region}, Portugal. A representação é ilustrativa; não indica a localização
              precisa de uma exploração.
            </p>
            <div className="producer-contact">
              <h3>Contactos públicos</h3>
              {producer.publicContact?.email && (
                <a href={`mailto:${producer.publicContact.email}`}>
                  {producer.publicContact.email}
                </a>
              )}
              {producer.publicContact?.website && (
                <a href={producer.publicContact.website} target="_blank" rel="noopener noreferrer">
                  Website do produtor <span className="visually-hidden">(novo separador)</span>
                  <Icon name="diagonal" />
                </a>
              )}
              {!producer.publicContact?.email && !producer.publicContact?.website && (
                <p>Não existem contactos públicos disponíveis para este perfil fictício.</p>
              )}
            </div>
          </div>
          <ProducerMap locality={producer.locality} region={producer.region} />
        </section>
        <section
          className="producer-reviews"
          id="producer-reviews"
          aria-labelledby="producer-reviews-title"
        >
          <SectionHeading
            id="producer-reviews-title"
            eyebrow="A mesa também conta histórias"
            title="Palavras de quem se aproxima."
            description="Avaliações de demonstração, escritas por personagens fictícias. Não correspondem a compras reais ou verificadas."
          />
          {reviews.length ? (
            <>
              <p className="producer-reviews-summary">
                Média demonstrativa:{' '}
                <strong>
                  {summary.average?.toLocaleString('pt-PT', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{' '}
                  de 5
                </strong>{' '}
                · {summary.count} {summary.count === 1 ? 'avaliação' : 'avaliações'}
              </p>
              <div className="review-grid">
                {reviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              title="Esta história ainda não tem avaliações."
              description="Ainda não existem avaliações demonstrativas associadas a este perfil. A ausência de avaliações não equivale a uma classificação de zero."
            />
          )}
        </section>
      </Container>
    </div>
  );
}
