import { Component, type ReactNode } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAdmin } from './useAdmin';
import type { AdminDataset } from './types';
export function AdminLoading() {
  return (
    <section className="admin-workspace">
      <h1>A preparar a supervisão.</h1>
      <LoadingSkeleton count={2} label="A carregar a área administrativa" />
    </section>
  );
}
export function AdminPageFrame({
  title,
  accent,
  description,
  children,
}: {
  title: string;
  accent?: string;
  description: string;
  children: (data: AdminDataset) => ReactNode;
}) {
  const { resource, scenario, feedback, refresh } = useAdmin();
  const [params, setParams] = useSearchParams();
  const change = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'normal') next.delete('cenario');
    else next.set('cenario', value);
    setParams(next);
  };
  return (
    <div className="admin-workspace">
      <header className="admin-intro">
        <p className="eyebrow">Supervisão · Administrador</p>
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
      <div className="private-prototype admin-demo-note">
        <p>
          Dados fictícios · supervisão demonstrativa. Aprovações e moderação são simulações nesta
          sessão. Não existe uma conta autenticada nem autorização administrativa real; os dados
          públicos não são alterados.
        </p>
      </div>
      {resource.status === 'loading' && (
        <LoadingSkeleton count={2} label="A carregar a atividade administrativa" />
      )}
      {resource.status === 'error' && (
        <div role="alert" className="admin-error">
          <EmptyState
            title="A supervisão precisa de uma nova tentativa."
            description="A atividade deste cenário não pôde ser apresentada. Nenhum dado foi enviado a um serviço."
            action={
              <div className="admin-actions">
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
              className={'admin-feedback admin-feedback--' + feedback.kind}
              role={feedback.kind === 'error' ? 'alert' : 'status'}
            >
              <p>{feedback.message}</p>
            </div>
          )}
          {children(resource.data)}
        </>
      )}
      <details className="admin-scenario">
        <summary>Sobre esta demonstração</summary>
        <p>
          Explora os cenários com dados, sem atividade ou indisponíveis. As decisões repõem-se ao
          sair, mudar de papel, recarregar ou mudar de cenário. Não existem reservas de stock,
          pedidos à API ou acontecimentos em tempo real. Leilões: retrato de 15 de outubro de 2026,
          09:00 UTC.
        </p>
        <label htmlFor="admin-scenario">Cenário administrativo</label>
        <select
          id="admin-scenario"
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
class AdminBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="admin-workspace">
          <h1>Vamos tentar outro caminho.</h1>
          <p role="alert">
            Não foi possível apresentar esta página. Nenhum dado público foi alterado.
          </p>
          <div className="admin-actions">
            <Button onClick={() => this.setState({ failed: false })}>Tentar novamente</Button>
            <Button to="/area/administrador" variant="text">
              Voltar à visão geral
            </Button>
          </div>
        </section>
      );
    return this.props.children;
  }
}
export function AdminArea() {
  const location = useLocation();
  return (
    <AdminBoundary key={location.pathname}>
      <Outlet />
    </AdminBoundary>
  );
}
