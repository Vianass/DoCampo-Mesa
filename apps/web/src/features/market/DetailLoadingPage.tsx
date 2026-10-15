import { Container } from '../../components/Container';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';

export function DetailLoadingPage({ kind }: { kind: 'product' | 'producer' }) {
  const label = kind === 'product' ? 'A carregar o produto' : 'A carregar o produtor';
  return (
    <Container>
      <div className="market-detail-loading">
        <p className="eyebrow">O mercado da nossa terra</p>
        <LoadingSkeleton label={label} count={2} />
      </div>
    </Container>
  );
}
