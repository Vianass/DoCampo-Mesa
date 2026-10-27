import { Navigate, Outlet, useLocation } from 'react-router';
import { Button } from '../../components/Button';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../auth/useAuth';
import { isRole, type Role } from '../auth/types';
import { demonstrationSite } from '../auth/demo-mode';
import { roleHome } from './navigation';
// A demonstração tem um basename próprio; nunca estabelece uma sessão JWT.
export function DemoRoute({ role }: { role?: Role }) {
  const { session, demonstration, revalidate, logout, reason } = useAuth();
  const location = useLocation();
  if (demonstrationSite) {
    if (demonstration.kind === 'visitor')
      return <Navigate replace to={`/entrar?destino=${encodeURIComponent(location.pathname)}`} />;
    if (role && demonstration.role !== role)
      return (
        <section className="private-unavailable" aria-labelledby="demo-denied-title">
          <p className="eyebrow">Outro caminho no mercado</p>
          <h1 id="demo-denied-title">Este percurso pertence a outro papel.</h1>
          <p>
            A demonstração atual não inclui esta área. Podes regressar ao teu espaço ou escolher
            outro papel na entrada.
          </p>
          <Button to={roleHome(demonstration.role)}>Voltar à minha área</Button>
          <Button to="/entrar#demonstracao" variant="text">
            Escolher outro papel
          </Button>
        </section>
      );
    return <Outlet />;
  }
  if (session.kind === 'visitor')
    return (
      <Navigate
        replace
        to={
          reason === 'logout'
            ? '/entrar'
            : `/entrar?destino=${encodeURIComponent(location.pathname)}`
        }
      />
    );
  if (session.status === 'checking')
    return (
      <section className="private-unavailable">
        <h1>A confirmar o teu acesso.</h1>
        <LoadingSkeleton label="A confirmar a sessão" count={2} />
        <Button variant="text" onClick={() => void logout()}>
          Terminar sessão
        </Button>
      </section>
    );
  if (session.status === 'unavailable' || session.status === 'forbidden')
    return (
      <section className="private-unavailable">
        <h1>
          {session.status === 'forbidden'
            ? 'O serviço não autorizou esta consulta.'
            : 'Não foi possível confirmar a sessão.'}
        </h1>
        <p role="alert">
          {session.status === 'forbidden'
            ? 'O acesso a esta consulta foi recusado.'
            : 'O serviço está temporariamente indisponível. Os dados privados ficam indisponíveis até confirmar o acesso.'}
        </p>
        <Button onClick={() => void revalidate()}>Tentar novamente</Button>
        <Button variant="text" onClick={() => void logout()}>
          Terminar sessão
        </Button>
      </section>
    );
  const requested = role ?? location.pathname.split('/')[2];
  if (isRole(requested) && !session.user.papeis.includes(requested))
    return (
      <section className="private-unavailable">
        <p className="eyebrow">Outro caminho no mercado</p>
        <h1>Não tens acesso a esta área.</h1>
        <p>Esta conta não tem o papel necessário. As permissões são confirmadas pelo serviço.</p>
        <Button to={roleHome(session.user.papeis[0]!)}>Voltar à minha área</Button>
      </section>
    );
  return <Outlet />;
}
export function PrivateIndex() {
  const { session, demonstration } = useAuth();
  const home = demonstrationSite
    ? demonstration.kind === 'demonstration'
      ? roleHome(demonstration.role)
      : '/entrar'
    : session.kind === 'authenticated'
      ? roleHome(session.user.papeis[0]!)
      : '/entrar';
  return <Navigate replace to={home} />;
}
