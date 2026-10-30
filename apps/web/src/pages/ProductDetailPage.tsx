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
import { EntityNotFound } from '../features/market/EntityNotFound';
import { AddToCart } from '../features/cart/AddToCart';
import { adaptProduct, catalogApi, seasonLabel, stockLabel } from '../features/api/catalog';
import { objectId } from '../features/api/catalog-contract';
import { ApiFailure } from '../features/api/client';
import { useRemote } from '../features/api/useRemote';
import { RemoteError } from '../features/market/RemoteError';
import { DetailLoadingPage } from '../features/market/DetailLoadingPage';
import { CommercialInfo } from '../features/market/CommercialInfo';
import type { Product } from '../types/market';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { PublicReviews } from '../features/reviews/PublicReviews';
function RelatedProducts({ product }: { product: Product }) {
  const query = new URLSearchParams({ categoria: product.categoryId!, porPagina: '12' }).toString();
  const remote = useRemote(query, (signal) => catalogApi.products(query, signal));
  const items =
    remote.data?.itens
      .filter((p) => p.id !== product.id)
      .slice(0, 4)
      .map(adaptProduct) ?? [];
  return (
    <section className="detail-related" aria-labelledby="related-products-title">
      <SectionHeading
        id="related-products-title"
        eyebrow="À mesma mesa"
        title="Outros sabores para descobrir."
        description="Outros produtos publicados na mesma categoria."
        action={
          <Link className="editorial-text-link" to={`/produtos?categoria=${product.categoryId}`}>
            Explorar o mercado <Icon name="arrow" />
          </Link>
        }
      />
      {remote.loading ? (
        <LoadingSkeleton label="A carregar outros produtos" count={4} />
      ) : remote.error ? (
        <RemoteError error={remote.error} retry={remote.retry} />
      ) : (
        <div className="product-grid">
          {items.map((item) => (
            <ProductCard key={item.id} product={item} />
          ))}
        </div>
      )}
    </section>
  );
}
export default function ProductDetailPage() {
  const { id = '' } = useParams();
  const remote = useRemote(id, (signal) =>
    objectId(id) ? catalogApi.product(id, signal) : Promise.reject(new ApiFailure('http', 404)),
  );
  if (remote.loading) return <DetailLoadingPage kind="product" />;
  if (remote.error?.status === 404) return <EntityNotFound kind="product" />;
  if (remote.error)
    return (
      <Container>
        <RemoteError error={remote.error} retry={remote.retry} />
      </Container>
    );
  const dto = remote.data!;
  const product = adaptProduct(dto);
  const producer = dto.produtor;
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
              {product.organic && <StatusBadge tone="organic">Biológico · declarado</StatusBadge>}
              {!!product.seasonMonths?.length && (
                <StatusBadge tone="seasonal">
                  {product.season.length === 4 && product.seasonMonths.length === 12
                    ? 'Meses declarados: todo o ano'
                    : product.season.join(' · ')}
                </StatusBadge>
              )}
            </div>
            <div className="product-editorial__price">
              <PriceDisplay amountCents={product.priceCents} unit={product.unit} large />
              <span className="product-editorial__price-note">
                Preço por {product.unit}. {product.sale?.rotulo}
              </span>
            </div>
            <p
              className={`product-detail-stock ${product.availableStock ? '' : 'product-detail-stock--empty'}`}
            >
              <span aria-hidden="true" />
              {product.availableStock ? `Disponível · ${stockLabel(product)} em stock` : 'Esgotado'}
            </p>
            <dl className="product-editorial__facts">
              <div>
                <dt>Unidade de venda</dt>
                <dd>
                  {product.unit}
                  {product.sale?.conteudoPorUnidade &&
                    ` · conteúdo: ${product.sale.conteudoPorUnidade.quantidade} ${product.sale.conteudoPorUnidade.unidade}`}
                </dd>
              </div>
              <div>
                <dt>Época de referência</dt>
                <dd>{seasonLabel(product)}</dd>
              </div>
              <div>
                <dt>Origem</dt>
                <dd>
                  {product.producerLocation} · {producer.concelho}
                </dd>
              </div>
              {dto.modoProducao && (
                <div>
                  <dt>Modo de produção declarado</dt>
                  <dd>{dto.modoProducao}</dd>
                </div>
              )}
            </dl>
            <div className="product-origin-card">
              <MarketImage
                src={producer.imagem?.url ?? '/images/product-placeholder.svg'}
                alt={producer.imagem?.alt ?? 'Imagem do produtor não disponibilizada'}
                width="100"
                height="100"
              />
              <div>
                <span>Quem dá vida a esta origem</span>
                <Link to={`/produtores/${producer.id}`}>
                  {producer.nomePublico}
                  <Icon name="diagonal" />
                </Link>
                <p>
                  <Icon name="location" />
                  {producer.localidade}
                </p>
              </div>
            </div>
            <AddToCart key={product.id} product={product} detailed />
            <p className="product-detail-demo">
              Informação publicada pelo produtor. A indicação biológica é uma declaração do
              produtor, sem certificação verificada. A cesta é local: não reserva stock nem cria
              encomendas.
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
            <p>{product.description}</p>
            {dto.ingredientesAplicaveis && <p>Ingredientes: {dto.ingredientes.join(', ')}.</p>}
            {dto.etiquetas.length > 0 && <p>{dto.etiquetas.join(' · ')}</p>}
            <Link className="editorial-text-link" to={`/produtores/${product.producerId}`}>
              Conhecer o produtor <Icon name="arrow" />
            </Link>
            <CommercialInfo value={dto.comercial} />
          </div>
        </section>
        <PublicReviews
          key={product.id}
          id={product.id}
          kind="products"
          title="Palavras sobre este produto."
        />
        <RelatedProducts product={product} />
      </Container>
    </div>
  );
}
