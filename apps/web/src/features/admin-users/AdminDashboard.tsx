import { Button } from '../../components/Button';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { AccountIdentity } from '../private-area/AccountIdentity';
import { privateSections } from '../private-area/navigation';
import { useAuth } from '../auth/useAuth';
import { orderDate } from '../orders/format';
import { useAdminResource } from './useAdminResource';
import { AdminFeedback } from './AdminFeedback';
import { metricLabels, parseDashboard, usersPath } from './contracts';
export default function AdminDashboard() {
  const { session } = useAuth(),
    resource = useAdminResource('/admin/dashboard', parseDashboard);
  if (session.kind !== 'authenticated') return null;
  return (
    <div className="admin-workspace admin-applications admin-users">
      <header className="admin-intro">
        <p className="eyebrow">Administração · Dados reais</p>
        <h1>
          Uma visão do mercado.
          <br />
          <em>Cuidar de quem o faz.</em>
        </h1>
        <p>Acompanha a atividade e gere o acesso com decisões fundamentadas.</p>
      </header>
      <AccountIdentity user={session.user} />
      <div className="admin-decision-actions">
        <Button variant="secondary" disabled={resource.loading} onClick={resource.retry}>
          Atualizar indicadores
        </Button>
        <Button to={usersPath}>Gerir utilizadores</Button>
        <Button variant="secondary" to="/area/administrador/moderacao">
          Moderar avaliações
        </Button>
        <Button variant="secondary" to="/area/administrador/leiloes">
          Supervisionar leilões
        </Button>
        <Button variant="secondary" to="/area/administrador/encomendas">
          Supervisionar encomendas
        </Button>
      </div>
      {resource.loading && <LoadingSkeleton label="A consultar indicadores reais" count={3} />}
      {resource.error && (
        <AdminFeedback
          message={resource.error}
          retry={resource.retry}
          forbidden={resource.forbidden}
        />
      )}
      {resource.data && (
        <>
          <p role="status">Indicadores consultados em {orderDate(resource.data.observadoEm)}.</p>
          <dl className="admin-real-metrics" aria-label="Indicadores reais do mercado">
            {(Object.keys(metricLabels) as (keyof typeof metricLabels)[]).map((key) => (
              <div key={key}>
                <dt>{metricLabels[key]}</dt>
                <dd>{resource.data![key]}</dd>
              </div>
            ))}
          </dl>
          {resource.data.encomendas === 0 &&
            resource.data.produtosPublicados === 0 &&
            resource.data.leiloesAtivos === 0 && (
              <p>O mercado ainda não tem produtos publicados, encomendas ou leilões ativos.</p>
            )}
          <p className="admin-help">
            Uma conta pode ser compradora e produtora. Os totais por capacidade não são parcelas do
            total de utilizadores. Os produtos publicados incluem artigos sem stock; os leilões
            ativos respeitam o prazo do serviço. Estes valores não representam receitas ou
            pagamentos.
          </p>
          <section className="admin-application-entry" aria-labelledby="admin-entry-title">
            <p className="eyebrow">Candidaturas de produtores · Dados reais</p>
            <h2 id="admin-entry-title">Novas origens à mesa.</h2>
            <p role="status">
              {resource.data.candidaturasPendentes}{' '}
              {resource.data.candidaturasPendentes === 1
                ? 'candidatura pendente'
                : 'candidaturas pendentes'}{' '}
              no total.
            </p>
            <Button to="/area/administrador/candidaturas?estado=pendente">
              Analisar candidaturas
            </Button>
          </section>
        </>
      )}
      <section className="admin-application-paper">
        <h2>Outras secções, em preparação.</h2>
        <p>A moderação e os serviços serão disponibilizados nas fases próprias.</p>
        <div className="admin-quick-links">
          {privateSections.administrador
            .filter(
              (s) =>
                !['utilizadores', 'candidaturas', 'encomendas', 'leiloes', 'moderacao'].includes(
                  s.slug,
                ),
            )
            .map((s) => (
              <Button key={s.slug} variant="text" to={'/area/administrador/' + s.slug}>
                {s.label}
              </Button>
            ))}
        </div>
      </section>
    </div>
  );
}
