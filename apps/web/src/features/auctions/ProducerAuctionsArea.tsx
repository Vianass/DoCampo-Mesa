import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../auth/useAuth';
import { useRemote } from '../api/useRemote';
import { ApiFailure } from '../api/client';
import { objectId, parsePage } from '../api/catalog-contract';
import { AuctionListing } from './AuctionsPage';
import { AuctionRoom } from './AuctionDetailPage';
import {
  parseAuctionDetail,
  parseOwnProduct,
  type AuctionDetail,
  type AuctionWrite,
  type OwnProduct,
} from './contracts';
import { euros, serverTime, sampleClock } from './model';
import { validateAuctionForm } from './form-model';
import {
  accountFingerprint,
  attemptStore,
  isCreationAttempt,
  type CreationAttempt,
} from './attempts';

function formDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}
function AuctionForm({ initial }: { initial?: AuctionDetail }) {
  const auth = useAuth(),
    navigate = useNavigate(),
    userId = auth.session.kind === 'authenticated' ? auth.session.user.id : '';
  const [values, setValues] = useState({
    title: initial?.titulo ?? '',
    description: initial?.descricao ?? '',
    base: initial ? euros(initial.precoBaseCent) : '',
    increment: initial ? euros(initial.incrementoCent) : '1,00',
    start: initial ? formDate(initial.iniciaEm) : '',
    end: initial ? formDate(initial.terminaEm) : '',
    quantity: initial ? String(initial.lote.quantidade) : '',
  });
  const [product, setProduct] = useState<OwnProduct>(),
    [productPage, setProductPage] = useState(1),
    [search, setSearch] = useState(''),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [needsRefresh, setNeedsRefresh] = useState(false),
    [attempt, setAttempt] = useState<CreationAttempt>();
  const pending = useRef(false),
    summary = useRef<HTMLDivElement>(null),
    store = useRef<ReturnType<typeof attemptStore<CreationAttempt>> | undefined>(undefined);
  const [loaded, setLoaded] = useState(!!initial);
  const products = useRemote(
    initial ? 'edit:no-products' : userId + ':select-products:' + productPage + ':' + search,
    (signal) =>
      initial
        ? Promise.resolve(undefined)
        : auth.request(
            '/me/products?estado=publicado&porPagina=12&pagina=' +
              productPage +
              (search ? '&pesquisa=' + encodeURIComponent(search) : ''),
            (v) => parsePage(v, parseOwnProduct),
            {},
            signal,
          ),
    300,
  );
  useEffect(() => {
    if (initial) return;
    let active = true;
    void accountFingerprint(userId)
      .then((hash) => {
        if (!active) return;
        const s = attemptStore<CreationAttempt>(hash, 'creation');
        store.current = s;
        const a = s.read();
        if (isCreationAttempt(a)) setAttempt(a);
        setLoaded(true);
      })
      .catch(() =>
        setNotice('Não foi possível preparar uma tentativa segura. Volta a abrir esta página.'),
      );
    return () => {
      active = false;
    };
  }, [userId, initial]);
  const [clock] = useState(() => (initial ? sampleClock(initial.serverNow) : undefined)),
    [now, setNow] = useState(() => (clock ? serverTime(clock) : 0));
  useEffect(() => {
    if (!clock) return;
    const t = setInterval(() => setNow(serverTime(clock)), 1000);
    return () => clearInterval(t);
  }, [clock]);
  const editable =
    !initial ||
    (initial.estado === 'agendado' &&
      initial.sequencia === 0 &&
      now < Date.parse(initial.iniciaEm));
  function field(name: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
  }
  async function submit(recover = false) {
    if (pending.current || !loaded || !editable || needsRefresh) return;
    const validation = validateAuctionForm(values, product, !!initial);
    if (!recover && Object.keys(validation.errors).length) {
      setErrors(validation.errors);
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    const write: AuctionWrite =
      recover && attempt
        ? attempt.body
        : {
            titulo: values.title.trim(),
            descricao: values.description.trim(),
            precoBaseCent: validation.base!,
            incrementoCent: validation.increment!,
            ...(values.start ? { iniciaEm: new Date(values.start).toISOString() } : {}),
            terminaEm: new Date(values.end).toISOString(),
          };
    let creation = attempt;
    if (!initial && !creation) {
      creation = {
        requestId: crypto.randomUUID(),
        body: { ...write, produtoId: product!.id, quantidade: Number(values.quantity) },
      };
      if (!store.current?.save(creation)) {
        setNotice('Não foi possível preservar a tentativa. O leilão não foi enviado.');
        return;
      }
      setAttempt(creation);
    }
    pending.current = true;
    setBusy(true);
    setErrors({});
    setNotice('');
    try {
      const result = await auth.request(
        initial ? '/auctions/' + initial.id : '/auctions',
        parseAuctionDetail,
        initial
          ? { method: 'PUT', body: write, ifMatch: initial.etag }
          : {
              method: 'POST',
              body: creation!.body,
              idempotencyKey: creation!.requestId,
              expectedStatus: [200, 201],
            },
      );
      if (creation) store.current?.clear(creation.requestId);
      setAttempt(undefined);
      navigate('/area/produtor/leiloes/' + result.id, { replace: true, state: { saved: true } });
    } catch (error) {
      if (initial) setNeedsRefresh(true);
      const known =
        error instanceof ApiFailure &&
        error.kind === 'http' &&
        !!error.status &&
        error.status < 500;
      if (!initial && known && creation) {
        store.current?.clear(creation.requestId);
        setAttempt(undefined);
      }
      setNotice(
        error instanceof ApiFailure && [409, 412, 428].includes(error.status ?? 0)
          ? 'O leilão ou o stock mudou. Atualiza a consulta e revê os dados antes de continuar.'
          : error instanceof ApiFailure && error.status === 403
            ? 'A tua produção não está autorizada para esta operação. A criação de leilões exige aprovação.'
            : initial
              ? 'Não foi possível confirmar a edição. Volta ao leilão e atualiza a consulta antes de repetir.'
              : known
                ? 'O serviço não aceitou a criação. Revê os campos, as datas e o stock.'
                : 'Ainda não foi possível confirmar a criação. Recupera esta tentativa antes de criar outro lote.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="auction-management">
      <header className="auction-room-intro">
        <p className="eyebrow">A tua produção · Um novo encontro</p>
        <h1>{initial ? 'Afinar o próximo lote.' : 'Da tua colheita, um novo leilão.'}</h1>
        <p>
          {initial
            ? 'Atualiza todos os campos editáveis antes do início. O produto e a quantidade reservada permanecem os mesmos.'
            : 'Escolhe um produto da tua produção. O stock do lote será reservado quando o serviço confirmar a criação.'}
        </p>
      </header>
      {!editable && (
        <p role="alert" className="auction-notice">
          Este leilão já não pode ser editado. A edição só é permitida antes do início e sem
          ofertas.
        </p>
      )}
      {attempt && !initial && (
        <div className="auction-notice">
          <h2>Ficou um lote por confirmar.</h2>
          <p>
            A tentativa original está preservada nesta sessão. Não alteres os campos nem cries
            outra: recupera primeiro o resultado.
          </p>
          <Button disabled={busy} onClick={() => void submit(true)}>
            {busy ? 'A recuperar…' : 'Recuperar criação do leilão'}
          </Button>
        </div>
      )}
      <form
        className="auction-producer-form"
        aria-label={initial ? 'Editar leilão' : 'Criar leilão'}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div ref={summary} tabIndex={-1}>
          {Object.keys(errors).length > 0 && (
            <div role="alert" className="auction-notice">
              <h2>Há dados a rever.</h2>
              <ul>
                {Object.entries(errors).map(([name, e]) => (
                  <li key={name} id={'auction-error-' + name}>
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <fieldset disabled={busy || !!attempt || !editable || !loaded || needsRefresh}>
          <legend>{initial ? 'O lote reservado' : '01 · O que vais levar ao mercado'}</legend>
          {!initial && (
            <>
              <div className="form-field">
                <label htmlFor="auction-product-search">
                  Pesquisar os teus produtos publicados
                </label>
                <input
                  id="auction-product-search"
                  className="form-control"
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setProductPage(1);
                  }}
                />
              </div>
              {products.loading && (
                <LoadingSkeleton label="A carregar os produtos da tua produção" count={1} />
              )}
              {products.error && (
                <p role="alert">
                  Não foi possível carregar os produtos.{' '}
                  <button type="button" onClick={products.retry}>
                    Tentar novamente
                  </button>
                </p>
              )}
              <div className="form-field">
                <label htmlFor="auction-product">Produto da tua produção</label>
                <select
                  id="auction-product"
                  className="form-select"
                  value={product?.id ?? ''}
                  onChange={(e) => {
                    const p = products.data?.itens.find((p) => p.id === e.target.value);
                    setProduct(p);
                    if (p) field('quantity', String(p.unidadeVenda.quantidadeMinima));
                  }}
                  aria-invalid={!!errors.product}
                  aria-describedby={
                    'auction-product-help' + (errors.product ? ' auction-error-product' : '')
                  }
                >
                  <option value="">Selecionar produto</option>
                  {product && !products.data?.itens.some((p) => p.id === product.id) && (
                    <option value={product.id}>{product.nome}</option>
                  )}
                  {products.data?.itens.map((p) => (
                    <option
                      value={p.id}
                      key={p.id}
                      disabled={p.stockDisponivel < p.unidadeVenda.quantidadeMinima}
                    >
                      {p.nome} · {p.stockDisponivel} {p.unidadeVenda.unidadeBase}
                    </option>
                  ))}
                </select>
                <small id="auction-product-help">
                  Apenas produtos publicados da tua conta. A elegibilidade e o stock são confirmados
                  pelo serviço.
                </small>
              </div>
              {products.data && products.data.totalPaginas > 1 && (
                <div className="auction-pagination">
                  <Button
                    variant="text"
                    disabled={productPage <= 1}
                    onClick={() => setProductPage((p) => p - 1)}
                  >
                    Produtos anteriores
                  </Button>
                  <span>
                    {productPage}/{products.data.totalPaginas}
                  </span>
                  <Button
                    variant="text"
                    disabled={productPage >= products.data.totalPaginas}
                    onClick={() => setProductPage((p) => p + 1)}
                  >
                    Mais produtos
                  </Button>
                </div>
              )}
              <div className="form-field">
                <label htmlFor="auction-quantity">
                  Quantidade do lote
                  {product
                    ? ' (' +
                      (product.unidadeVenda.modalidade === 'embalagem'
                        ? 'embalagens'
                        : product.unidadeVenda.unidadeBase) +
                      ')'
                    : ''}
                </label>
                <input
                  id="auction-quantity"
                  aria-invalid={!!errors.quantity}
                  aria-describedby={errors.quantity ? 'auction-error-quantity' : undefined}
                  className="form-control"
                  inputMode="numeric"
                  value={values.quantity}
                  onChange={(e) => field('quantity', e.target.value)}
                />
                {product && (
                  <small>
                    Mínimo {product.unidadeVenda.quantidadeMinima}; incremento{' '}
                    {product.unidadeVenda.incrementoCompra}; stock disponível{' '}
                    {product.stockDisponivel}.
                  </small>
                )}
              </div>
            </>
          )}
          {initial && (
            <p className="auction-notice">
              {initial.lote.nome} · {initial.lote.quantidade}{' '}
              {initial.lote.unidadeVenda.unidadeBase}. Para trocar o produto ou quantidade, cancela
              quando permitido e cria outro lote.
            </p>
          )}
          <div className="form-field">
            <label htmlFor="auction-title">Título do leilão</label>
            <input
              id="auction-title"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'auction-error-title' : undefined}
              className="form-control"
              maxLength={180}
              value={values.title}
              onChange={(e) => field('title', e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="auction-description">Descrição do lote</label>
            <textarea
              id="auction-description"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'auction-error-description' : undefined}
              className="form-control"
              rows={4}
              maxLength={5000}
              value={values.description}
              onChange={(e) => field('description', e.target.value)}
            />
          </div>
          <h2>02 · O valor e o momento</h2>
          <div className="auction-form-grid">
            <div className="form-field">
              <label htmlFor="auction-base">Preço inicial do lote (€)</label>
              <input
                id="auction-base"
                aria-invalid={!!errors.base}
                aria-describedby={errors.base ? 'auction-error-base' : undefined}
                className="form-control"
                inputMode="decimal"
                value={values.base}
                onChange={(e) => field('base', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="auction-increment">Incremento mínimo (€)</label>
              <input
                id="auction-increment"
                aria-invalid={!!errors.increment}
                aria-describedby={errors.increment ? 'auction-error-increment' : undefined}
                className="form-control"
                inputMode="decimal"
                value={values.increment}
                onChange={(e) => field('increment', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="auction-start">Início (opcional)</label>
              <input
                id="auction-start"
                aria-invalid={!!errors.start}
                aria-describedby={errors.start ? 'auction-error-start' : undefined}
                type="datetime-local"
                step="1"
                className="form-control"
                value={values.start}
                onChange={(e) => field('start', e.target.value)}
              />
              <small>Deixa vazio para início imediato. Usa o fuso horário do teu navegador.</small>
            </div>
            <div className="form-field">
              <label htmlFor="auction-end">Fim do leilão</label>
              <input
                id="auction-end"
                aria-invalid={!!errors.end}
                aria-describedby={errors.end ? 'auction-error-end' : undefined}
                type="datetime-local"
                step="1"
                className="form-control"
                value={values.end}
                onChange={(e) => field('end', e.target.value)}
              />
            </div>
          </div>
          <p className="auction-help">
            Preços pelo lote completo, sem pagamento online. Prazo fixo, sem extensões automáticas.
            Datas e permissões são validadas pelo serviço.
          </p>
          <Button type="submit">
            {busy
              ? 'A confirmar…'
              : initial
                ? 'Guardar alterações'
                : 'Criar leilão e reservar stock'}
          </Button>
        </fieldset>
      </form>
      {notice && (
        <p role="alert" className="auction-notice">
          {notice}
        </p>
      )}
      <Button
        to={initial ? '/area/produtor/leiloes/' + initial.id : '/area/produtor/leiloes'}
        variant="text"
      >
        Voltar aos teus leilões
      </Button>
    </section>
  );
}
function OwnAuction({ id, edit }: { id: string; edit: boolean }) {
  const auth = useAuth(),
    userId = auth.session.kind === 'authenticated' ? auth.session.user.id : '';
  const resource = useRemote(userId + ':own-auction:' + id, (signal) =>
    auth.request('/auctions/' + id, parseAuctionDetail, {}, signal),
  );
  const [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false);
  async function cancel() {
    if (!resource.data || pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice('');
    try {
      await auth.request('/auctions/' + id + '/cancel', parseAuctionDetail, {
        method: 'POST',
        body: {},
        ifMatch: resource.data.etag,
      });
      dialog.current?.close();
      setNotice('O leilão foi cancelado. O serviço registou a libertação da reserva.');
      resource.retry();
    } catch (error) {
      dialog.current?.close();
      setNotice(
        error instanceof ApiFailure && [409, 412].includes(error.status ?? 0)
          ? 'O leilão mudou ou já não pode ser cancelado. Atualiza antes de continuar.'
          : 'Não foi possível confirmar o cancelamento. Atualiza o leilão antes de repetir.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (resource.loading) return <LoadingSkeleton label="A carregar o teu leilão" count={2} />;
  if (resource.error || !resource.data)
    return (
      <div className="auction-notice" role="alert">
        <h1>Não foi possível consultar este leilão.</h1>
        <Button onClick={resource.retry}>Tentar novamente</Button>
      </div>
    );
  const detail = resource.data;
  if (!detail.reserva)
    return (
      <EmptyState
        title="Este lote não pertence à tua produção."
        description="Só podes gerir os teus leilões."
        action={<Button to="/area/produtor/leiloes">Voltar aos teus leilões</Button>}
      />
    );
  if (edit) return <AuctionForm key={detail.id + ':' + detail.versao} initial={detail} />;
  const reserve = detail.reserva;
  return (
    <>
      <AuctionRoom
        detail={detail}
        onRefresh={resource.retry}
        ownerControls={(state) => (
          <div className="auction-owner-actions">
            <h2>O teu lote, com controlo.</h2>
            {state.versao === detail.versao &&
              state.estado === 'agendado' &&
              state.sequencia === 0 && (
                <Button to={'/area/produtor/leiloes/' + id + '/editar'} variant="secondary">
                  Editar leilão
                </Button>
              )}
            {state.versao === detail.versao &&
              ['agendado', 'ativo'].includes(state.estado) &&
              state.sequencia === 0 && (
                <Button variant="text" disabled={busy} onClick={() => dialog.current?.showModal()}>
                  Cancelar leilão
                </Button>
              )}
            <p>
              Reserva na última consulta:{' '}
              {reserve.estado === 'afeta_vencedor'
                ? 'lote afeto ao vencedor'
                : reserve.estado === 'libertada'
                  ? 'stock libertado'
                  : reserve.estado === 'libertacao_pendente'
                    ? 'libertação pendente'
                    : 'stock reservado'}
              .
            </p>
            <p>O valor vencedor não representa receita recebida.</p>
            <Link to="/area/produtor/leiloes">Todos os teus leilões →</Link>
          </div>
        )}
      />
      {notice && (
        <p className="auction-notice" role="status">
          {notice}
        </p>
      )}
      <dialog ref={dialog} className="auction-cancel-dialog" aria-labelledby="cancel-auction-title">
        <h2 id="cancel-auction-title">Cancelar este encontro?</h2>
        <p>
          O lote deixará de aceitar ofertas. A reserva será libertada pelo serviço; uma reposição
          incompatível fica pendente e registada.
        </p>
        <div className="auction-dialog-actions">
          <Button disabled={busy} onClick={() => void cancel()}>
            {busy ? 'A confirmar…' : 'Confirmar cancelamento'}
          </Button>
          <Button disabled={busy} variant="secondary" onClick={() => dialog.current?.close()}>
            Manter leilão
          </Button>
        </div>
      </dialog>
    </>
  );
}
export default function ProducerAuctionsArea() {
  const location = useLocation(),
    parts = location.pathname.split('/').filter(Boolean),
    id = parts[3];
  if (id === 'novo') return <AuctionForm />;
  if (id) {
    if (!objectId(id))
      return (
        <EmptyState
          title="Este leilão não está disponível."
          description="Revê o endereço ou volta à tua listagem."
        />
      );
    return <OwnAuction id={id} edit={parts[4] === 'editar'} />;
  }
  return (
    <div className="auction-management">
      <header className="auction-room-intro">
        <p className="eyebrow">A tua produção · Leilões</p>
        <h1>Cada lote, um novo encontro.</h1>
        <p>
          Prepara a próxima colheita e acompanha ofertas confirmadas. Valores vencedores não são
          pagamentos recebidos.
        </p>
        <Button to="/area/produtor/leiloes/novo">
          Criar um leilão <span aria-hidden="true">↗</span>
        </Button>
      </header>
      <AuctionListing own />
    </div>
  );
}
