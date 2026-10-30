import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Button } from '../../components/Button';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { ProducerTextarea } from '../producer/ProducerFields';
import { StatusBadge } from '../../components/StatusBadge';
import { roleLabels } from '../auth/types';
import { orderDate } from '../orders/format';
import { useAdminUsers } from './useAdminUsers';
import { useAdminResource } from './useAdminResource';
import { AdminFeedback } from './AdminFeedback';
import { adminApi, usersPath, parseAudits } from './contracts';
function AuditHistory({ id, revision }: { id: string; revision: number }) {
  const [page, setPage] = useState(1),
    r = useAdminResource(
      adminApi + '/' + id + '/audit?pagina=' + page + '&porPagina=12&ordem=recentes',
      parseAudits,
      revision,
    ),
    title = useRef<HTMLHeadingElement>(null),
    focus = useRef(false);
  useEffect(() => {
    if (r.data && focus.current) {
      focus.current = false;
      title.current?.focus();
    }
  }, [r.data]);
  return (
    <section className="admin-application-paper" aria-labelledby="user-audit-title">
      <h2 id="user-audit-title" ref={title} tabIndex={-1}>
        Histórico de acesso.
      </h2>
      <p>Alterações confirmadas, com autoria e motivo preservados.</p>
      {r.loading && <LoadingSkeleton count={1} label="A consultar auditoria" />}
      {r.error && <AdminFeedback message={r.error} retry={r.retry} forbidden={r.forbidden} />}
      {r.data && (
        <>
          {!r.data.total ? (
            <p>Não há alterações de estado registadas.</p>
          ) : (
            <ol className="admin-account-audit">
              {r.data.itens.map((event) => (
                <li key={event.id}>
                  <h3>{event.ativoAtual ? 'Conta reativada' : 'Conta desativada'}</h3>
                  <p>
                    {orderDate(event.ocorridoEm)} · {event.ativoAnterior ? 'Ativa' : 'Inativa'} →{' '}
                    {event.ativoAtual ? 'Ativa' : 'Inativa'}
                  </p>
                  <blockquote>{event.motivo}</blockquote>
                  <details>
                    <summary>Autoria e identificação</summary>
                    <p>Administrador: {event.administradorId}</p>
                    <p>Registo: {event.id}</p>
                  </details>
                </li>
              ))}
            </ol>
          )}
          {r.data.totalPaginas > 1 && (
            <nav className="admin-application-pagination" aria-label="Paginação da auditoria">
              <Button
                variant="secondary"
                disabled={page === 1}
                onClick={() => {
                  focus.current = true;
                  setPage((v) => v - 1);
                }}
              >
                Registos anteriores
              </Button>
              <span>
                Página {page} de {r.data.totalPaginas}
              </span>
              <Button
                variant="secondary"
                disabled={page >= r.data.totalPaginas || page >= 1000}
                onClick={() => {
                  focus.current = true;
                  setPage((v) => v + 1);
                }}
              >
                Mais registos
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
function StateDecision() {
  const { state, edit, validate, change } = useAdminUsers(),
    [open, setOpen] = useState(false),
    field = useRef<HTMLElement>(null);
  useEffect(() => {
    if (state.reasonError) field.current?.querySelector('textarea')?.focus();
  }, [state.reasonError]);
  return (
    <section className="admin-decision-panel" ref={field}>
      <h2>Gerir o acesso.</h2>
      <p>A alteração é aplicada pelo serviço, sem eliminar a conta ou alterar os seus papéis.</p>
      <form
        noValidate
        aria-label="Alterar estado da conta"
        aria-busy={state.busy}
        onSubmit={(event) => {
          event.preventDefault();
          if (validate()) setOpen(true);
        }}
      >
        <fieldset disabled={state.busy || state.locked}>
          <legend className="visually-hidden">Decisão sobre o estado da conta</legend>
          <ProducerTextarea
            label="Motivo da alteração"
            name="motivo"
            value={state.reason}
            onChange={(e) => edit(e.target.value)}
            required
            rows={4}
            hint="Obrigatório para desativar ou reativar. Até 2000 caracteres."
            error={state.reasonError}
          />
          <Button type="submit" variant={state.data?.ativo ? 'secondary' : 'primary'}>
            {state.data?.ativo ? 'Desativar conta' : 'Reativar conta'}
          </Button>
        </fieldset>
      </form>
      <ConfirmationDialog
        open={open}
        busy={state.busy}
        title={state.data?.ativo ? 'Desativar esta conta?' : 'Reativar esta conta?'}
        description={
          <>
            {state.data?.nome}.{' '}
            {state.data?.ativo
              ? 'O acesso autenticado será bloqueado pelo serviço.'
              : 'O acesso poderá ser retomado, respeitando as capacidades existentes.'}
          </>
        }
        confirmLabel={state.data?.ativo ? 'Confirmar desativação' : 'Confirmar reativação'}
        onClose={() => setOpen(false)}
        onConfirm={() => void change()}
      >
        <blockquote tabIndex={0} role="region" aria-label="Motivo da alteração a confirmar">
          {state.reason.normalize('NFC').trim()}
        </blockquote>
      </ConfirmationDialog>
    </section>
  );
}
export function AdminUserDetail({ id }: { id: string }) {
  const { state, load } = useAdminUsers(),
    { session, revalidate } = useAuth(),
    { search } = useLocation(),
    root = useRef<HTMLDivElement>(null),
    seen = useRef(state.event),
    manual = useRef(false),
    initial = useRef(!state.busy);
  useEffect(() => {
    if (!state.busy && (initial.current || state.id !== id)) {
      initial.current = false;
      void load(id);
    }
  }, [id, load, state.busy, state.id]);
  const current = state.id === id ? state : undefined;
  useEffect(() => {
    if (!current) return;
    if (current.event !== seen.current) {
      seen.current = current.event;
      root.current
        ?.querySelector<HTMLElement>(
          current.feedback?.kind === 'error' ? '[role="group"]' : '#admin-user-title',
        )
        ?.focus();
    }
    if (manual.current && !current.loading) {
      manual.current = false;
      root.current?.querySelector<HTMLElement>('#admin-user-title')?.focus();
    }
  }, [current]);
  return (
    <div ref={root}>
      <div className="admin-decision-actions">
        <Button to={usersPath + search} variant="text">
          ← Voltar aos utilizadores
        </Button>
        <Button
          variant="secondary"
          disabled={current?.busy || current?.loading}
          onClick={() => {
            manual.current = true;
            void load(id);
          }}
        >
          Atualizar conta
        </Button>
      </div>
      {current?.feedback && (
        <div
          className="admin-application-feedback"
          {...(current.feedback.kind === 'error'
            ? { role: 'group', 'aria-label': 'Recuperar alteração da conta', tabIndex: -1 }
            : {})}
        >
          <p role={current.feedback.kind === 'error' ? 'alert' : 'status'}>
            {current.feedback.message}
          </p>
          {current.feedback.kind === 'error' && (
            <>
              <Button
                variant="secondary"
                disabled={current.loading}
                onClick={() => {
                  manual.current = true;
                  void load(id);
                }}
              >
                Consultar estado atualizado
              </Button>
              {current.forbidden && (
                <Button onClick={() => void revalidate()}>Confirmar acesso administrativo</Button>
              )}
            </>
          )}
        </div>
      )}
      {(!current || current.loading) && (
        <LoadingSkeleton label="A consultar conta real" count={2} />
      )}
      {current?.data && !current.loading && (
        <>
          <section className="admin-application-paper">
            <StatusBadge tone={current.data.ativo ? 'organic' : 'neutral'}>
              {current.data.ativo ? 'Ativa' : 'Inativa'}
            </StatusBadge>
            <h2 id="admin-user-title" tabIndex={-1}>
              {current.data.nome}
            </h2>
            <dl className="application-data">
              <div>
                <dt>Email</dt>
                <dd>{current.data.email}</dd>
              </div>
              <div>
                <dt>Papéis registados</dt>
                <dd>{current.data.papeis.map((p) => roleLabels[p]).join(' · ')}</dd>
              </div>
              <div>
                <dt>Registo</dt>
                <dd>{orderDate(current.data.registadoEm)}</dd>
              </div>
              <div>
                <dt>Identificador da conta</dt>
                <dd>{current.data.id}</dd>
              </div>
            </dl>
            <h3>Capacidades atuais</h3>
            <ul>
              {[
                ['comprar', 'Comprar'],
                ['vender', 'Vender'],
                ['administrar', 'Administrar'],
              ].map(([key, label]) => (
                <li key={key}>
                  {label}:{' '}
                  {current.data!.capacidades[key as keyof typeof current.data.capacidades]
                    ? 'disponível'
                    : 'indisponível'}
                </li>
              ))}
            </ul>
            <p>
              Vender exige também um perfil aprovado. A aprovação continua no percurso de
              candidatura.
            </p>
          </section>
          {session.kind === 'authenticated' && session.user.id === id ? (
            <p>
              A autodesativação está bloqueada. A tua conta só pode ser gerida por outro
              administrador autorizado.
            </p>
          ) : current.locked && !current.busy ? (
            <p>Consulta o estado atualizado antes de permitir outra ação.</p>
          ) : (
            <StateDecision key={current.data.etag} />
          )}
          <AuditHistory id={id} revision={current.revision} />
        </>
      )}
    </div>
  );
}
