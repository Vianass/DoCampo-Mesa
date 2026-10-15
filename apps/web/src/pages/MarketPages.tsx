import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { AuctionCard } from '../components/AuctionCard';
import { Button } from '../components/Button';
import { CategoryPill } from '../components/CategoryPill';
import { Container } from '../components/Container';
import { EmptyState } from '../components/EmptyState';
import { FormField } from '../components/FormField';
import { Icon } from '../components/Icon';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { PriceDisplay } from '../components/PriceDisplay';
import { ProductCard } from '../components/ProductCard';
import { ProducerCard } from '../components/ProducerCard';
import { StatusBadge } from '../components/StatusBadge';
import { auction, producers, products } from '../data/market';
import { producerCategories } from '../features/market/selectors';

function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

export function ProducersPage() {
  return (
    <Container>
      <PageIntro
        eyebrow="Quem cuida da origem"
        title="Boas coisas começam com pessoas."
        description="Conhece histórias imaginadas para o nosso mercado demonstrativo. Fotografias ilustrativas, perfis fictícios."
      />
      <section className="catalog-results producer-directory" aria-labelledby="producer-list-title">
        <h2 className="visually-hidden" id="producer-list-title">
          Histórias dos produtores
        </h2>
        <div className="producer-grid">
          {producers.map((producer) => (
            <ProducerCard
              key={producer.id}
              producer={producer}
              categories={producerCategories(products, producer.id)}
            />
          ))}
        </div>
      </section>
    </Container>
  );
}

export function AuctionsPage() {
  return (
    <Container>
      <PageIntro
        eyebrow="Cada colheita conta"
        title="O bom da terra merece uma oportunidade."
        description="Conhece a proposta visual dos leilões. Valores e tempos ilustrativos; sem ofertas ou participantes reais."
      />
      <section className="catalog-results" aria-labelledby="auction-list-title">
        <h2 className="visually-hidden" id="auction-list-title">
          Leilão em destaque
        </h2>
        <AuctionCard auction={auction} />
      </section>
    </Container>
  );
}

export function AuctionDetailPage() {
  const { id } = useParams();
  if (id !== auction.id) return <NotFoundPage />;
  return (
    <Container>
      <PageIntro
        eyebrow="Uma oportunidade da época"
        title="Cabazes que trazem a horta contigo."
        description="Um lote fictício de 20 cabazes com hortícolas variados, pensado para mostrar o mercado de leilões."
      />
      <div className="auction-detail">
        <img src={auction.image} alt={auction.imageAlt} width="1200" height="800" />
        <div>
          <StatusBadge tone="live">Leilão demonstrativo</StatusBadge>
          <h2>{auction.quantity}</h2>
          <p>
            {auction.producer} · {auction.locality}
          </p>
          <PriceDisplay amountCents={auction.currentPriceCents} large />
          <p className="demo-note">
            Valor ilustrativo. A licitação e a contagem em tempo real serão disponibilizadas numa
            etapa futura.
          </p>
          <Button disabled>Licitações ainda indisponíveis</Button>
          <Button to="/produtos" variant="text">
            Explorar produtos
            <Icon name="arrow" />
          </Button>
        </div>
      </div>
    </Container>
  );
}

export function HowItWorksPage() {
  return (
    <Container>
      <PageIntro
        eyebrow="Mais perto do que importa"
        title="Um mercado com raízes."
        description="A ideia é simples: aproximar quem cuida da terra de quem gosta de comer bem."
      />
      <section className="story-grid" aria-labelledby="story-title">
        <div>
          <h2 id="story-title">Conhecer a origem muda a forma de escolher.</h2>
          <p>
            Queremos dar espaço aos produtos da época, às pequenas colheitas e às histórias dos
            produtores locais. Um caminho mais curto entre a horta e a cozinha, com escolhas que
            fazem sentido para quem produz e para quem compra.
          </p>
          <p>
            Estás a explorar um mercado demonstrativo. Podes conhecer produtos e perfis fictícios;
            as encomendas, as contas e as licitações chegarão em etapas futuras.
          </p>
          <Button to="/produtos">
            Encontrar o próximo sabor
            <Icon name="arrow" />
          </Button>
        </div>
        <img
          src="/images/harvest.webp"
          alt="Legumes variados reunidos numa caixa de madeira"
          width="1200"
          height="800"
          loading="lazy"
        />
      </section>
    </Container>
  );
}

const palette = [
  { name: 'Verde floresta', value: '#193C34' },
  { name: 'Verde sálvia', value: '#A9B9A2' },
  { name: 'Creme quente', value: '#F7F3EA' },
  { name: 'Terracota', value: '#C56A45' },
  { name: 'Amarelo colheita', value: '#E6BC68' },
  { name: 'Grafite', value: '#252923' },
  { name: 'Branco', value: '#FFFFFF' },
];
function Showcase({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="showcase-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function DesignSystemPage() {
  const [active, setActive] = useState('Todos');
  return (
    <Container>
      <PageIntro
        eyebrow="Uma identidade com raízes"
        title="O nosso sistema visual."
        description="Cores naturais, tipografia editorial e componentes que partilham o mesmo cuidado."
      />
      <Showcase title="Uma paleta que vem da terra">
        <div className="swatch-grid">
          {palette.map((color) => (
            <div key={color.name}>
              <span className="color-swatch" style={{ backgroundColor: color.value }} />
              <strong>{color.name}</strong>
              <code>{color.value}</code>
            </div>
          ))}
        </div>
      </Showcase>
      <Showcase title="Tipografia com carácter">
        <p className="type-specimen">O sabor começa na origem.</p>
        <p>
          DM Serif Display para títulos. DM Sans para leitura, navegação e informação de produto.
        </p>
      </Showcase>
      <Showcase title="Ações e estados">
        <div className="showcase-row">
          <Button>
            Botão principal
            <Icon name="arrow" />
          </Button>
          <Button variant="secondary">Botão secundário</Button>
          <Button variant="text">
            Ligação com intenção
            <Icon name="diagonal" />
          </Button>
          <Button disabled>Indisponível</Button>
        </div>
        <div className="showcase-row">
          <StatusBadge tone="seasonal">Da época</StatusBadge>
          <StatusBadge tone="organic">Biológico · exemplo</StatusBadge>
          <StatusBadge tone="live">Em direto · exemplo</StatusBadge>
          <StatusBadge>Neutro</StatusBadge>
          <PriceDisplay amountCents={280} unit="kg" />
        </div>
        <div className="category-list" role="group" aria-label="Exemplo de categorias">
          {['Todos', 'Hortícolas', 'Fruta'].map((label) => (
            <CategoryPill
              key={label}
              label={label}
              active={active === label}
              onClick={() => setActive(label)}
            />
          ))}
        </div>
      </Showcase>
      <Showcase title="Formulários com contexto">
        <div className="showcase-fields">
          <FormField
            label="Nome"
            placeholder="Como gostas de ser tratado?"
            hint="Campo de demonstração; não envia dados."
          />
          <FormField
            label="Email"
            type="email"
            placeholder="nome@exemplo.pt"
            error="Exemplo de erro: confirma o formato do email."
          />
        </div>
      </Showcase>
      <Showcase title="Cartões do mercado">
        <div className="product-grid">
          {products.slice(0, 2).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        <div className="producer-grid showcase-producers">
          {producers.slice(0, 1).map((producer) => (
            <ProducerCard key={producer.id} producer={producer} />
          ))}
        </div>
        <AuctionCard auction={auction} />
      </Showcase>
      <Showcase title="Estados vazios e carregamento">
        <EmptyState
          title="Uma nova colheita está a caminho."
          description="Um exemplo de estado vazio com linguagem próxima e um próximo passo claro."
          action={
            <Button to="/produtos" variant="secondary">
              Explorar o mercado
            </Button>
          }
        />
        <LoadingSkeleton label="Exemplo visual de carregamento" count={3} />
      </Showcase>
    </Container>
  );
}

export function NotFoundPage() {
  return (
    <Container>
      <PageIntro
        eyebrow="Por outro caminho"
        title="Esta página não está no mercado."
        description="A ligação pode ter mudado ou o produto não fazer parte da seleção demonstrativa."
      />
      <div className="account-placeholder">
        <Button to="/">
          Voltar ao início
          <Icon name="arrow" />
        </Button>
      </div>
    </Container>
  );
}
