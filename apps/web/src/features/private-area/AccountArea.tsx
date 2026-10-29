import { Link, Navigate, useLocation } from 'react-router';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useAuth } from '../auth/useAuth';
import { isRole, roleLabels } from '../auth/types';
import { privateSections, roleHome } from './navigation';
import { lazy, Suspense } from 'react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { AccountIdentity } from './AccountIdentity';
import { ApplicationEntry } from '../producer-application/ApplicationEntry';
import { applicationPath } from '../producer-application/model';
const ProducerApplicationPage = lazy(
  () => import('../producer-application/ProducerApplicationPage'),
);
const ProducerAuctionsArea = lazy(() => import('../auctions/ProducerAuctionsArea'));
const BuyerAuctionsArea = lazy(() => import('../auctions/BuyerAuctionsArea'));
const OrdersArea = lazy(() => import('../orders/OrdersArea'));
const ProducerOrdersArea = lazy(() => import('../producer-orders/ProducerOrdersArea'));
export function AccountArea() {
  const { session } = useAuth();
  const location = useLocation();
  if (session.kind !== 'authenticated') return null;
  const pieces = location.pathname.split('/').filter(Boolean),
    role = pieces[1];
  if (location.pathname === applicationPath)
    return (
      <Suspense fallback={<LoadingSkeleton label="A carregar a candidatura" count={2} />}>
        <ProducerApplicationPage />
      </Suspense>
    );
  if (
    role === 'produtor' &&
    pieces[2] === 'candidatura' &&
    session.user.papeis.includes('produtor')
  )
    return <Navigate replace to={applicationPath} />;
  if (!role) return <Navigate replace to={roleHome(session.user.papeis[0]!)} />;
  if (!isRole(role) || !session.user.papeis.includes(role))
    return (
      <section className="private-unavailable">
        <h1>Este percurso não está na tua área.</h1>
        <Button to="/area">Voltar à minha área</Button>
      </section>
    );
  if (role === 'produtor' && pieces[2] === 'leiloes')
    return (
      <Suspense fallback={<LoadingSkeleton label="A carregar os teus leilões" count={2} />}>
        <ProducerAuctionsArea />
      </Suspense>
    );
  if (role === 'comprador' && pieces[2] === 'licitacoes')
    return (
      <Suspense fallback={<LoadingSkeleton label="A carregar os leilões" count={2} />}>
        <BuyerAuctionsArea />
      </Suspense>
    );
  const section = privateSections[role].find((item) => item.slug === pieces[2]);
  if (role === 'produtor' && (!pieces[2] || ['encomendas', 'indicadores'].includes(pieces[2])))
    return (
      <Suspense fallback={<LoadingSkeleton label="A carregar a atividade do produtor" count={2} />}>
        <ProducerOrdersArea overview={pieces[2] !== 'encomendas'} />
      </Suspense>
    );
  if (role === 'comprador' && pieces[2] === 'encomendas')
    return (
      <Suspense fallback={<LoadingSkeleton label="A carregar as tuas encomendas" count={2} />}>
        <OrdersArea />
      </Suspense>
    );
  if (pieces[2] && !section)
    return (
      <section className="private-unavailable">
        <h1>Este percurso não está disponível.</h1>
        <Button to={roleHome(role)}>Voltar à visão geral</Button>
      </section>
    );
  return (
    <div className="account-area">
      <header className={`${role === 'comprador' ? 'buyer' : 'producer'}-intro`}>
        <p className="eyebrow">O teu mercado · {roleLabels[role]}</p>
        <h1>{section ? section.label : 'O teu lugar à mesa.'}</h1>
        <p>Bem-vindo, {session.user.nome}.</p>
      </header>
      <AccountIdentity user={session.user} />
      {role === 'comprador' && !pieces[2] && !session.user.papeis.includes('produtor') && (
        <ApplicationEntry />
      )}
      <section className="private-unavailable" aria-labelledby="account-activity-title">
        <p className="eyebrow">Um caminho em construção</p>
        <h2 id="account-activity-title">
          {section
            ? 'Esta funcionalidade ainda não está disponível nesta área.'
            : 'A tua atividade ficará aqui.'}
        </h2>
        <p>
          A ligação dos dados privados à tua conta será disponibilizada numa próxima etapa. Não
          apresentamos encomendas, avaliações, candidaturas ou indicadores fictícios como sendo
          teus.
        </p>
        {!section && (
          <div className="buyer-dashboard-grid">
            {privateSections[role].map((item) => (
              <article key={item.slug} className="private-prototype">
                <h3>{item.label}</h3>
                <p>{item.description}</p>
                <Link className="editorial-text-link" to={`${roleHome(role)}/${item.slug}`}>
                  Consultar disponibilidade <Icon name="arrow" />
                </Link>
              </article>
            ))}
          </div>
        )}
        <p>
          Os exemplos visuais podem ser explorados num espaço separado, sem autenticar contas ou
          alterar dados reais.
        </p>
        <a
          className="editorial-text-link"
          href="/demonstracao/entrar"
          target="_blank"
          rel="noopener noreferrer"
        >
          Explorar a demonstração{' '}
          <span className="visually-hidden">(novo separador, sem a tua sessão)</span>
          <Icon name="diagonal" />
        </a>
      </section>
    </div>
  );
}
