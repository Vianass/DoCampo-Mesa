import { Link, useParams, useSearchParams } from 'react-router';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Container } from '../components/Container';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { MarketImage } from '../components/MarketImage';
import { ProductCard } from '../components/ProductCard';
import { SectionHeading } from '../components/SectionHeading';
import { EntityNotFound } from '../features/market/EntityNotFound';
import { adaptProduct, catalogApi } from '../features/api/catalog';
import { objectId } from '../features/api/catalog-contract';
import { useRemote } from '../features/api/useRemote';
import { ApiFailure } from '../features/api/client';
import { RemoteError } from '../features/market/RemoteError';
import { DetailLoadingPage } from '../features/market/DetailLoadingPage';
import { CatalogPagination } from '../features/catalog/CatalogPagination';
import { CommercialInfo } from '../features/market/CommercialInfo';
import { PublicReviews } from '../features/reviews/PublicReviews';
export default function ProducerDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const page = /^[1-9]\d{0,3}$/.test(params.get('pagina') ?? '')
    ? Math.min(1000, Number(params.get('pagina')))
    : 1;
  const query = new URLSearchParams({ pagina: String(page), porPagina: '12' }).toString();
  const remote = useRemote(id + '?' + query, (signal) =>
    objectId(id)
      ? catalogApi.producer(id, query, signal)
      : Promise.reject(new ApiFailure('http', 404)),
  );
  if (remote.loading) return <DetailLoadingPage kind="producer" />;
  if (remote.error?.status === 404) return <EntityNotFound kind="producer" />;
  if (remote.error)
    return (
      <Container>
        <RemoteError error={remote.error} retry={remote.retry} />
      </Container>
    );
  const producer = remote.data!;
  const selection = producer.produtos.itens.map(adaptProduct);
  const categories = [
    ...new Map(producer.produtos.itens.map((p) => [p.categoria.id, p.categoria.nome])).entries(),
  ];
  return (
    <div className="producer-profile-page">
      <Container>
        <Breadcrumbs
          items={[
            { label: 'Início', to: '/' },
            { label: 'Produtores', to: '/produtores' },
            { label: producer.nomePublico },
          ]}
        />
        <header className="producer-profile-header">
          <div className="producer-profile-cover">
            <MarketImage
              src={producer.imagem?.url ?? '/images/product-placeholder.svg'}
              alt={producer.imagem?.alt ?? 'Imagem do produtor não disponibilizada'}
              width="1200"
              height="500"
              fetchPriority="high"
            />
            <span>Perfil público · informação do produtor</span>
          </div>
          <div className="producer-profile-identity">
            <MarketImage
              className="producer-profile-portrait"
              src={producer.imagem?.url ?? '/images/product-placeholder.svg'}
              alt={producer.imagem?.alt ?? 'Imagem do produtor não disponibilizada'}
              width="200"
              height="200"
            />
            <div className="producer-profile-name">
              <p className="eyebrow">Quem cuida da origem</p>
              <h1>{producer.nomePublico}</h1>
              <p className="location-label">
                <Icon name="location" />
                {producer.localidade} · {producer.concelho}
              </p>
            </div>
          </div>
          <p className="producer-profile-intro">{producer.descricao}</p>
          <ul className="producer-category-list" aria-label="Categorias nesta página de produtos">
            {categories.map(([categoryId, name]) => (
              <li key={categoryId}>
                <Link
                  to={`/produtos?${new URLSearchParams({ produtor: producer.id, categoria: categoryId })}`}
                >
                  {name}
                  <Icon name="diagonal" width="14" height="14" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="profile-demo-note">
            Informação publicada pelo produtor. Histórias adicionais, métodos e certificações não
            são disponibilizados nesta fase.
          </p>
        </header>
        <section className="producer-story-section" aria-labelledby="producer-story-title">
          <div>
            <p className="eyebrow">Por trás de cada colheita</p>
            <h2 id="producer-story-title">Conhecer a origem.</h2>
            <span className="story-decoration" aria-hidden="true">
              ✳
            </span>
          </div>
          <div>
            <p>{producer.descricao}</p>
            <CommercialInfo value={producer.comercial} />
          </div>
        </section>
        <section className="producer-selection" aria-labelledby="producer-products-title">
          <SectionHeading
            id="producer-products-title"
            eyebrow="Daqui para a tua cozinha"
            title="Os sabores desta origem."
            description={`${producer.produtos.total} produtos publicados · ${selection.length} nesta página.`}
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
              {selection.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Uma nova colheita está a caminho."
              description={
                producer.produtos.total
                  ? 'Esta página não tem produtos. Escolhe outra página.'
                  : 'Este perfil ainda não tem produtos publicados.'
              }
            />
          )}
          <CatalogPagination
            page={page}
            totalPages={producer.produtos.totalPaginas}
            total={producer.produtos.total}
            start={selection.length ? (page - 1) * 12 + 1 : 0}
            end={selection.length ? Math.min(page * 12, producer.produtos.total) : 0}
            onPageChange={(pagina) => {
              const next = new URLSearchParams(params);
              next.set('pagina', String(pagina));
              setParams(next);
            }}
          />
        </section>
        <section className="producer-place" aria-labelledby="producer-place-title">
          <div>
            <p className="eyebrow">Uma origem com lugar</p>
            <h2 id="producer-place-title">
              {producer.localidade}.<br />
              <em>A origem aproxima.</em>
            </h2>
            <p>
              {producer.concelho}. Não existem coordenadas ou contactos públicos disponibilizados
              pela API. Não é apresentada a localização de uma exploração.
            </p>
          </div>
          <EmptyState
            title="Conhecer sem inventar."
            description="Mapa e certificações serão apresentados quando existirem dados públicos verificados e contratos próprios."
          />
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
          />
          <PublicReviews
            key={producer.id + 'produtor'}
            id={producer.id}
            kind="producers"
            alvoTipo="produtor"
            title="Avaliações diretas deste produtor."
          />
          <PublicReviews
            key={producer.id + 'produto'}
            id={producer.id}
            kind="producers"
            alvoTipo="produto"
            title="Avaliações dos produtos desta origem."
          />
        </section>
      </Container>
    </div>
  );
}
