import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { ProducerSelect, ProducerTextarea } from '../producer/ProducerFields';
import { AdminFeedback } from '../admin-users/AdminFeedback';
import { useAuth } from '../auth/useAuth';
import { orderDate } from '../orders/format';
import {
  adminReviewsPath,
  parseAdminReviews,
  parseAdminReview,
  parseReviewHistory,
  type ReviewState,
} from './contracts';
import { useReviewResource, reviewError } from './useReviewResource';
import { RealReviewCard, ReviewPager } from './ReviewComponents';
import { useReviewFocus } from './useReviewFocus';
function ReviewHistory({ id, revision }: { id: string; revision: number }) {
  const [page, setPage] = useState(1),
    r = useReviewResource(
      `/admin/reviews/${id}/history?pagina=${page}&porPagina=12&ordem=recentes`,
      parseReviewHistory,
      revision,
    ),
    { title, requestFocus } = useReviewFocus(r.data);
  return (
    <section className="admin-application-paper">
      <h2 ref={title} tabIndex={-1}>
        Histórico de moderação.
      </h2>
      {r.loading && <LoadingSkeleton label="A consultar decisões de moderação" count={1} />}{' '}
      {r.error && <AdminFeedback message={r.error} retry={r.retry} forbidden={r.forbidden} />}{' '}
      {r.data && (
        <>
          {!r.data.itens.length ? (
            <p>Sem decisões de moderação registadas.</p>
          ) : (
            <ol className="admin-account-audit">
              {r.data.itens.map((e) => (
                <li key={e.versao}>
                  <h3>{e.estado === 'oculta' ? 'Ocultação' : 'Restauro'}</h3>
                  <p>
                    {orderDate(e.ocorridoEm)} · versão {e.versao}
                  </p>
                  <blockquote>{e.motivo}</blockquote>
                  <details>
                    <summary>Responsável pela decisão</summary>
                    <p>Administrador · {e.administradorId}</p>
                  </details>
                </li>
              ))}
            </ol>
          )}
          <ReviewPager
            page={page}
            pages={r.data.totalPaginas}
            change={(value) => {
              requestFocus();
              setPage(value);
            }}
            label="Paginação das decisões de moderação"
          />
        </>
      )}
    </section>
  );
}
function ModerationDecision({
  data,
  done,
}: {
  data: ReturnType<typeof parseAdminReview>;
  done: () => void;
}) {
  const { request, revalidate } = useAuth(),
    [reason, setReason] = useState(''),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [locked, setLocked] = useState(false),
    c = useRef<AbortController | undefined>(undefined),
    feedback = useRef<HTMLDivElement>(null),
    next: ReviewState = data.estado === 'publicada' ? 'oculta' : 'publicada';
  useEffect(() => () => c.current?.abort(), []);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  return (
    <section className="admin-decision-panel">
      <h2>{next === 'oculta' ? 'Ocultar esta avaliação.' : 'Restaurar esta avaliação.'}</h2>
      <p>
        O conteúdo e a classificação são preservados. A decisão exige motivo e fica associada à tua
        conta.
      </p>
      {error && (
        <div ref={feedback} tabIndex={-1} role="group" aria-label="Recuperar decisão de moderação">
          <p role="alert">{error}</p>
          <Button onClick={done}>Consultar estado atualizado</Button>
          <Button variant="text" onClick={() => void revalidate()}>
            Confirmar acesso administrativo
          </Button>
        </div>
      )}
      <form
        aria-label="Moderar avaliação"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !locked) setOpen(true);
        }}
      >
        <fieldset disabled={busy || locked}>
          <legend className="visually-hidden">Decisão de moderação</legend>
          <ProducerTextarea
            label="Motivo da decisão"
            name="motivo"
            required
            maxLength={2000}
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            hint="Obrigatório. Até 2000 caracteres."
          />
          <Button type="submit" variant={next === 'oculta' ? 'secondary' : 'primary'}>
            {next === 'oculta' ? 'Ocultar avaliação' : 'Restaurar avaliação'}
          </Button>
        </fieldset>
      </form>
      {open && !locked && (
        <ConfirmationDialog
          open
          busy={busy}
          title={next === 'oculta' ? 'Ocultar esta avaliação?' : 'Restaurar esta avaliação?'}
          description="A decisão será registada no serviço e atualizará as consultas públicas seguintes."
          confirmLabel={next === 'oculta' ? 'Confirmar ocultação' : 'Confirmar restauro'}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            if (busy) return;
            setBusy(true);
            setError('');
            const controller = new AbortController();
            c.current = controller;
            void request(
              '/admin/reviews/' + data.id + '/moderation',
              parseAdminReview,
              { method: 'PATCH', body: { estado: next, motivo: reason }, ifMatch: data.etag },
              controller.signal,
            )
              .then(() => {
                if (!controller.signal.aborted) done();
              })
              .catch((e) => {
                if (!controller.signal.aborted) {
                  setLocked(true);
                  setOpen(false);
                  setError(reviewError(e));
                }
              })
              .finally(() => {
                if (!controller.signal.aborted) setBusy(false);
              });
          }}
        >
          <blockquote tabIndex={0} role="region" aria-label="Motivo a confirmar">
            {reason.normalize('NFC').trim()}
          </blockquote>
        </ConfirmationDialog>
      )}
    </section>
  );
}
function AdminDetail({ id }: { id: string }) {
  const r = useReviewResource('/admin/reviews/' + id, parseAdminReview),
    [notice, setNotice] = useState(''),
    { title, requestFocus } = useReviewFocus(r.data);
  return (
    <>
      <div className="admin-decision-actions">
        <Button variant="text" to={adminReviewsPath}>
          ← Todas as avaliações
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            requestFocus();
            r.retry();
          }}
        >
          Atualizar avaliação
        </Button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {r.loading && <LoadingSkeleton label="A consultar avaliação administrativa" count={2} />}{' '}
      {r.error && <AdminFeedback message={r.error} retry={r.retry} forbidden={r.forbidden} />}{' '}
      {r.data && (
        <>
          <section className="admin-application-paper">
            <p className="eyebrow">
              {r.data.estado === 'publicada' ? 'Publicada' : 'Oculta'} · versão {r.data.versao}
            </p>
            <h2 ref={title} tabIndex={-1}>
              {r.data.alvoNome}
            </h2>
            <p>
              {r.data.alvoTipo === 'produto'
                ? 'Avaliação de produto'
                : 'Avaliação direta do produtor'}
            </p>
            <RealReviewCard review={r.data} />
            <dl className="application-data">
              <div>
                <dt>Avaliação</dt>
                <dd>{r.data.id}</dd>
              </div>
              <div>
                <dt>Encomenda</dt>
                <dd>{r.data.encomendaId}</dd>
              </div>
              <div>
                <dt>Perfil do produtor</dt>
                <dd>{r.data.produtorPerfilId}</dd>
              </div>
              <div>
                <dt>Conta produtora</dt>
                <dd>{r.data.produtorContaId}</dd>
              </div>
            </dl>
          </section>
          <ModerationDecision
            key={r.data.etag}
            data={r.data}
            done={() => {
              requestFocus();
              setNotice(
                'Consulta atualizada solicitada. Só o estado devolvido pelo serviço confirma a decisão.',
              );
              r.retry();
            }}
          />
          <ReviewHistory id={id} revision={r.data.versao} />
        </>
      )}
    </>
  );
}
function AdminList() {
  const [params, setParams] = useSearchParams(),
    page = /^[1-9]\d{0,3}$/.test(params.get('pagina') ?? '')
      ? Math.min(1000, Number(params.get('pagina')))
      : 1,
    q = new URLSearchParams({ pagina: String(page), porPagina: '12', ordem: 'recentes' });
  for (const k of ['estado', 'classificacao', 'produto', 'produtor', 'identificador', 'alvoTipo'])
    if (params.get(k)) q.set(k, params.get(k)!);
  const search = q.toString(),
    r = useReviewResource('/admin/reviews?' + search, parseAdminReviews),
    { title, requestFocus } = useReviewFocus(r.data),
    last = r.data ? Math.max(1, Math.min(1000, r.data.totalPaginas)) : page;
  useEffect(() => {
    if (page > last) {
      const next = new URLSearchParams(search);
      next.set('pagina', String(last));
      requestFocus();
      setParams(next, { replace: true });
    }
  }, [page, last, search, setParams, requestFocus]);
  function change(key: string, value: string) {
    const next = new URLSearchParams(search);
    next.set('pagina', '1');
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  return (
    <>
      <form
        className="reviews-filters"
        aria-label="Pesquisar avaliações"
        key={search}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            next = new URLSearchParams(search);
          next.set('pagina', '1');
          for (const k of ['identificador', 'produto', 'produtor']) {
            const value = String(f.get(k) ?? '').trim();
            if (value) next.set(k, value);
            else next.delete(k);
          }
          requestFocus();
          setParams(next);
        }}
      >
        <FormField
          label="Identificador exato da avaliação"
          name="identificador"
          pattern="[a-fA-F0-9]{24}"
          maxLength={24}
          defaultValue={params.get('identificador') ?? ''}
        />
        <FormField
          label="ID do produto"
          name="produto"
          pattern="[a-fA-F0-9]{24}"
          maxLength={24}
          defaultValue={params.get('produto') ?? ''}
        />
        <FormField
          label="ID do perfil do produtor"
          name="produtor"
          pattern="[a-fA-F0-9]{24}"
          maxLength={24}
          defaultValue={params.get('produtor') ?? ''}
        />
        <Button type="submit">Pesquisar avaliações</Button>
      </form>
      <div className="admin-application-filters">
        <ProducerSelect
          label="Estado da avaliação"
          value={params.get('estado') ?? ''}
          onChange={(e) => change('estado', e.target.value)}
        >
          <option value="">Todos os estados</option>
          <option value="publicada">Publicada</option>
          <option value="oculta">Oculta</option>
        </ProducerSelect>
        <ProducerSelect
          label="Classificação da avaliação"
          value={params.get('classificacao') ?? ''}
          onChange={(e) => change('classificacao', e.target.value)}
        >
          <option value="">Todas as classificações</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} / 5
            </option>
          ))}
        </ProducerSelect>
        <ProducerSelect
          label="Alvo da avaliação"
          value={params.get('alvoTipo') ?? ''}
          onChange={(e) => change('alvoTipo', e.target.value)}
        >
          <option value="">Todos os alvos</option>
          <option value="produto">Produto</option>
          <option value="produtor">Produtor</option>
        </ProducerSelect>
      </div>
      <div className="admin-decision-actions">
        <Button variant="secondary" onClick={r.retry}>
          Atualizar avaliações
        </Button>
        <Button variant="text" onClick={() => setParams({})}>
          Limpar filtros
        </Button>
      </div>
      {r.loading && <LoadingSkeleton label="A consultar avaliações reais" count={2} />}{' '}
      {r.error && <AdminFeedback message={r.error} retry={r.retry} forbidden={r.forbidden} />}{' '}
      {r.data && page <= last && (
        <>
          <h2 ref={title} tabIndex={-1}>
            {r.data.total} {r.data.total === 1 ? 'avaliação' : 'avaliações'} nesta consulta.
          </h2>
          {r.data.itens.length ? (
            <div className="review-grid">
              {r.data.itens.map((item) => (
                <article key={item.id}>
                  <RealReviewCard review={item} />
                  <p>
                    {item.estado === 'publicada' ? 'Publicada' : 'Oculta'} · {item.alvoNome}
                  </p>
                  <Button variant="text" to={adminReviewsPath + '/' + item.id}>
                    Analisar avaliação <span className="visually-hidden">{item.id}</span>
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nenhuma avaliação corresponde à consulta."
              description="Revê os filtros ou atualiza a consulta."
            />
          )}
          <ReviewPager
            page={page}
            pages={r.data.totalPaginas}
            change={(n) => {
              const next = new URLSearchParams(search);
              next.set('pagina', String(n));
              requestFocus();
              setParams(next);
            }}
            label="Paginação administrativa de avaliações"
          />
        </>
      )}
    </>
  );
}
export default function AdminReviewsArea() {
  const { pathname } = useLocation(),
    parts = pathname.split('/').filter(Boolean),
    id = parts[3];
  return (
    <div className="admin-workspace admin-applications admin-users real-reviews admin-reviews">
      <header className="admin-intro">
        <p className="eyebrow">Administração · Avaliações verificadas</p>
        <h1>
          Preservar a confiança
          <br />
          <em>à nossa mesa.</em>
        </h1>
        <p>
          Consulta experiências reais e decide sobre a sua publicação, preservando as palavras e o
          histórico.
        </p>
      </header>
      {parts.length > 4 || (id && !/^[a-fA-F0-9]{24}$/.test(id)) ? (
        <EmptyState title="A avaliação não está disponível." description="Revê o endereço." />
      ) : id ? (
        <AdminDetail key={id} id={id.toLowerCase()} />
      ) : (
        <AdminList />
      )}
    </div>
  );
}
