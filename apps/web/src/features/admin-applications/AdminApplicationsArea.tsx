import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { useAuth } from '../auth/useAuth';
import { ProducerSelect } from '../producer/ProducerFields';
import { stateLabels } from '../producer-application/model';
import { orderDate } from '../orders/format';
import { useApplicationList } from './useApplicationList';
import { useAdminApplications } from './useAdminApplications';
import {
  adminApplicationsPath,
  applicationQuery,
  queryString,
  type ApplicationQuery,
} from './contracts';
import { AdminApplicationDetails } from './AdminApplicationDetails';
import { AdminApplicationDecision } from './AdminApplicationDecision';

function ApplicationList() {
  const [params, setParams] = useSearchParams(),
    query = applicationQuery(params),
    resource = useApplicationList(query);
  const lastPage = resource.data
      ? Math.max(1, Math.min(1000, resource.data.totalPaginas))
      : query.pagina,
    correctingPage = query.pagina > lastPage,
    correctedSearch = correctingPage ? queryString({ ...query, pagina: lastPage }) : '',
    loading = resource.loading || correctingPage;
  const root = useRef<HTMLDivElement>(null),
    manualFocus = useRef(false);
  useEffect(() => {
    if (!correctedSearch) return;
    manualFocus.current = true;
    setParams(correctedSearch, { replace: true });
  }, [correctedSearch, setParams]);
  useEffect(() => {
    if (correctingPage) return;
    if (resource.error) root.current?.querySelector<HTMLElement>('[role="group"]')?.focus();
    else if (resource.data && manualFocus.current) {
      manualFocus.current = false;
      root.current?.querySelector<HTMLElement>('#admin-list-title')?.focus();
    }
  }, [resource.error, resource.data, correctingPage]);
  function filters(next: Partial<ApplicationQuery>, focus = false) {
    manualFocus.current = focus;
    setParams(queryString({ ...query, pagina: 1, ...next }));
  }
  return (
    <div ref={root}>
      <div className="admin-application-filters">
        <ProducerSelect
          label="Estado das candidaturas"
          value={query.estado}
          onChange={(event) =>
            filters({ estado: event.target.value as ApplicationQuery['estado'] })
          }
        >
          <option value="">Todos os estados</option>
          {Object.entries(stateLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </ProducerSelect>
        <ProducerSelect
          label="Ordenar por submissão"
          value={query.ordem}
          onChange={(event) => filters({ ordem: event.target.value as ApplicationQuery['ordem'] })}
        >
          <option value="recentes">Mais recentes primeiro</option>
          <option value="antigas">Mais antigas primeiro</option>
        </ProducerSelect>
        <ProducerSelect
          label="Candidaturas por página"
          value={query.porPagina}
          onChange={(event) =>
            filters({ porPagina: Number(event.target.value) as ApplicationQuery['porPagina'] })
          }
        >
          {[12, 24, 36].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </ProducerSelect>
      </div>
      <p>
        Os filtros e os totais abrangem todas as candidaturas. Os contactos e a identificação da
        conta estão disponíveis no detalhe autorizado.
      </p>
      <Button
        variant="secondary"
        disabled={loading}
        onClick={() => {
          manualFocus.current = true;
          resource.retry();
        }}
      >
        Atualizar listagem
      </Button>
      {loading && <LoadingSkeleton count={2} label="A consultar candidaturas reais" />}
      {resource.error && (
        <div
          className="admin-application-feedback"
          role="group"
          aria-label="Recuperar listagem"
          tabIndex={-1}
        >
          <p role="alert">{resource.error}</p>
          <Button
            onClick={() => {
              manualFocus.current = true;
              resource.retry();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {resource.data && !correctingPage && (
        <>
          <h2 id="admin-list-title" tabIndex={-1}>
            Explorações candidatas.
          </h2>
          <p role="status">
            {resource.data.total} {resource.data.total === 1 ? 'candidatura' : 'candidaturas'} nesta
            consulta.
          </p>
          {resource.data.itens.length ? (
            <section className="admin-application-cards" aria-label="Candidaturas reais">
              {resource.data.itens.map((item) => (
                <article className="admin-application-paper" key={item.id}>
                  <StatusBadge
                    tone={
                      item.estado === 'pendente'
                        ? 'seasonal'
                        : item.estado === 'aprovado'
                          ? 'organic'
                          : 'neutral'
                    }
                  >
                    {stateLabels[item.estado]}
                  </StatusBadge>
                  <h3>{item.nomePublico}</h3>
                  <p>
                    Submetida em{' '}
                    <time dateTime={item.submetidaEm}>{orderDate(item.submetidaEm)}</time>
                  </p>
                  <Button
                    to={adminApplicationsPath + '/' + item.id + '?' + queryString(query)}
                    variant="text"
                  >
                    Consultar candidatura{' '}
                    <span className="visually-hidden">de {item.nomePublico}</span> →
                  </Button>
                </article>
              ))}
            </section>
          ) : (
            <EmptyState
              title={
                query.pagina > 1
                  ? 'Esta página não tem candidaturas.'
                  : query.estado
                    ? 'Sem candidaturas para este estado.'
                    : 'Ainda não há candidaturas.'
              }
              description="Podes rever os filtros ou atualizar a consulta."
              action={
                <Button
                  variant="secondary"
                  onClick={() => filters({ pagina: 1, estado: '' }, true)}
                >
                  Ver todas as candidaturas
                </Button>
              }
            />
          )}
          {(resource.data.totalPaginas > 1 || query.pagina > 1) && (
            <nav className="admin-application-pagination" aria-label="Paginação de candidaturas">
              <Button
                variant="secondary"
                disabled={query.pagina <= 1}
                onClick={() => filters({ pagina: query.pagina - 1 }, true)}
              >
                Página anterior
              </Button>
              <span>
                Página {query.pagina} de {resource.data.totalPaginas}
              </span>
              <Button
                variant="secondary"
                disabled={query.pagina >= resource.data.totalPaginas || query.pagina >= 1000}
                onClick={() => filters({ pagina: query.pagina + 1 }, true)}
              >
                Página seguinte
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
function ApplicationDetail({ id }: { id: string }) {
  const { state, load } = useAdminApplications(),
    { revalidate } = useAuth(),
    location = useLocation();
  const root = useRef<HTMLDivElement>(null),
    seen = useRef(state.event),
    manual = useRef(false);
  const initialRead = useRef(!state.busy);
  useEffect(() => {
    if (state.busy) return;
    if (initialRead.current || state.id !== id) {
      initialRead.current = false;
      void load(id);
    }
  }, [id, load, state.busy, state.id]);
  const current = state.id === id ? state : undefined;
  useEffect(() => {
    if (!current) return;
    if (current.event !== seen.current) {
      seen.current = current.event;
      if (current.feedback?.kind === 'error')
        root.current?.querySelector<HTMLElement>('[role="group"]')?.focus();
      else root.current?.querySelector<HTMLElement>('#admin-application-state')?.focus();
    }
    if (manual.current && current.status === 'ready') {
      manual.current = false;
      root.current?.querySelector<HTMLElement>('#admin-application-state')?.focus();
    }
  }, [current]);
  return (
    <div ref={root}>
      <div className="admin-decision-actions">
        <Button to={adminApplicationsPath + location.search} variant="text">
          ← Voltar à listagem
        </Button>
        <Button
          variant="secondary"
          disabled={current?.busy || current?.status === 'loading'}
          onClick={() => {
            manual.current = true;
            void load(id);
          }}
        >
          Atualizar candidatura
        </Button>
      </div>
      {current?.feedback && (
        <div
          className={
            'admin-application-feedback admin-application-feedback--' + current.feedback.kind
          }
          {...(current.feedback.kind === 'error'
            ? { role: 'group', 'aria-label': 'Recuperar decisão', tabIndex: -1 }
            : {})}
        >
          {current.feedback.kind === 'error' ? (
            <>
              <p role="alert">{current.feedback.message}</p>
              <Button
                variant="secondary"
                disabled={current.status === 'loading'}
                onClick={() => {
                  manual.current = true;
                  void load(id);
                }}
              >
                Consultar estado atualizado
              </Button>
              {current.forbidden && (
                <Button variant="text" onClick={() => void revalidate()}>
                  Confirmar acesso administrativo
                </Button>
              )}
            </>
          ) : (
            <p role="status">{current.feedback.message}</p>
          )}
        </div>
      )}
      {(!current || current.status === 'idle' || current.status === 'loading') && (
        <LoadingSkeleton count={2} label="A consultar a candidatura" />
      )}
      {current?.status === 'ready' && current.data && (
        <>
          <AdminApplicationDetails data={current.data} />
          {current.data.estado === 'pendente' ? (
            current.locked && !current.busy ? (
              <p>
                Revê o estado atualizado antes de decidir. Utiliza «Consultar estado atualizado»
                para retomar a análise.
              </p>
            ) : (
              <AdminApplicationDecision />
            )
          ) : (
            <p className="admin-application-terminal">
              Esta tentativa já tem uma decisão. Não pode ser decidida novamente; o histórico será
              preservado.
            </p>
          )}
        </>
      )}
    </div>
  );
}
export default function AdminApplicationsArea() {
  const { session } = useAuth(),
    location = useLocation(),
    parts = location.pathname.split('/').filter(Boolean);
  if (session.kind !== 'authenticated' || !session.user.papeis.includes('administrador'))
    return (
      <EmptyState
        title="Este percurso não está na tua área."
        description="É necessário acesso administrativo confirmado pelo serviço."
      />
    );
  return (
    <div className="admin-workspace admin-applications">
      <header className="admin-intro">
        <p className="eyebrow">Supervisão · Dados reais</p>
        <h1>
          {parts[3] ? 'Conhecer a origem.' : 'Origens por conhecer.'}
          <br />
          <em>{parts[3] ? 'Decidir com cuidado.' : 'Um mercado com confiança.'}</em>
        </h1>
        <p>
          {parts[3]
            ? 'Consulta a atividade, o estado e o histórico antes de registar uma decisão.'
            : 'Candidaturas de produtores para analisar, com decisões registadas pelo serviço.'}
        </p>
      </header>
      {parts.length > 4 ? (
        <EmptyState
          title="Esta candidatura não está disponível."
          description="Revê o caminho ou regressa à listagem."
          action={<Button to={adminApplicationsPath}>Voltar à listagem</Button>}
        />
      ) : parts[3] ? (
        <ApplicationDetail key={parts[3]} id={parts[3].toLowerCase()} />
      ) : (
        <ApplicationList />
      )}
    </div>
  );
}
