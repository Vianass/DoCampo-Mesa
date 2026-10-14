import { useState } from 'react';
import { Link } from 'react-router';
import { AuctionCard } from '../components/AuctionCard';
import { Button } from '../components/Button';
import { CategoryPill } from '../components/CategoryPill';
import { Container } from '../components/Container';
import { Icon } from '../components/Icon';
import { ProductCard } from '../components/ProductCard';
import { ProducerCard } from '../components/ProducerCard';
import { SectionHeading } from '../components/SectionHeading';
import { auction, categories, producers, products, type Category } from '../data/market';

export function HomePage() {
  const [category, setCategory] = useState<Category>('Todos');
  const previewProducts = products.filter(
    (product) => category === 'Todos' || product.category === category,
  );
  return (
    <>
      <section className="editorial-hero" aria-labelledby="hero-title">
        <Container>
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">
                <span className="eyebrow-line" />
                Da nossa terra. De verdade.
              </p>
              <h1 id="hero-title">
                O melhor da nossa terra,
                <br />
                <span>à tua mesa.</span>
              </h1>
              <p className="hero-description">
                Descobre quem produz perto de ti.
                <br className="desktop-break" /> Produtos frescos, histórias verdadeiras
                <br className="desktop-break" /> e sabores que começam na origem.
              </p>
              <div className="hero-actions">
                <Button to="/produtos">
                  Explorar produtos
                  <Icon name="arrow" />
                </Button>
                <Button to="/produtores" variant="text">
                  Conhecer produtores
                  <Icon name="diagonal" />
                </Button>
              </div>
              <div className="hero-footnote">
                <Icon name="leaf" />
                <span>
                  Menos distância.
                  <br />
                  <strong>Mais sabor e mais origem.</strong>
                </span>
                <span className="hero-footnote__divider" />
                <span>
                  Ao ritmo da terra.
                  <br />
                  <strong>Uma estação de cada vez.</strong>
                </span>
              </div>
            </div>
            <div className="hero-visual">
              <div className="hero-image-frame">
                <img
                  src="/images/hero.webp"
                  alt="Mãos a escolher tomates e legumes num cesto de mercado"
                  width="900"
                  height="1600"
                  fetchPriority="high"
                />
                <span className="hero-photo-label">Pequenas colheitas. Grandes sabores.</span>
              </div>
              <div className="harvest-stamp">
                <Icon name="sun" width="26" height="26" />
                <span>DA ÉPOCA</span>
                <em>é melhor.</em>
              </div>
              <div className="hero-side-note">COLHIDO COM CUIDADO. ESCOLHIDO POR TI.</div>
            </div>
          </div>
        </Container>
      </section>
      <div className="values-strip">
        <Container>
          <span>
            <Icon name="leaf" />
            Respeitar a estação
          </span>
          <span>
            <Icon name="location" />
            Conhecer a origem
          </span>
          <span>
            <Icon name="basket" />
            Trazer o campo à mesa
          </span>
          <span className="values-strip__signature">Bom para quem produz. Bom à mesa.</span>
        </Container>
      </div>
      <section className="market-section season-section" aria-labelledby="season-title">
        <Container>
          <SectionHeading
            id="season-title"
            eyebrow="O calendário da terra"
            title="Agora é a sua época."
            description="Sabores que sabem ainda melhor quando chegam no tempo certo."
            action={
              <Button to="/produtos" variant="text">
                Ver produtos da época
                <Icon name="arrow" />
              </Button>
            }
          />
          <div className="season-grid">
            {products
              .filter((product) => product.tag)
              .map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
          </div>
          <div className="season-note">
            <Icon name="sun" />
            <span>A nossa seleção de outono</span>
            <span className="season-note__line" />
            <span>Outubro — Novembro</span>
          </div>
        </Container>
      </section>
      <section className="market-section auction-section" aria-labelledby="auction-title">
        <Container>
          <SectionHeading
            id="auction-title"
            eyebrow="Dar valor a cada colheita"
            title="Da terra, uma oportunidade."
            description="Lotes sazonais e excedentes encontram um novo caminho à mesa."
            action={
              <Button to="/leiloes" variant="text">
                Explorar leilões
                <Icon name="arrow" />
              </Button>
            }
          />
          <AuctionCard auction={auction} />
        </Container>
      </section>
      <section className="market-section producer-section" aria-labelledby="producers-title">
        <Container>
          <SectionHeading
            id="producers-title"
            eyebrow="Por trás de cada sabor"
            title="Há quem cuide da origem."
            description="Conhece as histórias que começam muito antes de um produto chegar à tua cozinha."
            action={
              <Button to="/produtores" variant="text">
                Conhecer todos
                <Icon name="arrow" />
              </Button>
            }
          />
          <div className="producer-grid">
            {producers.map((producer) => (
              <ProducerCard key={producer.id} producer={producer} />
            ))}
          </div>
        </Container>
      </section>
      <section className="how-section" aria-labelledby="how-title">
        <Container>
          <div className="how-intro">
            <p className="eyebrow">Um caminho mais próximo</p>
            <h2 id="how-title">
              Da origem à mesa.
              <br />
              <em>Com simplicidade.</em>
            </h2>
            <Button to="/como-funciona" variant="text">
              Como funciona
              <Icon name="arrow" />
            </Button>
          </div>
          <ol className="how-steps">
            <li>
              <span className="how-step-number">01</span>
              <h3>Descobre o que é bom.</h3>
              <p>
                Explora os produtos da época e encontra os sabores que queres trazer para a tua
                cozinha.
              </p>
            </li>
            <li>
              <span className="how-step-number">02</span>
              <h3>Conhece quem produz.</h3>
              <p>Um produto tem mais sabor quando sabes de onde vem e quem cuida dele.</p>
            </li>
            <li>
              <span className="how-step-number">03</span>
              <h3>Aproxima a tua mesa.</h3>
              <p>
                O mercado que estamos a construir junta pequenas colheitas e grandes momentos de
                partilha.
              </p>
            </li>
          </ol>
        </Container>
      </section>
      <section className="market-section catalog-section" aria-labelledby="catalog-title">
        <Container>
          <SectionHeading
            id="catalog-title"
            eyebrow="Escolhe com gosto"
            title="O teu próximo sabor está aqui."
            action={
              <Button to="/produtos" variant="text">
                Explorar o catálogo
                <Icon name="arrow" />
              </Button>
            }
          />
          <div
            className="category-list"
            role="group"
            aria-label="Categorias do catálogo demonstrativo"
          >
            {categories.map((item) => (
              <CategoryPill
                key={item}
                label={item}
                active={category === item}
                onClick={() => setCategory(item)}
                icon={
                  item === 'Todos'
                    ? 'basket'
                    : item === 'Hortícolas'
                      ? 'leaf'
                      : item === 'Fruta'
                        ? 'sun'
                        : undefined
                }
              />
            ))}
          </div>
          <div className="product-grid">
            {previewProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <p className="catalog-note" aria-live="polite">
            {previewProducts.length} produtos nesta seleção demonstrativa.
          </p>
        </Container>
      </section>
      <section className="final-cta" aria-labelledby="cta-title">
        <Container>
          <div>
            <p className="eyebrow">Para quem cultiva coisas boas</p>
            <h2 id="cta-title">
              Há lugar para
              <br />
              <em>a tua colheita.</em>
            </h2>
            <p>
              Estamos a aproximar quem produz de quem valoriza a origem.
              <br />
              Vamos pôr a nossa terra à mesa?
            </p>
            <Button to="/registo?perfil=produtor" variant="primary">
              Quero ser produtor
              <Icon name="arrow" />
            </Button>
          </div>
          <div className="cta-illustration" aria-hidden="true">
            <svg viewBox="0 0 300 250" fill="none">
              <path
                d="M35 221h236M55 221c3-22 18-43 43-43s40 21 43 43M139 221c6-20 25-35 46-35s40 15 44 35M130 204V83M130 148c-52 0-71-35-63-75 42 0 63 24 63 75Zm0-33c0-48 31-74 77-71 0 46-28 80-77 71ZM188 194v-49M188 177c0-27 18-43 46-42 0 27-16 44-46 42Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="248" cy="51" r="19" stroke="currentColor" strokeWidth="2" />
              <path
                d="M248 16V7M248 95v-9M213 51h-9M283 51h9M222 25l-6-6M274 77l6 6"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            <span>
              Crescemos melhor
              <br />
              quando estamos perto.
            </span>
          </div>
        </Container>
      </section>
      <div className="homepage-credit">
        <Container>
          <Link to="/sistema-visual">
            Uma identidade com raízes. Conhece o sistema visual
            <Icon name="diagonal" width="15" height="15" />
          </Link>
        </Container>
      </div>
    </>
  );
}
