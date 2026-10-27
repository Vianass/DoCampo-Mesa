import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import type { ApiFailure } from '../api/client';
export function RemoteError({ error, retry }: { error: ApiFailure; retry: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        title={
          error.kind === 'network' || error.kind === 'timeout' || (error.status ?? 0) >= 500
            ? 'O mercado está temporariamente indisponível.'
            : 'Não foi possível carregar esta seleção.'
        }
        description={error.message}
        action={
          <Button variant="secondary" onClick={retry}>
            Tentar novamente
          </Button>
        }
      />
    </div>
  );
}
