import { useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { Container } from '../../components/Container';
import { Button } from '../../components/Button';
import { PriceDisplay } from '../../components/PriceDisplay';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../auth/useAuth';
import { useRemote } from '../api/useRemote';
import { ApiFailure } from '../api/client';
import { objectId } from '../api/catalog-contract';
import { ProducerCheckoutFields } from '../checkout/ProducerCheckoutFields';
import {
  parsePreparation,
  parseReceipt,
  type ProducerChoice,
  type Receipt,
} from '../checkout/contracts';
import { declaredWindows, estimatedCheckoutTotal } from '../checkout/model';
import { record, text } from './contracts';

function parsePurchase(value: unknown) {
  const v = record(value),
    purchase = record(v.compra);
  if (purchase.estado !== 'pendente' && purchase.estado !== 'confirmada')
    throw Error('Estado de compra inválido.');
  return {
    leilaoId: text(v.leilaoId),
    titulo: text(v.titulo),
    preparation: parsePreparation(v.preparacao),
    orderId: purchase.encomendaId ? text(purchase.encomendaId) : undefined,
  };
}
export default function AuctionCheckoutPage() {
  const auth = useAuth(),
    { id = '' } = useParams();
  const owner = auth.session.kind === 'authenticated' ? auth.session.user.id : 'visitor';
  return <PurchaseSession key={id + ':' + owner} id={id} />;
}
function PurchaseSession({ id }: { id: string }) {
  const auth = useAuth();
  const allowed =
    auth.session.kind === 'authenticated' &&
    auth.session.status === 'ready' &&
    auth.session.user.papeis.includes('comprador');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [refresh, setRefresh] = useState(0),
    [accepted, setAccepted] = useState(false);
  const [hasAttempt, setHasAttempt] = useState(false);
  const [message, setMessage] = useState<string>(),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState<Receipt>();
  const attempt = useRef<{ key: string; body: { condicao: ProducerChoice } } | null>(null),
    sending = useRef(false);
  const resource = useRemote(allowed && objectId(id) ? id + ':' + refresh : '', (signal) =>
    auth.request('/auctions/' + id + '/checkout', parsePurchase, {}, signal),
  );
  const data = allowed ? resource.data : undefined;
  const total = data ? estimatedCheckoutTotal(data.preparation, draft) : undefined;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !allowed || sending.current) return;
    try {
      if (!attempt.current) {
        if (!accepted) {
          setMessage('Confirma as condições antes de criar a encomenda.');
          return;
        }
        const form = new FormData(event.currentTarget),
          p = data.preparation.produtores[0]!,
          prefix = p.produtorContaId,
          c = p.comercial;
        const mode = String(form.get(prefix + '.modalidade'));
        if (mode !== 'entrega' && mode !== 'levantamento') throw Error();
        const windows = declaredWindows(
          String(form.get(prefix + '.data')),
          c.disponibilidade[mode],
          c.disponibilidade.fusoHorario,
        );
        const window = windows[Number(form.get(prefix + '.janela'))];
        if (!window || !form.get(prefix + '.metodoPagamento')) throw Error();
        const choice: ProducerChoice = {
          produtorContaId: prefix,
          modalidade: mode,
          periodo: window.periodo,
          metodoPagamento: String(form.get(prefix + '.metodoPagamento')),
          taxaEntregaAceiteCent: mode === 'entrega' ? c.taxaEntregaCent! : 0,
          revisaoProdutorObservada: p.revisaoProdutorObservada,
          ...(mode === 'entrega'
            ? {
                concelhoId: String(form.get(prefix + '.concelhoId')),
                morada: String(form.get(prefix + '.morada')).trim(),
                contacto: String(form.get(prefix + '.contacto')).trim(),
              }
            : {}),
        };
        attempt.current = { key: crypto.randomUUID(), body: { condicao: choice } };
      }
      sending.current = true;
      setBusy(true);
      setMessage(undefined);
      const result = await auth.request('/auctions/' + id + '/checkout', parseReceipt, {
        method: 'POST',
        idempotencyKey: attempt.current.key,
        expectedStatus: [200, 201],
        body: attempt.current.body,
      });
      setConfirmed(result);
      attempt.current = null;
    } catch (error) {
      if (
        error instanceof ApiFailure &&
        error.status !== undefined &&
        error.status >= 400 &&
        error.status < 500
      ) {
        attempt.current = null;
        setRefresh((v) => v + 1);
        setAccepted(false);
        setMessage(
          'A compra não foi confirmada por este pedido. Consulta o estado e revê as condições antes de repetir.',
        );
      } else if (attempt.current)
        setMessage(
          'Resultado ainda desconhecido. Recupera com o mesmo pedido; não cries outra compra.',
        );
      else setMessage('Preenche a receção, data, horário e método de pagamento.');
    } finally {
      sending.current = false;
      setBusy(false);
      setHasAttempt(!!attempt.current);
    }
  }
  const orderId = allowed ? (confirmed?.encomendas[0]?.orderId ?? data?.orderId) : undefined;
  return (
    <Container>
      <div className="checkout-page">
        <header className="checkout-intro">
          <p className="eyebrow">O lote que conquistaste</p>
          <h1>Finalizar compra do leilão.</h1>
        </header>
        {!allowed ? (
          <>
            <p>Entra com a conta compradora vencedora para continuar.</p>
            <Button to={'/entrar?destino=' + encodeURIComponent('/checkout/leilao/' + id)}>
              Entrar
            </Button>
          </>
        ) : resource.loading ? (
          <LoadingSkeleton label="A preparar a compra do lote" count={2} />
        ) : orderId ? (
          <section className="checkout-receipt">
            <h2>Encomenda criada.</h2>
            <p>
              A compra do lote está confirmada. Pagamento por pagar; não foi efetuado um pagamento
              online.
            </p>
            <Button to={'/area/comprador/encomendas/' + orderId}>
              Consultar encomenda do leilão
            </Button>
          </section>
        ) : resource.error || !data ? (
          <section role="alert">
            <h2>Não foi possível preparar esta compra.</h2>
            <p>Confirma que és o vencedor e que o lote e as condições estão disponíveis.</p>
            <Button onClick={() => setRefresh((v) => v + 1)}>Atualizar compra</Button>
          </section>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <section className="checkout-receipt">
              <h2>{data.titulo}</h2>
              <p>{data.preparation.linhas[0]!.nome} · lote completo e indivisível</p>
              <p>{data.preparation.linhas[0]!.ofertaAceite.unidadeVenda.rotulo}</p>
              <p>
                Valor vencedor:{' '}
                <PriceDisplay amountCents={data.preparation.linhas[0]!.subtotalCent} />
              </p>
              <p>
                O lote e o preço são confirmados pelo servidor. A cesta normal permanece
                independente.
              </p>
            </section>
            {message && (
              <p role="alert" className="cart-recovery">
                {message}
              </p>
            )}
            <fieldset disabled={busy || hasAttempt} className="checkout-fields">
              <legend>Receção e pagamento</legend>
              <ProducerCheckoutFields
                producer={data.preparation.produtores[0]!}
                draft={draft}
                onChange={(values) => setDraft((d) => ({ ...d, ...values }))}
              />
              <label>
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />{' '}
                Confirmo o lote, o preço vencedor e as condições de receção e pagamento.
              </label>
            </fieldset>
            {total && (
              <dl className="checkout-totals">
                <dt>Valor do lote</dt>
                <dd>
                  <PriceDisplay amountCents={total.produtosCent} />
                </dd>
                <dt>Entrega</dt>
                <dd>
                  <PriceDisplay amountCents={total.taxasCent} />
                </dd>
                <dt>Total</dt>
                <dd>
                  <PriceDisplay amountCents={total.totalCent} />
                </dd>
              </dl>
            )}
            <Button type="submit" disabled={busy || (!accepted && !hasAttempt)}>
              {busy
                ? 'A confirmar…'
                : hasAttempt
                  ? 'Recuperar compra do leilão'
                  : 'Confirmar encomenda do leilão'}
            </Button>
          </form>
        )}
      </div>
    </Container>
  );
}
