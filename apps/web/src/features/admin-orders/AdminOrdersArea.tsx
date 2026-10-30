import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { FormField } from '../../components/FormField';
import { StatusBadge } from '../../components/StatusBadge';
import { PriceDisplay } from '../../components/PriceDisplay';
import { ProducerSelect } from '../producer/ProducerFields';
import { OrderDetails } from '../orders/OrderDetails';
import { orderDate } from '../orders/format';
import { stateLabels, orderStates } from '../checkout/contracts';
import { useAdminResource } from '../admin-users/useAdminResource';
import { AdminFeedback } from '../admin-users/AdminFeedback';
import {
  ordersApi,
  ordersPath,
  orderQuery,
  orderSearch,
  parseAdminOrders,
  parseAdminOrder,
  parseAdminHistory,
  paymentStates,
  type Query,
  type Domain,
  type Participant,
} from './contracts';
function Person({ person }: { person: Participant }) {
  return (
    <>
      <span>{person.nomeAtual ?? 'Nome atual indisponível'}</span>
      <small>{person.contaId}</small>
    </>
  );
}
function Pager({
  page,
  pages,
  change,
  label,
}: {
  page: number;
  pages: number;
  change: (p: number) => void;
  label: string;
}) {
  return pages > 1 ? (
    <nav className="admin-application-pagination" aria-label={label}>
      <Button variant="secondary" disabled={page === 1} onClick={() => change(page - 1)}>
        Página anterior
      </Button>
      <span>
        Página {page} de {pages}
      </span>
      <Button
        variant="secondary"
        disabled={page >= pages || page >= 1000}
        onClick={() => change(page + 1)}
      >
        Página seguinte
      </Button>
    </nav>
  ) : null;
}
function OrderList() {
  const [params, setParams] = useSearchParams(),
    q = orderQuery(params),
    search = orderSearch(q),
    title = useRef<HTMLHeadingElement>(null),
    focus = useRef(false);
  const r = useAdminResource(ordersApi + '?' + search, parseAdminOrders),
    last = r.data ? Math.max(1, Math.min(1000, r.data.totalPaginas)) : q.pagina;
  const corrected = q.pagina > last ? orderSearch({ ...q, pagina: last }) : '';
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
  function change(next: Partial<Query>, move = false) {
    focus.current = move;
    setParams(orderSearch({ ...q, pagina: 1, ...next }));
  }
  return (
    <>
      <form
        className="admin-order-filters"
        aria-label="Pesquisar encomendas"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          change(
            Object.fromEntries(
              ['identificador', 'produtor', 'comprador', 'desde', 'ate'].map((k) => [
                k,
                String(form.get(k) ?? '').trim(),
              ]),
            ),
            true,
          );
        }}
        key={search}
      >
        <FormField
          name="identificador"
          label="Identificador exato da encomenda"
          defaultValue={q.identificador}
          pattern="[a-fA-F0-9]{24}"
          maxLength={24}
          hint="Referência completa com 24 caracteres. A pesquisa abrange todas as encomendas."
        />
        <FormField
          name="produtor"
          label="ID da conta do produtor"
          defaultValue={q.produtor}
          pattern="[a-fA-F0-9]{24}"
          maxLength={24}
        />
        <FormField
          name="comprador"
          label="ID da conta do comprador"
          defaultValue={q.comprador}
          pattern="[a-fA-F0-9]{24}"
          maxLength={24}
        />
        <FormField
          name="desde"
          type="date"
          label="Criadas desde (UTC)"
          defaultValue={q.desde}
          min="1970-01-01"
          max="9999-12-30"
        />
        <FormField
          name="ate"
          type="date"
          label="Criadas até (UTC, inclusive)"
          defaultValue={q.ate}
          min={q.desde || '1970-01-01'}
          max="9999-12-30"
        />
        <Button type="submit">Pesquisar encomendas</Button>
      </form>
      <div className="admin-application-filters">
        <ProducerSelect
          label="Estado da encomenda"
          value={q.estado}
          onChange={(e) => change({ estado: e.target.value })}
        >
          <option value="">Todos os estados</option>
          {orderStates.map((s) => (
            <option key={s} value={s}>
              {stateLabels[s]}
            </option>
          ))}
        </ProducerSelect>
        <ProducerSelect
          label="Estado do pagamento"
          value={q.pagamento}
          onChange={(e) => change({ pagamento: e.target.value })}
        >
          <option value="">Todos os pagamentos</option>
          {paymentStates.map((s) => (
            <option key={s} value={s}>
              {stateLabels[s]}
            </option>
          ))}
        </ProducerSelect>
        <ProducerSelect
          label="Encomendas por página"
          value={q.porPagina}
          onChange={(e) => change({ porPagina: Number(e.target.value) as Query['porPagina'] })}
        >
          {[12, 24, 36].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </ProducerSelect>
        <ProducerSelect
          label="Ordenar encomendas"
          value={q.ordem}
          onChange={(e) => change({ ordem: e.target.value as Query['ordem'] })}
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
          Atualizar encomendas
        </Button>
        <Button
          variant="text"
          onClick={() =>
            change(
              {
                estado: '',
                pagamento: '',
                identificador: '',
                produtor: '',
                comprador: '',
                desde: '',
                ate: '',
              },
              true,
            )
          }
        >
          Limpar filtros
        </Button>
      </div>
      {(r.loading || !!corrected) && (
        <LoadingSkeleton label="A consultar encomendas reais" count={3} />
      )}
      {r.error && <AdminFeedback message={r.error} retry={r.retry} forbidden={r.forbidden} />}
      {r.data && !corrected && (
        <>
          <h2 tabIndex={-1} ref={title}>
            A operação do mercado.
          </h2>
          <p role="status">{r.data.total} encomendas nesta consulta.</p>
          <dl className="admin-real-metrics" aria-label="Indicadores das encomendas filtradas">
            {orderStates.map((s) => (
              <div key={s}>
                <dt>{stateLabels[s]}</dt>
                <dd>{r.data!.indicadores.porEstado[s]}</dd>
              </div>
            ))}
          </dl>
          <p className="admin-help">
            Os indicadores abrangem todos os resultados dos filtros, independentemente da página.
            Valores de encomendas não representam receita recebida. Os nomes das contas são atuais;
            preços e produtos conservam o registo da compra.
          </p>
          {r.data.itens.length ? (
            <section className="admin-user-cards" aria-label="Encomendas reais">
              {r.data.itens.map((o) => (
                <article className="admin-application-paper admin-order-card" key={o.id}>
                  <StatusBadge
                    tone={
                      o.estado === 'cancelada'
                        ? 'neutral'
                        : o.estado === 'concluida'
                          ? 'organic'
                          : 'seasonal'
                    }
                  >
                    {stateLabels[o.estado]}
                  </StatusBadge>
                  <h3>
                    Encomenda <span>{o.id}</span>
                  </h3>
                  <time dateTime={o.criadaEm}>{orderDate(o.criadaEm)}</time>
                  <dl>
                    <div>
                      <dt>Comprador</dt>
                      <dd>
                        <Person person={o.comprador} />
                      </dd>
                    </div>
                    <div>
                      <dt>Produtor</dt>
                      <dd>
                        <Person person={o.produtor} />
                      </dd>
                    </div>
                    <div>
                      <dt>Total</dt>
                      <dd>
                        <PriceDisplay amountCents={o.totalCent} />
                      </dd>
                    </div>
                    <div>
                      <dt>Pagamento</dt>
                      <dd>{stateLabels[o.pagamento.estado]}</dd>
                    </div>
                    <div>
                      <dt>Modalidade</dt>
                      <dd>{o.modalidade === 'entrega' ? 'Entrega' : 'Levantamento'}</dd>
                    </div>
                  </dl>
                  <Button variant="text" to={ordersPath + '/' + o.id + '?' + search}>
                    Consultar encomenda <span className="visually-hidden">{o.id}</span> →
                  </Button>
                </article>
              ))}
            </section>
          ) : (
            <EmptyState
              title="Nenhuma encomenda corresponde à consulta."
              description="Revê os filtros ou atualiza a listagem."
            />
          )}
          <Pager
            page={q.pagina}
            pages={r.data.totalPaginas}
            label="Paginação de encomendas"
            change={(p) => change({ pagina: p }, true)}
          />
        </>
      )}
    </>
  );
}
function History({ id }: { id: string }) {
  const [domain, setDomain] = useState<Domain>('operacional'),
    [page, setPage] = useState(1),
    focus = useRef(false),
    title = useRef<HTMLHeadingElement>(null);
  const r = useAdminResource(
    ordersApi +
      '/' +
      id +
      '/history?' +
      new URLSearchParams({
        dominio: domain,
        pagina: String(page),
        porPagina: '12',
        ordem: 'recentes',
      }),
    parseAdminHistory,
  );
  const last = r.data ? Math.max(1, Math.min(1000, r.data.totalPaginas)) : page,
    corrected = page > last;
  if (corrected) setPage(last);
  useEffect(() => {
    if (r.data && !corrected && focus.current) {
      focus.current = false;
      title.current?.focus();
    }
  }, [r.data, corrected]);
  return (
    <section className="admin-application-paper admin-order-history">
      <h2 ref={title} tabIndex={-1}>
        Histórico persistido
      </h2>
      <p>
        Eventos operacionais e de pagamento são apresentados separadamente. Não são reconstruídas
        transições nem responsáveis que não estejam registados.
      </p>
      <ProducerSelect
        label="Tipo de histórico"
        value={domain}
        onChange={(e) => {
          setDomain(e.target.value as Domain);
          setPage(1);
        }}
      >
        <option value="operacional">Estado operacional</option>
        <option value="pagamento">Pagamento</option>
      </ProducerSelect>
      <Button variant="text" disabled={r.loading} onClick={r.retry}>
        Atualizar histórico
      </Button>
      {(r.loading || corrected) && <LoadingSkeleton label="A consultar histórico" count={2} />}
      {r.error && <AdminFeedback message={r.error} retry={r.retry} forbidden={r.forbidden} />}
      {r.data && !corrected && (
        <>
          <p role="status">{r.data.total} eventos neste histórico.</p>
          {r.data.itens.length ? (
            <ol className="live-order-history">
              {r.data.itens.map((e, i) => (
                <li key={i}>
                  <time dateTime={e.ocorridoEm}>{orderDate(e.ocorridoEm)}</time>
                  <strong>
                    {e.de ? stateLabels[e.de] : 'Estado anterior não registado'} →{' '}
                    {e.para ? stateLabels[e.para] : 'Estado seguinte não registado'}
                  </strong>
                  <span>{e.tipo}</span>
                  <span>
                    {e.responsavel
                      ? e.responsavel.tipo === 'sistema'
                        ? 'Responsável: sistema'
                        : `Responsável: ${e.responsavel.papel}`
                      : 'Responsável não registado'}
                  </span>
                  {e.responsavel?.contaId && <small>{e.responsavel.contaId}</small>}
                  {e.justificacao && <p>{e.justificacao}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p>Sem eventos registados neste histórico.</p>
          )}
          <Pager
            page={page}
            pages={r.data.totalPaginas}
            label="Paginação do histórico"
            change={(p) => {
              focus.current = true;
              setPage(p);
            }}
          />
        </>
      )}
    </section>
  );
}
function Detail({ id }: { id: string }) {
  const { search } = useLocation(),
    r = useAdminResource(
      ordersApi + '/' + id,
      parseAdminOrder,
      0,
      'A encomenda não está disponível.',
    );
  return (
    <>
      <Button variant="text" to={ordersPath + search}>
        ← Voltar às encomendas
      </Button>
      <Button variant="secondary" disabled={r.loading} onClick={r.retry}>
        Atualizar detalhe
      </Button>
      {r.loading && <LoadingSkeleton label="A consultar detalhe real" count={3} />}
      {r.error && <AdminFeedback message={r.error} retry={r.retry} forbidden={r.forbidden} />}
      {r.data && (
        <>
          <section
            className="admin-application-paper admin-order-participants"
            aria-label="Participantes da encomenda"
          >
            <h2>Intervenientes</h2>
            <p>Identificação atual das contas, sem substituir os snapshots da compra.</p>
            <dl>
              <div>
                <dt>Comprador</dt>
                <dd>
                  <Person person={r.data.comprador} />
                </dd>
              </div>
              <div>
                <dt>Produtor</dt>
                <dd>
                  <Person person={r.data.produtor} />
                </dd>
              </div>
            </dl>
          </section>
          <OrderDetails order={r.data.order} showProducer={false} />
          <section className="admin-application-paper">
            <h2>{r.data.entrega.modalidade === 'entrega' ? 'Entrega' : 'Levantamento'}</h2>
            <p>{r.data.entrega.local}</p>
            {r.data.entrega.concelhoId && <p>Concelho: {r.data.entrega.concelhoId}</p>}
            <p>
              {orderDate(r.data.entrega.inicioEm, r.data.entrega.fusoHorario)} —{' '}
              {orderDate(r.data.entrega.fimEm, r.data.entrega.fusoHorario)}
            </p>
            <p>Período inicial da compra · {r.data.entrega.fusoHorario}</p>
            <p className="admin-help">
              A consulta conserva o local e o período iniciais. Alterações de agenda e contactos
              privados não são apresentados nesta supervisão.
            </p>
          </section>
          <History id={id} />
        </>
      )}
    </>
  );
}
export default function AdminOrdersArea() {
  const { pathname } = useLocation(),
    parts = pathname.split('/').filter(Boolean),
    id = parts[3];
  return (
    <div className="admin-workspace admin-applications admin-users admin-orders">
      <header className="admin-intro">
        <p className="eyebrow">Administração · Encomendas reais</p>
        <h1>
          O percurso
          <br />
          <em>de cada encomenda.</em>
        </h1>
        <p>
          Uma visão global para acompanhar o mercado. A gestão operacional permanece com o produtor.
        </p>
      </header>
      {parts.length > 4 || (id && !/^[a-fA-F0-9]{24}$/.test(id)) ? (
        <EmptyState
          title="A encomenda não está disponível."
          description="Revê o identificador."
          action={<Button to={ordersPath}>Voltar às encomendas</Button>}
        />
      ) : id ? (
        <Detail key={id} id={id.toLowerCase()} />
      ) : (
        <OrderList />
      )}
    </div>
  );
}
