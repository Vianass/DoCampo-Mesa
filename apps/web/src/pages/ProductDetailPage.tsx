import { Link, useParams } from 'react-router';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Container } from '../components/Container';
import { Icon } from '../components/Icon';
import { MarketImage } from '../components/MarketImage';
import { PriceDisplay } from '../components/PriceDisplay';
import { ProductCard } from '../components/ProductCard';
import { ProductGallery } from '../components/ProductGallery';
import { SectionHeading } from '../components/SectionHeading';
import { StatusBadge } from '../components/StatusBadge';
import { products, producers } from '../data/market';
import { EntityNotFound } from '../features/market/EntityNotFound';
import { relatedProducts } from '../features/market/selectors';
import { AddToCart } from '../features/cart/AddToCart';

export default function ProductDetailPage() {
  const { id } = useParams();
  const product = products.find((item) => item.id === id);
  if (!product) return <EntityNotFound kind="product" />;
  const producer = producers.find((item) => item.id === product.producerId);
  const related = relatedProducts(product, products);
  return (
    <div className="product-detail-page">
      <Container>
        <Breadcrumbs
          items={[
            { label: 'Início', to: '/' },
            { label: 'Produtos', to: '/produtos' },
            { label: product.name },
          ]}
        />
        <article className="product-editorial">
          <ProductGallery key={product.id} images={product.images} productName={product.name} />
          <div className="product-editorial__copy">
            <p className="eyebrow">
              <span className="eyebrow-line" />
              {product.category}
            </p>
            <h1>{product.name}</h1>
            <p className="product-editorial__lead">{product.description}</p>
            <div className="product-editorial__badges">
              {product.organic && <StatusBadge tone="organic">Biológico · exemplo</StatusBadge>}
              <StatusBadge tone="seasonal">
                {product.season.length === 4 ? 'Todo o ano' : product.season.join(' · ')}
              </StatusBadge>
            </div>
            <div className="product-editorial__price">
              <PriceDisplay amountCents={product.priceCents} unit={product.unit} large />
              <span className="product-editorial__price-note">
                Preço demonstrativo por {product.unit}.
              </span>
            </div>
            <p
              className={`product-detail-stock ${product.availableStock ? '' : 'product-detail-stock--empty'}`}
            >
              <span aria-hidden="true" />
              {product.availableStock
                ? `Disponível · ${product.availableStock} em stock`
                : 'Esgotado neste lote demonstrativo'}
            </p>
            <dl className="product-editorial__facts">
              <div>
                <dt>Unidade de venda</dt>
                <dd>{product.unit}</dd>
              </div>
              <div>
                <dt>Época de referência</dt>
                <dd>{product.season.length === 4 ? 'Todo o ano' : product.season.join(', ')}</dd>
              </div>
              <div>
                <dt>Origem da história</dt>
                <dd>{product.producerLocation}</dd>
              </div>
            </dl>
            {producer && (
              <div className="product-origin-card">
                <MarketImage
                  src={producer.image}
                  alt={producer.imageAlt}
                  width="100"
                  height="100"
                />
                <div>
                  <span>Quem dá vida a esta história</span>
                  <Link to={`/produtores/${producer.id}`}>
                    {producer.name}
                    <Icon name="diagonal" />
                  </Link>
                  <p>
                    <Icon name="location" />
                    {producer.locality}
                  </p>
                </div>
              </div>
            )}
            <AddToCart product={product} detailed />
            <p className="product-detail-demo">
              Produto e produtor fictícios. Preços, stock e indicação biológica são exemplos; não
              representam uma certificação verificada. As compras ainda não estão disponíveis.
            </p>
          </div>
        </article>
        <section className="product-story" aria-labelledby="product-story-title">
          <div>
            <p className="eyebrow">Conhecer antes de escolher</p>
            <h2 id="product-story-title">
              O sabor começa
              <br />
              <em>na origem.</em>
            </h2>
          </div>
          <div>
            {(product.detailParagraphs ?? [product.description]).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            <Link className="editorial-text-link" to={`/produtores/${product.producerId}`}>
              Conhecer a história do produtor <Icon name="arrow" />
            </Link>
          </div>
        </section>
        {related.length > 0 && (
          <section className="detail-related" aria-labelledby="related-products-title">
            <SectionHeading
              id="related-products-title"
              eyebrow="À mesma mesa"
              title="Outros sabores para descobrir."
              description="Uma seleção por categoria, produtor e épocas em comum."
              action={
                <Link className="editorial-text-link" to="/produtos">
                  Explorar o mercado <Icon name="arrow" />
                </Link>
              }
            />
            <div className="product-grid">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        )}
      </Container>
    </div>
  );
}
