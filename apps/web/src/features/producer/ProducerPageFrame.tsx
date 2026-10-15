import { Component, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useProducer } from './useProducer';
import type { ProducerDataset } from './types';
export function ProducerLoading() {
  return (
    <section className="producer-workspace">
      <h1>A preparar a tua produção.</h1>
      <LoadingSkeleton count={2} label="A carregar a área do produtor" />
    </section>
  );
}
export function ProducerPageFrame({
  title,
  accent,
  description,
  children,
}: {
  title: string;
  accent?: string;
  description: string;
  children: (data: ProducerDataset) => ReactNode;
}) {
  const { resource, scenario, feedback, refresh } = useProducer();
  const [params, setParams] = useSearchParams();
  const change = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'normal') next.delete('cenario');
    else next.set('cenario', value);
    setParams(next);
  };
  return (
    <div className="producer-workspace">
      <header className="producer-intro">
        <p className="eyebrow">A tua produção · Produtor</p>
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
      <div className="private-prototype producer-demo-note">
        <p>
          Dados fictícios. Não existe uma conta autenticada nem uma aprovação real. As edições ficam
          apenas nesta sessão; o mercado público mantém os seus dados.
        </p>
      </div>
      {resource.status === 'loading' && (
        <LoadingSkeleton count={2} label="A carregar a atividade do produtor" />
      )}
      {resource.status === 'error' && (
        <div role="alert" className="producer-error">
          <EmptyState
            title="A produção precisa de uma nova tentativa."
            description="A atividade deste cenário não pôde ser apresentada. Nenhum dado foi enviado a um serviço."
            action={
              <div className="producer-actions">
                <Button variant="secondary" onClick={refresh}>
                  Tentar novamente
                </Button>
                <Button variant="text" onClick={() => change('normal')}>
                  Voltar à atividade ilustrativa
                </Button>
              </div>
            }
          />
        </div>
      )}
      {resource.status === 'ready' && (
        <>
          {feedback && (
            <div
              className={'producer-feedback producer-feedback--' + feedback.kind}
              role={feedback.kind === 'error' ? 'alert' : 'status'}
            >
              <p>{feedback.message}</p>
              {feedback.kind === 'success' && feedback.targetId && (
                <Link to={'/area/produtor/produtos/' + feedback.targetId}>
                  Consultar o produto guardado →
                </Link>
              )}
            </div>
          )}
          {children(resource.data)}
        </>
      )}
      <details className="producer-scenario">
        <summary>Sobre esta demonstração</summary>
        <p>
          Explora os cenários com dados, sem atividade ou indisponíveis. As edições repõem-se ao
          sair, mudar de papel, recarregar ou mudar de cenário. Não existem reservas de stock,
          pedidos à API ou acontecimentos em tempo real. Leilões: retrato de 15 de outubro de 2026,
          09:00 UTC.
        </p>
        <label htmlFor="producer-scenario">Cenário do produtor</label>
        <select
          id="producer-scenario"
          className="form-select"
          value={scenario}
          onChange={(event) => change(event.target.value)}
        >
          <option value="normal">Atividade ilustrativa</option>
          <option value="vazio">Sem atividade</option>
          <option value="erro">Indisponibilidade demonstrativa</option>
        </select>
      </details>
    </div>
  );
}
class ProducerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="producer-workspace">
          <h1>Vamos tentar outro caminho.</h1>
          <p role="alert">
            Não foi possível apresentar esta página. Nenhum dado público foi alterado.
          </p>
          <div className="producer-actions">
            <Button onClick={() => this.setState({ failed: false })}>Tentar novamente</Button>
            <Button to="/area/produtor" variant="text">
              Voltar à visão geral
            </Button>
          </div>
        </section>
      );
    return this.props.children;
  }
}
export function ProducerArea() {
  const location = useLocation();
  return (
    <ProducerBoundary key={location.pathname}>
      <Outlet />
    </ProducerBoundary>
  );
}
