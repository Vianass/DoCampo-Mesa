import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { FormField } from '../../components/FormField';
import { roleLabels } from '../auth/types';
import { ProducerSelect } from '../producer/ProducerFields';
import { orderDate } from '../orders/format';
import { useAdminResource } from './useAdminResource';
import { useAdminUsers } from './useAdminUsers';
import { AdminFeedback } from './AdminFeedback';
import { AdminUserDetail } from './AdminUserDetail';
import {
  adminApi,
  usersPath,
  userQuery,
  userSearch,
  parseUsers,
  type UserQuery,
} from './contracts';
function UserList() {
  const [params, setParams] = useSearchParams(),
    query = userQuery(params),
    search = userSearch(query),
    { state } = useAdminUsers(),
    focus = useRef(false),
    title = useRef<HTMLHeadingElement>(null);
  const r = useAdminResource(adminApi + '?' + search, parseUsers, state.revision),
    last = r.data ? Math.max(1, Math.min(1000, r.data.totalPaginas)) : query.pagina,
    corrected = query.pagina > last ? userSearch({ ...query, pagina: last }) : '';
  useEffect(() => {
    if (corrected) {
      focus.current = true;
      setParams(corrected, { replace: true });
    }
  }, [corrected, setParams]);
  useEffect(() => {
    if (r.data && !corrected && focus.current) {
      focus.current = false;
      title.current?.focus();
    }
  }, [r.data, corrected]);
  function filters(next: Partial<UserQuery>, manual = false) {
    focus.current = manual;
    setParams(userSearch({ ...query, pagina: 1, ...next }));
  }
  return (
    <>
      <form
        className="admin-user-search"
        aria-label="Pesquisar utilizadores"
        onSubmit={(event) => {
          event.preventDefault();
          filters({
            pesquisa: String(new FormData(event.currentTarget).get('pesquisa') ?? '').trim(),
          });
        }}
      >
        <FormField
          key={query.pesquisa}
          name="pesquisa"
          label="Nome ou email"
          type="search"
          maxLength={100}
          defaultValue={query.pesquisa}
        />
        <Button type="submit">Pesquisar</Button>
      </form>
      <div className="admin-application-filters">
        <ProducerSelect
          label="Estado da conta"
          value={query.estado}
          onChange={(e) => filters({ estado: e.target.value as UserQuery['estado'] })}
        >
          <option value="">Todos os estados</option>
          <option value="ativo">Ativa</option>
          <option value="inativo">Inativa</option>
        </ProducerSelect>
        <ProducerSelect
          label="Papel do utilizador"
          value={query.papel}
          onChange={(e) => filters({ papel: e.target.value as UserQuery['papel'] })}
        >
          <option value="">Todos os papéis</option>
          {Object.entries(roleLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </ProducerSelect>
        <ProducerSelect
          label="Utilizadores por página"
          value={query.porPagina}
          onChange={(e) => filters({ porPagina: Number(e.target.value) as UserQuery['porPagina'] })}
        >
          {[12, 24, 36].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </ProducerSelect>
        <ProducerSelect
          label="Ordenar por registo"
          value={query.ordem}
          onChange={(e) => filters({ ordem: e.target.value as UserQuery['ordem'] })}
        >
          <option value="recentes">Mais recentes primeiro</option>
          <option value="antigas">Mais antigas primeiro</option>
        </ProducerSelect>
      </div>
      <div className="admin-decision-actions">
        <Button
          variant="secondary"
          disabled={r.loading}
          onClick={() => {
            focus.current = true;
            r.retry();
          }}
        >
          Atualizar utilizadores
        </Button>
        <Button
          variant="text"
          onClick={() => filters({ pesquisa: '', estado: '', papel: '' }, true)}
        >
          Limpar filtros
        </Button>
      </div>
      {(r.loading || !!corrected) && (
        <LoadingSkeleton label="A consultar utilizadores reais" count={2} />
      )}
      {r.error && <AdminFeedback message={r.error} retry={r.retry} forbidden={r.forbidden} />}
      {r.data && !corrected && (
        <>
          <h2 ref={title} tabIndex={-1}>
            Contas do mercado.
          </h2>
          <p role="status">
            {r.data.total}{' '}
            {r.data.total === 1 ? 'utilizador nesta consulta.' : 'utilizadores nesta consulta.'}
          </p>
          {r.data.itens.length ? (
            <section className="admin-user-cards" aria-label="Utilizadores reais">
              {r.data.itens.map((user) => (
                <article className="admin-application-paper" key={user.id}>
                  <StatusBadge tone={user.ativo ? 'organic' : 'neutral'}>
                    {user.ativo ? 'Ativa' : 'Inativa'}
                  </StatusBadge>
                  <h3>{user.nome}</h3>
                  <p className="admin-user-email">{user.email}</p>
                  <p>{user.papeis.map((p) => roleLabels[p]).join(' · ')}</p>
                  <p>Registo em {orderDate(user.registadoEm)}</p>
                  <Button variant="text" to={usersPath + '/' + user.id + '?' + search}>
                    Consultar conta{' '}
                    <span className="visually-hidden">
                      de {user.nome}, {user.email}
                    </span>
                    →
                  </Button>
                </article>
              ))}
            </section>
          ) : (
            <EmptyState
              title="Nenhum utilizador corresponde à consulta."
              description="Revê a pesquisa e os filtros ou atualiza a listagem."
            />
          )}
          {r.data.totalPaginas > 1 && (
            <nav className="admin-application-pagination" aria-label="Paginação de utilizadores">
              <Button
                variant="secondary"
                disabled={query.pagina === 1}
                onClick={() => filters({ pagina: query.pagina - 1 }, true)}
              >
                Página anterior
              </Button>
              <span>
                Página {query.pagina} de {r.data.totalPaginas}
              </span>
              <Button
                variant="secondary"
                disabled={query.pagina >= r.data.totalPaginas || query.pagina >= 1000}
                onClick={() => filters({ pagina: query.pagina + 1 }, true)}
              >
                Página seguinte
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
export default function AdminUsersArea() {
  const { pathname } = useLocation(),
    parts = pathname.split('/').filter(Boolean);
  return (
    <div className="admin-workspace admin-applications admin-users">
      <header className="admin-intro">
        <p className="eyebrow">Administração · Contas reais</p>
        <h1>
          Pessoas que fazem
          <br />
          <em>o mercado.</em>
        </h1>
        <p>Consulta as contas e protege o acesso com decisões registadas.</p>
      </header>
      {parts.length > 4 ? (
        <EmptyState
          title="Este utilizador não está disponível."
          description="Revê o endereço."
          action={<Button to={usersPath}>Voltar à listagem</Button>}
        />
      ) : parts[3] ? (
        <AdminUserDetail key={parts[3]} id={parts[3].toLowerCase()} />
      ) : (
        <UserList />
      )}
    </div>
  );
}
