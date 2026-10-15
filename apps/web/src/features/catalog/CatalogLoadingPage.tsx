import { Container } from '../../components/Container';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { CatalogIntro } from './CatalogIntro';

export function CatalogLoadingPage() {
  return (
    <div className="catalog-page">
      <Container>
        <CatalogIntro />
        <div className="catalog-loading">
          <LoadingSkeleton label="A carregar o catálogo" count={6} />
        </div>
      </Container>
    </div>
  );
}
