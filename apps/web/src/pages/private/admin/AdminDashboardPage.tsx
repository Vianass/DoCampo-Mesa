import { Link } from 'react-router';
import { Button } from '../../../components/Button';
import { AdminPageFrame } from '../../../features/admin/AdminPageFrame';
import {
  adminHome,
  adminSummary,
  selectAdminProducers,
  selectAdminCases,
  byId,
} from '../../../features/admin/selectors';
import { AdminEmpty } from '../../../features/admin/AdminComponents';

export default function AdminDashboardPage() {
  return (
    <AdminPageFrame
      title="Cuidar do mercado."
      accent="Com uma visão de conjunto."
      description="Pessoas, origens e atividade num retrato demonstrativo, sem operações reais."
    >
      {(data) => {
        const summary = adminSummary(data);
        const metrics = [
          ['Utilizadores', summary.userCount, 'utilizadores'],
          ['Produtores', summary.producerCount, 'produtores'],
          ['Candidaturas pendentes', summary.pendingApplicationCount, 'candidaturas'],
          ['Encomendas registadas', summary.orderCount, 'encomendas'],
          ['Avaliações denunciadas', summary.reportedReviewCount, 'moderacao'],
          ['Leilões ativos', summary.activeAuctionCount, 'leiloes?estado=ativo'],
        ] as const;
        return (
          <>
            <dl className="admin-metrics">
              {metrics.map(([label, value, to]) => (
                <div key={label}>
                  <dt>
                    <Link to={adminHome + '/' + to}>{label}</Link>
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="admin-dashboard-grid">
              <section>
                <p className="eyebrow">Para analisar</p>
                <h2>Origens à espera de resposta.</h2>
                <ul className="admin-list">
                  {selectAdminProducers(data, '', 'pendente').map((p) => (
                    <li key={p.id}>
                      <div>
                        <h3>{p.profile.name}</h3>
                        <p>{p.profile.locality} · candidatura pendente</p>
                      </div>
                      <Button to={adminHome + '/candidaturas/' + p.id} variant="text">
                        Consultar candidatura
                      </Button>
                    </li>
                  ))}
                </ul>
                {!summary.pendingApplicationCount && <AdminEmpty section="candidaturas" />}
                <h2>Avaliações por rever.</h2>
                <p>
                  {summary.pendingReviewCount} pendentes · {summary.reportedReviewCount} avaliações
                  denunciadas no conjunto.
                </p>
                <ul className="admin-list">
                  {selectAdminCases(data, '', 'pendente').map((c) => (
                    <li key={c.id}>
                      <div>
                        <h3>{byId(data.producers, c.review.producerId)?.profile.name}</h3>
                        <p>{c.reports.length} sinalizações · avaliação fictícia</p>
                      </div>
                      <Button to={adminHome + '/moderacao/' + c.id} variant="text">
                        Consultar denúncia
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
              <aside className="admin-aside">
                <p className="eyebrow">Serviços Cloud</p>
                <h2>Um estado por conhecer.</h2>
                <p>
                  A monitorização real não está implementada. Os exemplos de estado são simulados e
                  não confirmam disponibilidade.
                </p>
                <Button to={adminHome + '/servicos'} variant="secondary">
                  Consultar os serviços
                </Button>
                <hr />
                <h3>Consulta global.</h3>
                <p>Encomendas, utilizadores e leilões estão disponíveis apenas para leitura.</p>
                <Button to={adminHome + '/encomendas'} variant="text">
                  Explorar encomendas
                </Button>
              </aside>
            </div>
          </>
        );
      }}
    </AdminPageFrame>
  );
}
