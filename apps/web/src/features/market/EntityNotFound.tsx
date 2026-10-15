import { Button } from '../../components/Button';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { Container } from '../../components/Container';
import { Icon } from '../../components/Icon';

export function EntityNotFound({ kind }: { kind: 'product' | 'producer' }) {
  const product = kind === 'product';
  return (
    <Container>
      <Breadcrumbs
        items={[
          { label: 'Início', to: '/' },
          { label: product ? 'Produtos' : 'Produtores', to: product ? '/produtos' : '/produtores' },
          { label: 'Não encontrado' },
        ]}
      />
      <div className="entity-not-found">
        <p className="eyebrow">Há outros caminhos para descobrir</p>
        <h1>
          {product ? 'Este produto não está no mercado.' : 'Este produtor não está no mercado.'}
        </h1>
        <p>
          {product
            ? 'O produto não faz parte da seleção demonstrativa. Volta ao catálogo para encontrar outros sabores.'
            : 'O perfil não faz parte dos produtores fictícios. Conhece as outras histórias do mercado.'}
        </p>
        <Button to={product ? '/produtos' : '/produtores'} variant="secondary">
          {product ? 'Explorar produtos' : 'Conhecer produtores'}
          <Icon name="arrow" />
        </Button>
      </div>
    </Container>
  );
}
