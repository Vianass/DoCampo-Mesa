import { Component, type ReactNode } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useBuyer } from './useBuyer';
import type { BuyerDataset } from './types';

export function BuyerLoading() {
  return (
    <div className="buyer-loading">
      <h1>A preparar o teu espaço.</h1>
      <LoadingSkeleton label="A carregar a área do comprador" count={2} />
    </div>
  );
}
export function BuyerPageFrame({
  title,
  accent,
  description,
  children,
}: {
  title: string;
  accent?: string;
  description: string;
  children: (data: BuyerDataset) => ReactNode;
}) {
  const { resource, scenario, refresh } = useBuyer();
  const [params, setParams] = useSearchParams();
  function changeScenario(value: string) {
    const next = new URLSearchParams(params);
    if (value === 'normal') next.delete('cenario');
    else next.set('cenario', value);
    setParams(next);
  }
  return (
    <div className="buyer-page">
      <header className="buyer-intro">
        <p className="eyebrow">O teu mercado · Comprador</p>
        <h1>
          {title}
          {accent && (
            <>
              <br />
              <em>{accent}</em>
            </>
          )}
        </h1>
        <p>{description}</p>
      </header>
      <div className="private-prototype buyer-demo-note">
        <p>
          Dados fictícios. Não existe uma conta autenticada nem compras verificadas. A atividade dos
          leilões é um retrato de 15 de outubro de 2026, sem atualizações em tempo real.
        </p>
      </div>
      {resource.status === 'loading' && (
        <LoadingSkeleton label="A carregar a atividade demonstrativa" count={2} />
      )}
      {resource.status === 'error' && (
        <div className="buyer-error" role="alert">
          <EmptyState
            title="A atividade não pôde ser apresentada."
            description={resource.message}
            action={
              <div className="buyer-state-actions">
                <Button onClick={refresh} variant="secondary">
                  Tentar novamente
                </Button>
                <Button onClick={() => changeScenario('normal')} variant="text">
                  Voltar à atividade ilustrativa
                </Button>
              </div>
            }
          />
        </div>
      )}
      {resource.status === 'ready' && children(resource.data)}
      <details className="buyer-data-note">
        <summary>Sobre estes dados</summary>
        <p>
          Encomendas, comentários e ofertas foram criados para explorar esta interface. As
          alterações a avaliações ficam apenas na sessão demonstrativa. Nenhuma operação é enviada a
          um serviço.
        </p>
        <label htmlFor="buyer-scenario">Cenário de demonstração</label>
        <select
          id="buyer-scenario"
          className="form-select"
          value={scenario}
          onChange={(event) => changeScenario(event.target.value)}
        >
          <option value="normal">Atividade ilustrativa</option>
          <option value="vazio">Sem atividade</option>
          <option value="erro">Indisponibilidade demonstrativa</option>
        </select>
      </details>
    </div>
  );
}
class BuyerErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="buyer-page">
          <h1>O teu espaço precisa de uma nova tentativa.</h1>
          <p role="alert">
            Não foi possível apresentar esta página. Nenhuma encomenda ou oferta foi alterada.
          </p>
          <div className="buyer-state-actions">
            <Button onClick={() => this.setState({ failed: false })}>Tentar novamente</Button>
            <Button to="/area/comprador" variant="text">
              Voltar à visão geral
            </Button>
          </div>
        </section>
      );
    return this.props.children;
  }
}
export function BuyerArea() {
  const location = useLocation();
  return (
    <BuyerErrorBoundary key={location.pathname}>
      <Outlet />
    </BuyerErrorBoundary>
  );
}
