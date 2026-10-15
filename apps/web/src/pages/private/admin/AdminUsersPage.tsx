import { useParams, useSearchParams } from 'react-router';
import { Button } from '../../../components/Button';
import { AdminPageFrame } from '../../../features/admin/AdminPageFrame';
import { AdminBadge, AdminEmpty, AdminFilters } from '../../../features/admin/AdminComponents';
import {
  adminHome,
  byId,
  filterOptions,
  roleLabels,
  selectAdminUsers,
} from '../../../features/admin/selectors';
import { buyerDate } from '../../../features/buyer/selectors';
export default function AdminUsersPage({ detail = false }: { detail?: boolean }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const options = filterOptions(params, roleLabels);
  return (
    <AdminPageFrame
      title={detail ? 'Uma pessoa do mercado.' : 'Pessoas e papéis.'}
      description="Consulta de utilizadores fictícios. Sem alterações de permissões, eliminação de contas ou operações de segurança."
    >
      {(data) => {
        if (detail) {
          const user = byId(data.users, id);
          if (!user) return <AdminEmpty section="utilizadores" missing />;
          const producer = data.producers.find((p) => p.userId === user.id);
          return (
            <section className="admin-user-detail">
              <h2>{user.displayName}</h2>
              <AdminBadge>{roleLabels[user.role]}</AdminBadge>
              <dl className="admin-facts">
                <div>
                  <dt>Identificador fictício</dt>
                  <dd>{user.id}</dd>
                </div>
                <div>
                  <dt>Registo demonstrativo</dt>
                  <dd>{buyerDate(user.joinedAt)}</dd>
                </div>
                <div>
                  <dt>Encomendas como comprador</dt>
                  <dd>{data.orders.filter((o) => o.buyerId === user.id).length}</dd>
                </div>
              </dl>
              {producer && (
                <Button to={adminHome + '/produtores/' + producer.id} variant="secondary">
                  Consultar produtor associado
                </Button>
              )}
              <p className="admin-help">
                O papel é apenas uma associação do modelo demonstrativo. Aprovar uma candidatura não
                altera permissões ou a sessão de outro papel.
              </p>
              <Button to={adminHome + '/utilizadores'} variant="text">
                Voltar aos utilizadores
              </Button>
            </section>
          );
        }
        const list = selectAdminUsers(data, options.search, options.status);
        return (
          <>
            <AdminFilters label="utilizadores" options={roleLabels} {...options} />
            <p className="admin-result-count">{list.length} utilizadores fictícios</p>
            {!list.length ? (
              <AdminEmpty section="utilizadores" />
            ) : (
              <ul className="admin-list admin-user-list">
                {list.map((u) => (
                  <li key={u.id}>
                    <div>
                      <h2>{u.displayName}</h2>
                      <p>{u.id}</p>
                      <AdminBadge>{roleLabels[u.role]}</AdminBadge>
                    </div>
                    <Button to={adminHome + '/utilizadores/' + u.id} variant="text">
                      Consultar utilizador
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
