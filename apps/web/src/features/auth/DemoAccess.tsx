import { useNavigate, useSearchParams } from 'react-router';
import { Icon } from '../../components/Icon';
import { useAuth } from './useAuth';
import { roles, roleLabels } from './types';
import { demoDestination } from '../private-area/navigation';

const captions = {
  comprador: 'Do catálogo às tuas escolhas.',
  produtor: 'O espaço de quem cuida da terra.',
  administrador: 'Acompanhar e cuidar do mercado.',
};
export function DemoAccess() {
  const { startDemonstration, session } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return (
    <section className="demo-access" aria-labelledby="demo-access-title" id="demonstracao">
      <p className="eyebrow">Um convite a conhecer</p>
      <h2 id="demo-access-title">Explorar sem conta.</h2>
      <p>
        Escolhe um papel para percorrer o protótipo. Este acesso de demonstração não autentica uma
        conta e termina ao recarregar a página.
      </p>
      {session.kind === 'demonstration' && (
        <p className="demo-access__current">Demonstração atual: {roleLabels[session.role]}.</p>
      )}
      <div className="demo-access__roles">
        {roles.map((role) => (
          <button
            type="button"
            key={role}
            aria-label={`Explorar como ${role}`}
            onClick={() => {
              startDemonstration(role);
              navigate(demoDestination(params.get('destino'), role));
            }}
          >
            <span>
              <strong>{roleLabels[role]}</strong>
              <small>{captions[role]}</small>
            </span>
            <Icon name="arrow" />
          </button>
        ))}
      </div>
    </section>
  );
}
