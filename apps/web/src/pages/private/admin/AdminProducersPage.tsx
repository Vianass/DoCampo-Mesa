import { publicProducerPath } from '../../../features/api/catalog';
import { useParams, useSearchParams } from 'react-router';
import { Button } from '../../../components/Button';
import { MarketImage } from '../../../components/MarketImage';
import { ProducerMap } from '../../../components/ProducerMap';
import { buyerDate } from '../../../features/buyer/selectors';
import { AdminPageFrame } from '../../../features/admin/AdminPageFrame';
import {
  AdminBadge,
  AdminEmpty,
  AdminFilters,
  AdminDecisionForm,
  AdminDecisionRecord,
} from '../../../features/admin/AdminComponents';
import {
  adminHome,
  applicationLabels,
  byId,
  filterOptions,
  selectAdminProducers,
} from '../../../features/admin/selectors';

export default function AdminProducersPage({
  applications = false,
  detail = false,
}: {
  applications?: boolean;
  detail?: boolean;
}) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const section = applications ? 'candidaturas' : 'produtores';
  const options = filterOptions(params, applicationLabels, applications ? 'pendente' : 'todos');
  return (
    <AdminPageFrame
      title={
        detail ? 'Conhecer esta origem.' : applications ? 'Candidaturas.' : 'Quem produz o mercado.'
      }
      description={
        detail
          ? 'Perfil, candidatura e rastreabilidade fictícia. Nenhuma decisão concede acesso real.'
          : 'Pesquisa e consulta de produtores. Os estados são exemplos privados, independentes do catálogo público.'
      }
    >
      {(data) => {
        if (detail) {
          const producer = byId(data.producers, id);
          if (!producer) return <AdminEmpty section={section} missing />;
          const { profile, application } = producer;
          return (
            <section className="admin-producer-detail" key={producer.id}>
              <div className="admin-profile-heading">
                <MarketImage src={profile.image} alt={profile.imageAlt} width="160" height="160" />
                <div>
                  <p className="eyebrow">Produtor demonstrativo</p>
                  <h2>{profile.name}</h2>
                  <p>
                    {profile.locality} · {profile.specialty}
                  </p>
                  <AdminBadge pending={application.status === 'pendente'}>
                    {applicationLabels[application.status]} · simulado
                  </AdminBadge>
                </div>
              </div>
              <p>{profile.description}</p>
              <div className="admin-detail-grid">
                <div>
                  <h3>Dados da candidatura.</h3>
                  <dl className="admin-facts">
                    <div>
                      <dt>Identificador</dt>
                      <dd>{producer.id}</dd>
                    </div>
                    <div>
                      <dt>Utilizador associado</dt>
                      <dd>
                        <Button to={adminHome + '/utilizadores/' + producer.userId} variant="text">
                          Consultar utilizador
                        </Button>
                      </dd>
                    </div>
                    <div>
                      <dt>Data de candidatura fictícia</dt>
                      <dd>{buyerDate(application.submittedAt)}</dd>
                    </div>
                    <div>
                      <dt>Produtos de referência</dt>
                      <dd>{data.products.filter((p) => p.producerId === producer.id).length}</dd>
                    </div>
                  </dl>
                  <h3>O que analisar.</h3>
                  <p>
                    Identificação, localidade, descrição da produção e informação pública. A
                    confirmação dos dados, evidências e acesso antes da aprovação dependem da API e
                    de Q04.
                  </p>
                  <ol className="admin-history">
                    <li>Preparação dos dados do produtor.</li>
                    <li>Análise administrativa da candidatura.</li>
                    <li>Decisão e comunicação futura no servidor.</li>
                  </ol>
                  <Button to={publicProducerPath(producer.id)} variant="text">
                    Explorar perfis públicos
                  </Button>
                </div>
                <ProducerMap locality={profile.locality} region={profile.region} />
              </div>
              {application.decision ? (
                <AdminDecisionRecord data={data} decision={application.decision} />
              ) : (
                <AdminDecisionForm kind="application" id={producer.id} />
              )}
              <Button to={adminHome + '/' + section} variant="secondary">
                Voltar a {section}
              </Button>
            </section>
          );
        }
        const list = selectAdminProducers(data, options.search, options.status);
        return (
          <>
            <AdminFilters
              label={section}
              options={applicationLabels}
              {...options}
              defaultStatus={applications ? 'pendente' : 'todos'}
            />
            <p className="admin-result-count">{list.length} registos · dados demonstrativos</p>
            {!list.length ? (
              <AdminEmpty section={section} />
            ) : (
              <ul className="admin-list admin-producer-list">
                {list.map((p) => (
                  <li key={p.id}>
                    <MarketImage
                      src={p.profile.image}
                      alt={p.profile.imageAlt}
                      width="72"
                      height="72"
                      loading="lazy"
                    />
                    <div>
                      <h2>{p.profile.name}</h2>
                      <p>{p.profile.locality}</p>
                      <AdminBadge pending={p.application.status === 'pendente'}>
                        {applicationLabels[p.application.status]} · simulado
                      </AdminBadge>
                    </div>
                    <Button to={adminHome + '/' + section + '/' + p.id} variant="text">
                      {applications ? 'Consultar candidatura' : 'Consultar produtor'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      }}
    </AdminPageFrame>
  );
}
