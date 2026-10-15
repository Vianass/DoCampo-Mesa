import { Link, useParams } from 'react-router';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { roleLabels, type Role } from '../../features/auth/types';
import { privateSections, roleHome } from '../../features/private-area/navigation';

const greetings: Record<Role, { title: string; accent: string; description: string }> = {
  comprador: {
    title: 'As tuas escolhas,',
    accent: 'mais perto da origem.',
    description:
      'Um espaço para acompanhar o que chega à tua mesa e as histórias que vais descobrindo.',
  },
  produtor: {
    title: 'Da tua terra,',
    accent: 'para outras mesas.',
    description:
      'O espaço de quem cultiva, prepara e partilha. A estrutura para apresentar a tua produção começa aqui.',
  },
  administrador: {
    title: 'Cuidar do mercado,',
    accent: 'desde a raiz.',
    description:
      'Um lugar para acompanhar a comunidade, conhecer candidaturas e cuidar do que é partilhado.',
  },
};
export function RoleLandingPage({ role }: { role: Role }) {
  const greeting = greetings[role];
  return (
    <>
      <header className="private-intro">
        <p className="eyebrow">Demonstração · {roleLabels[role]}</p>
        <h1>
          {greeting.title}
          <br />
          <em>{greeting.accent}</em>
        </h1>
        <p>{greeting.description}</p>
      </header>
      <section className="private-prototype" aria-labelledby="private-prototype-title">
        <span aria-hidden="true">✳</span>
        <div>
          <h2 id="private-prototype-title">Um primeiro olhar sobre o teu espaço.</h2>
          <p>
            Estás a explorar a estrutura do protótipo. Não existe uma conta autenticada; os
            percursos abaixo ainda não permitem operações.
          </p>
        </div>
      </section>
      {role === 'produtor' && (
        <p className="private-approval-note">
          Os novos produtores estão sujeitos a decisão administrativa. Esta demonstração não
          representa uma candidatura submetida nem uma aprovação.
        </p>
      )}
      <section className="private-paths" aria-labelledby="private-paths-title">
        <h2 id="private-paths-title">Caminhos a preparar.</h2>
        {privateSections[role].map((section, index) => (
          <Link key={section.slug} to={`${roleHome(role)}/${section.slug}`}>
            <span className="private-paths__number" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <h3>{section.label}</h3>
              <p>{section.description}</p>
              <small>Ainda indisponível</small>
            </div>
            <Icon name="arrow" />
          </Link>
        ))}
      </section>
    </>
  );
}
export function PrivateSectionPage({ role }: { role: Role }) {
  const { section: slug } = useParams();
  const section = privateSections[role].find((entry) => entry.slug === slug);
  if (!section) return <PrivateNotFoundPage home={roleHome(role)} />;
  return (
    <section className="private-unavailable">
      <p className="eyebrow">Demonstração · {roleLabels[role]}</p>
      <h1>{section.label}.</h1>
      <p>{section.description}</p>
      <div className="private-prototype">
        <Icon name="clock" />
        <div>
          <h2>Este caminho ainda está a crescer.</h2>
          <p>
            Funcionalidade ainda indisponível. Esta página apresenta apenas o lugar reservado para
            uma próxima fase; não consulta nem altera dados.
          </p>
        </div>
      </div>
      {role === 'produtor' && slug === 'candidatura' && (
        <p>
          Não existe candidatura associada a esta demonstração. A aprovação e os direitos de
          produtores pendentes ou rejeitados serão definidos antes da integração real.
        </p>
      )}
      <Button to={roleHome(role)} variant="secondary">
        Voltar à visão geral
      </Button>
    </section>
  );
}
export function PrivateNotFoundPage({ home = '/area' }: { home?: string }) {
  return (
    <section className="private-unavailable">
      <p className="eyebrow">Por outro caminho</p>
      <h1>Este caminho não existe na tua área.</h1>
      <p>A ligação não corresponde a uma secção deste protótipo.</p>
      <Button to={home}>Voltar à visão geral</Button>
    </section>
  );
}
