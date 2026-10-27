import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { PriceDisplay } from '../components/PriceDisplay';
import { useAuth } from '../features/auth/useAuth';
import { demonstrationSite } from '../features/auth/demo-mode';
import { useCart } from '../features/cart/useCart';
import { ApiFailure } from '../features/api/client';
import { ProducerCheckoutFields } from '../features/checkout/ProducerCheckoutFields';
import {
  parsePreparation,
  parseReceipt,
  parseCheckpoint,
  parseRecoveredAttempt,
  parseOrderDetail,
  type Preparation,
  type Receipt,
  type OwnOrder,
  type RecoveredAttempt,
  type ProducerChoice,
} from '../features/checkout/contracts';
import {
  cartKey,
  checkoutBody,
  declaredWindows,
  readPending,
  savePending,
  clearPending,
  estimatedCheckoutTotal,
  type PendingPurchase,
} from '../features/checkout/model';
import { OrderDetails } from '../features/orders/OrderDetails';
type Phase = 'idle' | 'submitting' | 'uncertain' | 'reconfirm';
export default function CheckoutPage() {
  const { session } = useAuth();
  return <CheckoutSession key={session.kind === 'authenticated' ? session.user.id : 'visitor'} />;
}
function CheckoutSession() {
  const auth = useAuth(),
    cart = useCart(),
    navigate = useNavigate(),
    location = useLocation();
  const userId = auth.session.kind === 'authenticated' ? auth.session.user.id : '';
  const allowed =
    !demonstrationSite &&
    auth.session.kind === 'authenticated' &&
    auth.session.user.papeis.includes('comprador');
  const ready = allowed && auth.session.kind === 'authenticated' && auth.session.status === 'ready';
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(readPending),
    [refresh, setRefresh] = useState(0),
    [ack, setAck] = useState(false);
  const [preparation, setPreparation] = useState<{
    key: string;
    data?: Preparation;
    error?: string;
  }>({ key: '' });
  const [operation, setOperation] = useState<{ owner: string; phase: Phase; message?: string }>({
    owner: '',
    phase: 'idle',
  });
  const [confirmation, setConfirmation] = useState<{
    owner: string;
    receipt: Receipt;
    orders?: OwnOrder[];
    error?: string;
  }>();
  const requestRef = useRef<AbortController | null>(null),
    busy = useRef(false);
  const signature = cartKey(cart.cart.items);
  const preparationKey = JSON.stringify([userId, signature, refresh]);
  const current = preparation.key === preparationKey ? preparation : undefined;
  const phase = operation.owner === userId ? operation.phase : 'idle';
  const message = operation.owner === userId ? operation.message : undefined;
  const confirmed = confirmation?.owner === userId ? confirmation : undefined;
  const onlyReal = cart.cart.items.every((i) => i.productSnapshot?.source === 'api');
  useEffect(
    () => () => {
      requestRef.current?.abort();
      busy.current = false;
    },
    [userId],
  );
  useEffect(() => {
    if (location.pathname === '/checkout' && pending?.confirmed) {
      clearPending(pending.referencia);
      queueMicrotask(() => setPending(undefined));
    }
  }, [location.pathname, pending?.confirmed, pending?.referencia]);
  useEffect(() => {
    if (
      !ready ||
      pending ||
      !onlyReal ||
      !cart.cart.items.length ||
      (preparation.key === preparationKey && preparation.data)
    )
      return;
    const controller = new AbortController();
    const items = cart.cart.items.map((i) => ({ produtoId: i.productId, quantidade: i.quantity }));
    void (async () => {
      try {
        const data = await auth.request(
          '/orders/prepare',
          parsePreparation,
          { method: 'POST', body: { itens: items } },
          controller.signal,
        );
        if (
          data.linhas.length !== items.length ||
          items.some(
            (i) =>
              !data.linhas.some(
                (l) => l.produtoId === i.produtoId && l.quantidade === i.quantidade,
              ),
          )
        )
          throw new ApiFailure('invalid');
        if (!controller.signal.aborted) {
          setPreparation({ key: preparationKey, data });
          setAck(false);
          setDraft({});
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setPreparation({
            key: preparationKey,
            error:
              error instanceof ApiFailure && error.status === 409
                ? 'Um produto, quantidade ou condição comercial mudou. Revê a cesta antes de continuar.'
                : 'Não foi possível preparar a compra. A tua cesta mantém-se guardada.',
          });
      }
    })();
    return () => controller.abort();
    // A assinatura inclui todas as escolhas; o corpo usa exatamente essa versão da cesta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId, preparationKey, pending?.referencia, onlyReal, auth.request]);
  function updatePending(value: PendingPurchase) {
    setPending(value);
    return savePending(value);
  }
  async function details(receipt: Receipt, signal: AbortSignal) {
    try {
      const orders = await Promise.all(
        receipt.encomendas.map((item) =>
          auth.request(
            '/orders/' + item.orderId,
            (v) => {
              const order = parseOrderDetail(v);
              if (
                order.id !== item.orderId ||
                order.operacaoCompraId !== receipt.operacaoCompraId ||
                order.totalCent !== item.totalCent
              )
                throw new ApiFailure('invalid');
              return order;
            },
            {},
            signal,
          ),
        ),
      );
      if (!signal.aborted) setConfirmation({ owner: userId, receipt, orders });
    } catch {
      if (!signal.aborted)
        setConfirmation({
          owner: userId,
          receipt,
          error: 'A compra está confirmada. Ainda não foi possível carregar todos os detalhes.',
        });
    }
  }
  async function purchase(reference: PendingPurchase, signal: AbortSignal) {
    const attempt: RecoveredAttempt = await auth.request(
      '/orders/attempts/' + reference.referencia,
      parseRecoveredAttempt,
      {},
      signal,
    );
    if (attempt.referencia !== reference.referencia) throw new ApiFailure('invalid');
    const latest = readPending();
    if (latest?.referencia !== reference.referencia)
      throw new DOMException('Tentativa abandonada.', 'AbortError');
    const submitted = { ...reference, submitted: true };
    if (!updatePending(submitted)) throw new ApiFailure('configuration');
    const receipt = await auth.request(
      '/orders',
      (value) => {
        const result = parseReceipt(value),
          expected = new Set(attempt.pedido.condicoesPorProdutor.map((p) => p.produtorContaId));
        if (
          result.encomendas.length !== expected.size ||
          result.encomendas.some((o) => !expected.delete(o.produtorContaId)) ||
          expected.size
        )
          throw new ApiFailure('invalid');
        return result;
      },
      {
        method: 'POST',
        body: attempt.pedido,
        idempotencyKey: attempt.chaveIdempotencia,
        expectedStatus: [200, 201],
        timeoutMs: 40000,
      },
      signal,
    );
    if (signal.aborted) return;
    setConfirmation({ owner: userId, receipt });
    if (!reference.cleaned) cart.acknowledgePurchase(reference.baseline);
    updatePending({ ...submitted, confirmed: true, cleaned: true });
    setOperation({ owner: userId, phase: 'idle' });
    navigate('/checkout/confirmacao', { replace: true });
    await details(receipt, signal);
  }
  function report(error: unknown, signal: AbortSignal, reference: string) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
    if (error instanceof ApiFailure && error.status === 403) void auth.revalidate();
    const stored = readPending();
    const unsent = stored?.referencia === reference && !stored.submitted;
    const rejected =
      error instanceof ApiFailure &&
      (error.status === 400 ||
        (error.status === 404 && unsent) ||
        (error.status === 409 &&
          ['RECONFIRMACAO_NECESSARIA', 'CONFLITO_REVISAO'].includes(error.codigo ?? '')));
    setOperation({
      owner: userId,
      phase: rejected ? 'reconfirm' : 'uncertain',
      message:
        error instanceof ApiFailure && (error.status === 410 || error.status === 404)
          ? 'A tentativa não está disponível para esta conta ou o prazo de recuperação terminou. Confirma a conta e consulta as tuas encomendas antes de iniciar outra compra.'
          : rejected
            ? 'As condições precisam de ser revistas. Não foi confirmada uma compra para este pedido.'
            : 'Ainda não foi possível confirmar o resultado. Mantivemos a tentativa original e a cesta; recupera o resultado antes de iniciar outra compra.',
    });
  }
  async function resume() {
    if (!pending || busy.current || !ready) return;
    busy.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    setOperation({ owner: userId, phase: 'submitting' });
    try {
      await purchase(pending, controller.signal);
    } catch (error) {
      report(error, controller.signal, pending.referencia);
    } finally {
      if (requestRef.current === controller) busy.current = false;
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !ready || !current?.data || !ack) return;
    const form = event.currentTarget,
      data = new FormData(form),
      prepared = current.data;
    let choices: ProducerChoice[];
    try {
      choices = prepared.produtores.map((producer) => {
        const prefix = producer.produtorContaId,
          c = producer.comercial;
        const mode = String(data.get(prefix + '.modalidade'));
        if (mode !== 'levantamento' && mode !== 'entrega') throw Error();
        const method = String(data.get(prefix + '.metodoPagamento'));
        if (!c.modalidades[mode] || !c.metodosPagamento.includes(method)) throw Error();
        const windows = declaredWindows(
          String(data.get(prefix + '.data')),
          c.disponibilidade[mode],
          c.disponibilidade.fusoHorario,
        );
        const window = String(data.get(prefix + '.janela'));
        if (!/^\d+$/.test(window) || !windows[Number(window)]) throw Error();
        const base: ProducerChoice = {
          produtorContaId: prefix,
          modalidade: mode,
          periodo: windows[Number(window)]!.periodo,
          metodoPagamento: method,
          taxaEntregaAceiteCent: mode === 'entrega' ? (c.taxaEntregaCent ?? 0) : 0,
          revisaoProdutorObservada: producer.revisaoProdutorObservada,
        };
        if (mode === 'entrega') {
          const concelhoId = String(data.get(prefix + '.concelhoId') ?? ''),
            morada = String(data.get(prefix + '.morada') ?? '')
              .normalize('NFC')
              .trim(),
            contacto = String(data.get(prefix + '.contacto') ?? '')
              .normalize('NFC')
              .trim();
          if (
            !c.concelhosEntregaIds.includes(concelhoId) ||
            !morada ||
            !contacto ||
            /[\p{Cc}\p{Cs}]/u.test(morada + contacto)
          )
            throw Error();
          return { ...base, concelhoId, morada, contacto };
        }
        if (!c.localLevantamento) throw Error();
        return base;
      });
    } catch {
      setOperation({
        owner: userId,
        phase: 'idle',
        message:
          'Preenche o método de pagamento, a data, o horário e os dados de receção de cada produtor.',
      });
      form
        .querySelector<HTMLElement>('[aria-invalid="true"], select:invalid, input:invalid')
        ?.focus();
      return;
    }
    const existing = readPending();
    if (existing && !existing.confirmed) {
      setPending(existing);
      return;
    }
    const body = checkoutBody(prepared, choices),
      reference: PendingPurchase = {
        referencia: crypto.randomUUID(),
        baseline: cart.snapshotPurchase(),
        submitted: false,
        confirmed: false,
        cleaned: false,
      };
    if (!updatePending(reference)) {
      setPending(undefined);
      setOperation({
        owner: userId,
        phase: 'idle',
        message:
          'O browser não permitiu guardar a referência de recuperação. A compra não foi enviada. Ativa o armazenamento para continuar com recuperação segura.',
      });
      return;
    }
    busy.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    setOperation({ owner: userId, phase: 'submitting' });
    try {
      const checkpoint = await auth.request(
        '/orders/attempts',
        parseCheckpoint,
        {
          method: 'POST',
          body: { referencia: reference.referencia, pedido: body },
          idempotencyKey: reference.referencia,
        },
        controller.signal,
      );
      if (checkpoint.referencia !== reference.referencia) throw new ApiFailure('invalid');
      await purchase(reference, controller.signal);
    } catch (error) {
      report(error, controller.signal, reference.referencia);
    } finally {
      if (requestRef.current === controller) busy.current = false;
    }
  }
  function revise() {
    if (pending) {
      clearPending(pending.referencia);
      setPending(undefined);
    }
    setAck(false);
    setOperation({ owner: userId, phase: 'idle' });
    setRefresh((n) => n + 1);
  }
  const changed = current?.data?.linhas.some((line) => {
    const item = cart.cart.items.find((i) => i.productId === line.produtoId);
    return item && item.unitPriceSnapshotCents !== line.ofertaAceite.precoReferenciaCent;
  });
  const quote = current?.data ? estimatedCheckoutTotal(current.data, draft) : undefined;
  return (
    <div className="checkout-page">
      <Container>
        <header className="checkout-intro">
          <p className="eyebrow">Da tua escolha à mesa</p>
          <h1>{confirmed ? 'A tua compra está confirmada.' : 'Só falta combinar a chegada.'}</h1>
          <p>
            {confirmed
              ? 'Os valores e referências abaixo foram confirmados pelo serviço.'
              : 'Revê os produtos e escolhe como recebê-los, diretamente de cada origem.'}
          </p>
        </header>
        {!userId && auth.notice && (
          <p className="checkout-note" role="status">
            {auth.notice}
          </p>
        )}
        {!allowed ? (
          <EmptyState
            title={
              userId ? 'Esta conta não tem acesso às compras.' : 'Entra para continuar a compra.'
            }
            description="A cesta mantém-se guardada. Precisas de uma conta com acesso de comprador; a demonstração não permite compras reais."
            action={
              <>
                <Button
                  to={
                    '/entrar?destino=' +
                    encodeURIComponent(
                      location.pathname === '/checkout/confirmacao'
                        ? '/checkout/confirmacao'
                        : '/checkout',
                    )
                  }
                >
                  Iniciar sessão
                </Button>
                <Button to="/carrinho" variant="text">
                  Voltar à cesta
                </Button>
              </>
            }
          />
        ) : !ready ? (
          <>
            <LoadingSkeleton label="A confirmar a sessão" count={2} />
            <Button onClick={() => void auth.revalidate()} variant="secondary">
              Confirmar acesso novamente
            </Button>
          </>
        ) : confirmed ? (
          <>
            <section className="checkout-receipt" aria-labelledby="receipt-title">
              <h2 id="receipt-title">Referência da compra</h2>
              <p className="checkout-reference">{confirmed.receipt.operacaoCompraId}</p>
              <p>
                {confirmed.receipt.encomendas.length}{' '}
                {confirmed.receipt.encomendas.length === 1
                  ? 'encomenda confirmada'
                  : 'encomendas confirmadas'}{' '}
                · <PriceDisplay amountCents={confirmed.receipt.totalCent} />
              </p>
              <p>Estado inicial: pendente · Pagamento por pagar.</p>
            </section>
            {confirmed.orders ? (
              confirmed.orders.map((order) => <OrderDetails key={order.id} order={order} />)
            ) : (
              <div role="status">
                <p>{confirmed.error ?? 'A carregar os detalhes das encomendas confirmadas…'}</p>
                {confirmed.error && (
                  <Button
                    onClick={() => {
                      const c = new AbortController();
                      requestRef.current = c;
                      void details(confirmed.receipt, c.signal);
                    }}
                  >
                    Carregar detalhes
                  </Button>
                )}
              </div>
            )}
            <div className="checkout-actions">
              <Button to="/area/comprador/encomendas">Consultar as minhas encomendas</Button>
              <Button to="/produtos" variant="secondary">
                Voltar ao mercado
              </Button>
            </div>
          </>
        ) : pending ? (
          <section className="checkout-recovery" aria-labelledby="recovery-title">
            <h2 id="recovery-title">
              {pending.confirmed ? 'Voltar à confirmação.' : 'Uma tentativa por confirmar.'}
            </h2>
            <p>
              {message ??
                'As escolhas desta tentativa foram conservadas para recuperar o resultado com segurança. Alterações posteriores da cesta não substituem esse pedido.'}
            </p>
            {phase === 'submitting' ? (
              <p role="status">A confirmar a compra. Aguarda o resultado…</p>
            ) : (
              <div className="checkout-actions">
                <Button onClick={() => void resume()}>Recuperar resultado da compra</Button>
                {phase === 'reconfirm' && (
                  <Button variant="secondary" onClick={revise}>
                    Rever condições
                  </Button>
                )}
                <Button to="/area/comprador/encomendas" variant="text">
                  Consultar encomendas
                </Button>
                <Button to="/carrinho" variant="text">
                  Voltar à cesta
                </Button>
              </div>
            )}
          </section>
        ) : !cart.cart.items.length ? (
          <EmptyState
            title="A cesta está vazia."
            description="Escolhe os produtos antes de combinar a receção."
            action={<Button to="/produtos">Explorar produtos</Button>}
          />
        ) : !onlyReal ? (
          <EmptyState
            title="Revê os exemplos da tua cesta."
            description="A compra real só aceita produtos do catálogo atual. Retira os exemplos demonstrativos antes de continuar."
            action={<Button to="/carrinho">Rever cesta</Button>}
          />
        ) : !current ? (
          <LoadingSkeleton label="A preparar as condições da compra" count={3} />
        ) : current.error ? (
          <div role="alert" className="checkout-error">
            <p>{current.error}</p>
            <Button onClick={() => setRefresh((n) => n + 1)}>Tentar novamente</Button>
            <Button to="/carrinho" variant="text">
              Rever cesta
            </Button>
          </div>
        ) : (
          current.data && (
            <form
              noValidate
              onSubmit={(event) => void submit(event)}
              aria-label="Confirmar compra"
              className="checkout-form"
            >
              {message && (
                <p className="checkout-error" role="alert">
                  {message}
                </p>
              )}
              {changed && (
                <p className="checkout-error" role="alert">
                  Os preços foram atualizados. Revê os valores apresentados e confirma que aceitas
                  as novas condições.
                </p>
              )}
              <section className="checkout-review" aria-labelledby="checkout-products">
                <h2 id="checkout-products">As tuas escolhas.</h2>
                <ul>
                  {current.data.linhas.map((line) => (
                    <li key={line.produtoId}>
                      <span>
                        {line.nome}
                        <small>
                          {line.quantidade}{' '}
                          {line.ofertaAceite.unidadeVenda.unidadeBase === 'un'
                            ? line.ofertaAceite.unidadeVenda.modalidade
                            : line.ofertaAceite.unidadeVenda.unidadeBase}
                        </small>
                      </span>
                      <PriceDisplay amountCents={line.subtotalCent} />
                    </li>
                  ))}
                </ul>
                <p className="checkout-note">
                  Valores dos produtos confirmados nesta revisão. As taxas são apresentadas por
                  produtor e o total final será confirmado pelo serviço.
                </p>
              </section>
              {current.data.produtores.map((producer) => (
                <ProducerCheckoutFields
                  key={producer.produtorContaId + ':' + refresh}
                  producer={producer}
                  draft={draft}
                  onChange={(values) => {
                    setDraft((previous) => ({ ...previous, ...values }));
                    setAck(false);
                  }}
                />
              ))}
              {quote ? (
                <dl className="checkout-totals" aria-label="Total previsto da compra">
                  <div>
                    <dt>Produtos</dt>
                    <dd>
                      <PriceDisplay amountCents={quote.produtosCent} />
                    </dd>
                  </div>
                  <div>
                    <dt>Receção e entrega</dt>
                    <dd>
                      <PriceDisplay amountCents={quote.taxasCent} />
                    </dd>
                  </div>
                  <div>
                    <dt>Total previsto</dt>
                    <dd>
                      <PriceDisplay amountCents={quote.totalCent} />
                    </dd>
                  </div>
                </dl>
              ) : (
                <p role="alert" className="checkout-error">
                  Não foi possível apresentar um total válido para esta seleção.
                </p>
              )}
              <div className="checkout-consent">
                <label>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />{' '}
                  Confirmo as quantidades, os preços e as condições apresentadas.
                </label>
                <p>
                  Ao confirmar, a compra será criada para os produtores selecionados. O pagamento
                  não é processado online.
                </p>
              </div>
              <div className="checkout-actions">
                <Button type="submit" disabled={!ack || !quote || phase === 'submitting'}>
                  Confirmar compra
                </Button>
                <Button to="/carrinho" variant="secondary">
                  Voltar à cesta
                </Button>
              </div>
            </form>
          )
        )}
        <p className="checkout-note">
          A cesta não reserva stock. Não feches esta página enquanto aguardas a confirmação; se a
          ligação falhar, podes recuperar a tentativa depois de voltar a iniciar sessão.
        </p>
      </Container>
    </div>
  );
}
