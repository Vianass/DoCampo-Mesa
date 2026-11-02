import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { ProducerSelect, ProducerTextarea } from '../producer/ProducerFields';
import { AdminFeedback } from '../admin-users/AdminFeedback';
import { ManagedPhoto } from '../producer-management/ManagementComponents';
import { useAuth } from '../auth/useAuth';
import { ApiFailure } from '../api/client';
import { orderDate } from '../orders/format';
import { useReviewResource } from '../reviews/useReviewResource';
import { useReviewFocus } from '../reviews/useReviewFocus';
import { ReviewPager } from '../reviews/ReviewComponents';
import { ModerationNav } from './ModerationNav';
import {
  parseContentDetail,
  parseContentHistory,
  parseContents,
  parseReportDetail,
  parseReports,
  contentPath,
  moderationBase,
  reportLabels,
  targetLabels,
  type ContentView,
  type Decision,
  type Evidence,
  type ReportDetail,
} from './contracts';

function moderationError(e: unknown) {
  return e instanceof ApiFailure && e.status === 403
    ? 'A tua conta não tem acesso à moderação.'
    : e instanceof ApiFailure && e.status === 404
      ? 'O conteúdo ou a denúncia não está disponível.'
      : e instanceof ApiFailure && e.status === 412
        ? 'Os dados mudaram. Consulta o estado atualizado antes de decidir.'
        : 'Não foi possível confirmar o resultado. Consulta o estado antes de repetir.';
}
export function EvidenceCard({ evidence, title }: { evidence: Evidence; title: string }) {
  return (
    <section className="admin-application-paper moderation-evidence">
      <p className="eyebrow">{title}</p>
      <h2>{evidence.nome}</h2>
      <p className="moderation-copy">{evidence.descricao || 'Sem descrição.'}</p>
      {evidence.classificacao !== undefined && <p>{evidence.classificacao} / 5 estrelas</p>}
      {!!evidence.imagens.length && (
        <div className="moderation-photos">
          {evidence.imagens.map((photo, i) => (
            <ManagedPhoto key={photo.url + i} photo={photo} />
          ))}
        </div>
      )}
      {!!evidence.ingredientes?.length && <p>Ingredientes: {evidence.ingredientes.join(', ')}</p>}
      {!!evidence.etiquetas?.length && <p>Etiquetas: {evidence.etiquetas.join(', ')}</p>}
      {evidence.modoProducao && <p>Produção: {evidence.modoProducao}</p>}
    </section>
  );
}
function Audit({ events }: { events: Decision[] }) {
  return events.length ? (
    <ol className="admin-account-audit">
      {events.map((e) => (
        <li key={e.versao}>
          <h3>
            {e.estado === 'oculta'
              ? 'Ocultação'
              : e.estado === 'visivel'
                ? 'Restauro'
                : reportLabels[e.estado as keyof typeof reportLabels]}
          </h3>
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
  ) : (
    <p>Sem decisões registadas.</p>
  );
}
function DecisionForm({
  data,
  report,
  done,
}: {
  data: ContentView | ReportDetail;
  report: boolean;
  done: () => void;
}) {
  const { request, session } = useAuth(),
    [reason, setReason] = useState(''),
    [state, setState] = useState('resolvida'),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [error, setError] = useState('');
  const controller = useRef<AbortController | undefined>(undefined),
    writing = useRef(false),
    feedback = useRef<HTMLDivElement>(null);
  const content = data as ContentView,
    next = report ? state : content.estadoModeracao === 'visivel' ? 'oculta' : 'visivel',
    label = report
      ? 'Concluir análise'
      : next === 'oculta'
        ? 'Ocultar conteúdo'
        : 'Restaurar conteúdo';
  const ready = session.kind === 'authenticated' && session.status === 'ready';
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  return (
    <section className="admin-decision-panel">
      <h2>{report ? 'Decidir sobre a denúncia.' : 'Visibilidade do conteúdo.'}</h2>
      <p>
        {report
          ? 'Concluir a análise não altera a visibilidade. Se for necessário ocultar ou restaurar, usa primeiro a gestão do conteúdo e volta a atualizar esta denúncia.'
          : 'A decisão preserva os dados originais, o estado comercial e as obrigações existentes. Restaurar não publica rascunhos nem reativa contas.'}
      </p>
      {error && (
        <div ref={feedback} tabIndex={-1} role="group" aria-label="Recuperar decisão">
          <p role="alert">{error}</p>
          <Button onClick={done}>Consultar estado atualizado</Button>
        </div>
      )}
      <form
        aria-label={report ? 'Decidir denúncia' : 'Moderar conteúdo'}
        onSubmit={(e) => {
          e.preventDefault();
          if (!writing.current && !locked && ready) setOpen(true);
        }}
      >
        <fieldset disabled={!ready || busy || locked}>
          <legend className="visually-hidden">Decisão administrativa</legend>
          {report && (
            <ProducerSelect
              label="Resultado da análise"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="resolvida">Resolvida</option>
              <option value="rejeitada">Rejeitada</option>
            </ProducerSelect>
          )}
          <ProducerTextarea
            label="Motivo da decisão"
            name="motivoDecisao"
            required
            maxLength={2000}
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            hint="Obrigatório. Até 2000 caracteres. Visível apenas à administração."
          />
          <Button type="submit" variant="secondary">
            {label}
          </Button>
        </fieldset>
      </form>
      {open && !locked && ready && (
        <ConfirmationDialog
          open
          busy={busy}
          title={label + '?'}
          description={
            report
              ? 'A denúncia ficará concluída. O conteúdo mantém a sua visibilidade atual.'
              : 'A decisão será persistida com motivo e responsável. As consultas públicas seguintes respeitarão o novo estado.'
          }
          confirmLabel="Confirmar decisão"
          onClose={() => setOpen(false)}
          onConfirm={() => {
            if (writing.current) return;
            writing.current = true;
            setBusy(true);
            setError('');
            const c = new AbortController();
            controller.current = c;
            const path = report
              ? '/admin/content-reports/' + data.id + '/decision'
              : '/admin/content/' + content.tipo + '/' + content.id + '/moderation';
            const operation = report
              ? request(
                  path,
                  parseReportDetail,
                  { method: 'PATCH', body: { estado: next, motivo: reason }, ifMatch: data.etag },
                  c.signal,
                )
              : request(
                  path,
                  parseContentDetail,
                  { method: 'PATCH', body: { estado: next, motivo: reason }, ifMatch: data.etag },
                  c.signal,
                );
            void operation
              .then(() => {
                if (!c.signal.aborted) done();
              })
              .catch((e) => {
                if (!c.signal.aborted) {
                  setLocked(true);
                  setOpen(false);
                  setError(moderationError(e));
                }
              })
              .finally(() => {
                if (!c.signal.aborted) {
                  writing.current = false;
                  setBusy(false);
                }
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
function ContentHistory({ kind, id, revision }: { kind: string; id: string; revision: number }) {
  const [page, setPage] = useState(1),
    r = useReviewResource(
      `/admin/content/${kind}/${id}/history?pagina=${page}&porPagina=12&ordem=recentes`,
      parseContentHistory,
      revision,
      moderationError,
    ),
    { title, requestFocus } = useReviewFocus(r.data);
  return (
    <section className="admin-application-paper">
      <h2 ref={title} tabIndex={-1}>
        Histórico de visibilidade.
      </h2>
      {r.loading && <LoadingSkeleton label="A consultar decisões" count={1} />}
      {r.error && <AdminFeedback message={r.error} forbidden={r.forbidden} retry={r.retry} />}
      {r.data && (
        <>
          <Audit events={r.data.itens} />
          <ReviewPager
            page={page}
            pages={r.data.totalPaginas}
            label="Paginação das decisões de visibilidade"
            change={(p) => {
              requestFocus();
              setPage(p);
            }}
          />
        </>
      )}
    </section>
  );
}
function ContentDetail({ kind, id }: { kind: 'produto' | 'produtor'; id: string }) {
  const r = useReviewResource(
      `/admin/content/${kind}/${id}`,
      parseContentDetail,
      0,
      moderationError,
    ),
    { title, requestFocus } = useReviewFocus(r.data),
    [notice, setNotice] = useState('');
  const refresh = () => {
    requestFocus();
    setNotice('A consultar o estado confirmado pelo serviço.');
    r.retry();
  };
  return (
    <>
      <Button variant="text" to={moderationBase + (kind === 'produto' ? '/produtos' : '/perfis')}>
        ← Todos os conteúdos
      </Button>
      <Button variant="secondary" onClick={refresh}>
        Atualizar conteúdo
      </Button>
      {notice && <p role="status">{notice}</p>}
      {r.loading && <LoadingSkeleton label="A consultar conteúdo administrativo" count={2} />}
      {r.error && <AdminFeedback message={r.error} forbidden={r.forbidden} retry={r.retry} />}
      {r.data && (
        <>
          <h2 ref={title} tabIndex={-1}>
            {targetLabels[kind]} ·{' '}
            {r.data.estadoModeracao === 'oculta' ? 'Oculto' : 'Visível segundo a moderação'}
          </h2>
          <p>
            Estado comercial: {r.data.estadoComercial ?? 'Não aplicável'}. A visibilidade pública
            depende também da publicação, aprovação e conta ativa.
          </p>
          <p className="moderation-id">Identificador: {id}</p>
          <EvidenceCard
            evidence={r.data.evidencia}
            title="Conteúdo atual · acesso administrativo"
          />
          <DecisionForm key={r.data.etag} data={r.data} report={false} done={refresh} />
          <ContentHistory kind={kind} id={id} revision={r.data.versao} />
        </>
      )}
    </>
  );
}
function ReportDetailView({ id }: { id: string }) {
  const r = useReviewResource(
      '/admin/content-reports/' + id,
      parseReportDetail,
      0,
      moderationError,
    ),
    { title, requestFocus } = useReviewFocus(r.data);
  const refresh = () => {
    requestFocus();
    r.retry();
  };
  return (
    <>
      <div className="admin-decision-actions">
        <Button variant="text" to={moderationBase + '/denuncias'}>
          ← Todas as denúncias
        </Button>
        <Button variant="secondary" onClick={refresh}>
          Atualizar denúncia
        </Button>
      </div>
      {r.loading && <LoadingSkeleton label="A consultar denúncia" count={2} />}
      {r.error && <AdminFeedback message={r.error} forbidden={r.forbidden} retry={r.retry} />}
      {r.data && (
        <>
          <section className="admin-application-paper">
            <p className="eyebrow">
              {reportLabels[r.data.estado]} · {targetLabels[r.data.alvoTipo]}
            </p>
            <h2 ref={title} tabIndex={-1}>
              Uma sinalização para analisar.
            </h2>
            <p>Recebida em {orderDate(r.data.criadaEm)}</p>
            <blockquote>{r.data.motivo}</blockquote>
            <details>
              <summary>Identificação restrita à administração</summary>
              <dl className="application-data">
                <div>
                  <dt>Denúncia</dt>
                  <dd>{id}</dd>
                </div>
                <div>
                  <dt>Autor</dt>
                  <dd>{r.data.autorId}</dd>
                </div>
                <div>
                  <dt>Conteúdo</dt>
                  <dd>{r.data.alvoId}</dd>
                </div>
              </dl>
            </details>
          </section>
          <EvidenceCard
            evidence={r.data.evidencia}
            title="Conteúdo no momento da denúncia · registo preservado"
          />
          {r.data.conteudo ? (
            <>
              <EvidenceCard
                evidence={r.data.conteudo.evidencia}
                title="Conteúdo atual · consulta administrativa"
              />
              <p>
                Moderação atual:{' '}
                {r.data.conteudo.estadoModeracao === 'oculta' ? 'Oculta' : 'Visível'} · versão{' '}
                {r.data.conteudo.versao}.
              </p>
              <Button variant="secondary" to={contentPath(r.data.alvoTipo, r.data.alvoId)}>
                Consultar e moderar conteúdo
              </Button>
              <p>
                A moderação é uma ação separada. Ao regressar, atualiza a denúncia antes de concluir
                a análise.
              </p>
            </>
          ) : (
            <p>
              O conteúdo atual não está disponível. O registo original da denúncia foi preservado.
            </p>
          )}
          {r.data.estado === 'pendente' ? (
            <DecisionForm key={r.data.etag} data={r.data} report done={refresh} />
          ) : (
            <section className="admin-application-paper">
              <h2>Análise concluída.</h2>
              <p role="status">Esta denúncia já foi decidida. Não pode ser decidida novamente.</p>
              {r.data.conteudoNaDecisao && (
                <p>
                  Conteúdo no momento da decisão:{' '}
                  {r.data.conteudoNaDecisao.disponivel
                    ? `${r.data.conteudoNaDecisao.estado} · versão ${r.data.conteudoNaDecisao.versao}`
                    : 'indisponível'}
                  .
                </p>
              )}
            </section>
          )}
          <section className="admin-application-paper">
            <h2>Histórico da denúncia.</h2>
            <Audit events={r.data.historico} />
          </section>
        </>
      )}
    </>
  );
}
function ContentList({ reports, kind }: { reports: boolean; kind: 'produto' | 'produtor' }) {
  const [params, setParams] = useSearchParams(),
    page = /^[1-9]\d{0,3}$/.test(params.get('pagina') ?? '')
      ? Math.min(1000, Number(params.get('pagina')))
      : 1;
  const q = new URLSearchParams({ pagina: String(page), porPagina: '12', ordem: 'recentes' });
  for (const k of ['estado', 'identificador', ...(reports ? ['alvoTipo'] : ['sinalizados'])])
    if (params.get(k)) q.set(k, params.get(k)!);
  if (!reports) q.set('tipo', kind);
  const search = q.toString(),
    path = reports ? '/admin/content-reports?' : '/admin/content?';
  const r = useReviewResource<ReturnType<typeof parseReports> | ReturnType<typeof parseContents>>(
    path + search,
    reports ? parseReports : parseContents,
    0,
    moderationError,
  );
  const { title, requestFocus } = useReviewFocus(r.data),
    last = r.data ? Math.max(1, Math.min(1000, r.data.totalPaginas)) : page;
  useEffect(() => {
    if (r.data && page > last) {
      const n = new URLSearchParams(params);
      n.set('pagina', String(last));
      setParams(n, { replace: true });
    }
  }, [r.data, page, last, params, setParams]);
  const change = (key: string, value: string) => {
    const n = new URLSearchParams(params);
    n.set('pagina', '1');
    if (value) n.set(key, value);
    else n.delete(key);
    requestFocus();
    setParams(n);
  };
  return (
    <>
      <form
        className="reviews-filters"
        aria-label="Pesquisar conteúdos administrativos"
        key={search}
        onSubmit={(e) => {
          e.preventDefault();
          change(
            'identificador',
            String(new FormData(e.currentTarget).get('identificador') ?? '').trim(),
          );
        }}
      >
        <FormField
          label={reports ? 'Identificador exato da denúncia' : 'Identificador exato do conteúdo'}
          name="identificador"
          pattern="[a-fA-F0-9]{24}"
          maxLength={24}
          defaultValue={params.get('identificador') ?? ''}
        />
        <Button type="submit">Pesquisar</Button>
      </form>
      <div className="admin-application-filters">
        <ProducerSelect
          label={reports ? 'Estado da denúncia' : 'Visibilidade do conteúdo'}
          value={params.get('estado') ?? ''}
          onChange={(e) => change('estado', e.target.value)}
        >
          <option value="">Todos os estados</option>
          {(reports
            ? Object.entries(reportLabels)
            : [
                ['visivel', 'Visível'],
                ['oculta', 'Oculto'],
              ]
          ).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </ProducerSelect>
        {reports ? (
          <ProducerSelect
            label="Tipo de conteúdo"
            value={params.get('alvoTipo') ?? ''}
            onChange={(e) => change('alvoTipo', e.target.value)}
          >
            <option value="">Todos os tipos</option>
            {Object.entries(targetLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </ProducerSelect>
        ) : (
          <ProducerSelect
            label="Sinalizações pendentes"
            value={params.get('sinalizados') ?? ''}
            onChange={(e) => change('sinalizados', e.target.value)}
          >
            <option value="">Todos os conteúdos</option>
            <option value="true">Com denúncias pendentes</option>
            <option value="false">Sem denúncias pendentes</option>
          </ProducerSelect>
        )}
      </div>
      <div className="admin-decision-actions">
        <Button variant="secondary" onClick={r.retry}>
          Atualizar consulta
        </Button>
        <Button variant="text" onClick={() => setParams({})}>
          Limpar filtros
        </Button>
      </div>
      {r.loading && <LoadingSkeleton label="A consultar moderação" count={2} />}
      {r.error && <AdminFeedback message={r.error} forbidden={r.forbidden} retry={r.retry} />}
      {r.data && page <= last && (
        <>
          <h2 ref={title} tabIndex={-1}>
            {r.data.total}{' '}
            {reports
              ? r.data.total === 1
                ? 'denúncia'
                : 'denúncias'
              : r.data.total === 1
                ? 'conteúdo'
                : 'conteúdos'}{' '}
            nesta consulta.
          </h2>
          {!r.data.itens.length ? (
            <EmptyState
              title="Nenhum resultado nesta consulta."
              description="Revê os filtros ou atualiza a consulta."
            />
          ) : (
            <div className="moderation-grid">
              {r.data.itens.map((item) =>
                'alvoTipo' in item ? (
                  <article className="admin-application-paper" key={item.id}>
                    <p className="eyebrow">
                      {targetLabels[item.alvoTipo]} · {reportLabels[item.estado]}
                    </p>
                    <h3>{item.evidencia.nome}</h3>
                    <p className="moderation-copy">{item.motivo}</p>
                    <p>{orderDate(item.criadaEm)}</p>
                    <Button variant="text" to={moderationBase + '/denuncias/' + item.id}>
                      Analisar denúncia <span className="visually-hidden">{item.id}</span>
                    </Button>
                  </article>
                ) : (
                  <article className="admin-application-paper" key={item.id}>
                    <p className="eyebrow">
                      {item.estadoModeracao === 'oculta' ? 'Oculto' : 'Visível segundo a moderação'}
                    </p>
                    <h3>{item.evidencia.nome}</h3>
                    <p>Estado comercial: {item.estadoComercial}</p>
                    <Button variant="text" to={contentPath(kind, item.id)}>
                      Consultar conteúdo <span className="visually-hidden">{item.id}</span>
                    </Button>
                  </article>
                ),
              )}
            </div>
          )}
          <ReviewPager
            page={page}
            pages={r.data.totalPaginas}
            label="Paginação da moderação"
            change={(p) => {
              const n = new URLSearchParams(params);
              n.set('pagina', String(p));
              requestFocus();
              setParams(n);
            }}
          />
        </>
      )}
    </>
  );
}
export default function AdminContentArea() {
  const { pathname } = useLocation(),
    parts = pathname.split('/').filter(Boolean),
    tab = parts[3],
    id = parts[4],
    reports = tab === 'denuncias',
    kind = tab === 'produtos' ? 'produto' : 'produtor';
  return (
    <div className="admin-workspace admin-applications admin-users real-reviews content-moderation">
      <header className="admin-intro">
        <p className="eyebrow">Administração · Confiança e conteúdos</p>
        <h1>
          Um mercado cuidado.
          <br />
          <em>Decisões com contexto.</em>
        </h1>
        <p>
          Analisa sinalizações e gere a visibilidade, preservando os conteúdos originais e o
          histórico de cada decisão.
        </p>
      </header>
      <ModerationNav />
      {parts.length > 5 || (id && !/^[a-fA-F0-9]{24}$/.test(id)) ? (
        <EmptyState title="Este percurso não está disponível." description="Revê o endereço." />
      ) : id ? (
        reports ? (
          <ReportDetailView key={id} id={id.toLowerCase()} />
        ) : (
          <ContentDetail key={kind + id} kind={kind} id={id.toLowerCase()} />
        )
      ) : (
        <ContentList key={tab} reports={reports} kind={kind} />
      )}
    </div>
  );
}
