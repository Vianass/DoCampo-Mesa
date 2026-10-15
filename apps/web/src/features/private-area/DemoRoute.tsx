import { Navigate, Outlet, useLocation } from 'react-router';
import { Button } from '../../components/Button';
import { useAuth } from '../auth/useAuth';
import type { Role } from '../auth/types';
import { roleHome } from './navigation';

// Presentation guard only; real resource access must be enforced by a future backend.
export function DemoRoute({ role }: { role?: Role }) {
  const { session } = useAuth();
  const location = useLocation();
  if (session.kind === 'visitor')
    return <Navigate replace to={`/entrar?destino=${encodeURIComponent(location.pathname)}`} />;
  if (role && session.role !== role)
    return (
      <section className="private-unavailable" aria-labelledby="demo-denied-title">
        <p className="eyebrow">Outro caminho no mercado</p>
        <h1 id="demo-denied-title">Este percurso pertence a outro papel.</h1>
        <p>
          A demonstração atual não inclui esta área. Podes regressar ao teu espaço ou escolher outro
          papel na entrada.
        </p>
        <Button to={roleHome(session.role)}>Voltar à minha área</Button>
        <Button to="/entrar#demonstracao" variant="text">
          Escolher outro papel
        </Button>
      </section>
    );
  return <Outlet />;
}
export function PrivateIndex() {
  const { session } = useAuth();
  return (
    <Navigate replace to={session.kind === 'demonstration' ? roleHome(session.role) : '/entrar'} />
  );
}
