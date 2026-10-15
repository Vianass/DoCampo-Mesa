import { useParams, useSearchParams } from 'react-router';
import { Button } from '../../../components/Button';
import { ReviewCard } from '../../../components/ReviewCard';
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
  byId,
  filterOptions,
  moderationLabels,
  selectAdminCases,
} from '../../../features/admin/selectors';
export default function AdminModerationPage({ detail = false }: { detail?: boolean }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const options = filterOptions(params, moderationLabels);
  return (
    <AdminPageFrame
      title={detail ? 'Ouvir antes de decidir.' : 'Cuidar da conversa.'}
      description="Denúncias fictícias sobre avaliações de produtores. Manter ou ocultar são decisões locais, sem alterar avaliações públicas."
    >
      {(data) => {
        if (detail) {
          const entry = byId(data.cases, id);
          if (!entry) return <AdminEmpty section="moderacao" missing />;
          return (
            <section className="admin-review-detail" key={entry.id}>
              <div className="admin-section-heading">
                <h2>{byId(data.producers, entry.review.producerId)?.profile.name}</h2>
                <AdminBadge pending={entry.status === 'pendente'}>
                  {moderationLabels[entry.status]} · simulado
                </AdminBadge>
              </div>
              <p>
                {entry.id} · {entry.reports.length} sinalizações para uma avaliação
              </p>
              <ReviewCard review={entry.review} />
              <Button to={adminHome + '/encomendas/' + entry.review.orderId} variant="text">
                Consultar encomenda de referência
              </Button>
              <h3>Motivos de sinalização.</h3>
              <ul className="admin-list">
                {entry.reports.map((report) => (
                  <li key={report.id}>
                    <div>
                      <h4>{report.reporterLabel}</h4>
                      <p>{report.reason}</p>
                      <time dateTime={report.reportedAt}>{buyerDate(report.reportedAt)}</time>
                    </div>
                  </li>
                ))}
              </ul>
              {entry.decision ? (
                <AdminDecisionRecord data={data} decision={entry.decision} />
              ) : (
                <AdminDecisionForm kind="review" id={entry.id} />
              )}
              <p className="admin-help">
                O texto, a classificação e as evidências são preservados. A moderação de outros
                conteúdos depende de Q12 e de regras no servidor.
              </p>
              <Button to={adminHome + '/moderacao'} variant="secondary">
                Voltar à moderação
              </Button>
            </section>
          );
        }
        const list = selectAdminCases(data, options.search, options.status);
        return (
          <>
            <AdminFilters label="avaliações denunciadas" options={moderationLabels} {...options} />
            <p className="admin-result-count">
              {list.length} avaliações distintas · várias sinalizações não duplicam avaliações
            </p>
            {!list.length ? (
              <AdminEmpty section="moderacao" />
            ) : (
              <ul className="admin-list admin-review-list">
                {list.map((c) => (
                  <li key={c.id}>
                    <div>
                      <h2>{byId(data.producers, c.review.producerId)?.profile.name}</h2>
                      <p>
                        {c.review.rating}/5 · {c.review.displayName} · {c.reports.length}{' '}
                        sinalizações
                      </p>
                      <p>{c.review.text}</p>
                      <AdminBadge pending={c.status === 'pendente'}>
                        {moderationLabels[c.status]} · simulado
                      </AdminBadge>
                    </div>
                    <Button to={adminHome + '/moderacao/' + c.id} variant="text">
                      Consultar denúncia
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="admin-help">
              Outros conteúdos: âmbito e poderes de moderação por definir em Q12. Não existem ações
              de remoção ou edição nesta fase.
            </p>
          </>
        );
      }}
    </AdminPageFrame>
  );
}
