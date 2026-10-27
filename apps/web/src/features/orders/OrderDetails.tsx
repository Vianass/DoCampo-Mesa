import { orderDate } from './format';
import { Link } from 'react-router';
import { PriceDisplay } from '../../components/PriceDisplay';
import type { OwnOrder } from '../checkout/contracts';
import { paymentLabels, stateLabels } from '../checkout/contracts';
export function OrderDetails({
  order,
  showProducer = true,
}: {
  order: OwnOrder;
  showProducer?: boolean;
}) {
  const delivery = order.entrega;
  return (
    <article className="buyer-order-detail live-order" aria-labelledby={'order-' + order.id}>
      <header>
        <div>
          <p className="eyebrow">Encomenda</p>
          <h2 id={'order-' + order.id}>{order.id}</h2>
          <time dateTime={order.criadaEm}>{orderDate(order.criadaEm)}</time>
        </div>
        <span className="buyer-order-status">{stateLabels[order.estado]}</span>
      </header>
      {showProducer && (
        <p className="live-order-producer">
          {order.produtor ? (
            <Link to={'/produtores/' + order.produtor.perfilId}>{order.produtor.nomePublico}</Link>
          ) : (
            'Produtor associado à encomenda'
          )}
        </p>
      )}
      <ul className="live-order-lines">
        {order.linhas.map((line) => (
          <li key={line.id}>
            <div>
              <Link to={'/produtos/' + line.produtoId}>{line.nome}</Link>
              <p>
                {line.quantidade}{' '}
                {line.unidadeVenda.unidadeBase === 'un'
                  ? line.unidadeVenda.modalidade === 'embalagem'
                    ? 'embalagens'
                    : 'unidades'
                  : line.unidadeVenda.unidadeBase}
              </p>
              <small>
                <PriceDisplay amountCents={line.precoReferenciaCent} /> /{' '}
                {line.unidadeVenda.modalidade === 'peso'
                  ? 'kg'
                  : line.unidadeVenda.modalidade === 'volume'
                    ? 'L'
                    : line.unidadeVenda.modalidade}
              </small>
            </div>
            <PriceDisplay amountCents={line.subtotalCent} />
          </li>
        ))}
      </ul>
      <dl className="checkout-totals">
        <div>
          <dt>Produtos</dt>
          <dd>
            <PriceDisplay amountCents={order.subtotalProdutosCent} />
          </dd>
        </div>
        <div>
          <dt>Entrega</dt>
          <dd>
            <PriceDisplay amountCents={order.taxaEntregaCent} />
          </dd>
        </div>
        <div>
          <dt>Total da encomenda</dt>
          <dd>
            <PriceDisplay amountCents={order.totalCent} />
          </dd>
        </div>
      </dl>
      {delivery && (
        <section className="live-order-delivery">
          <h3>{delivery.modalidade === 'levantamento' ? 'Levantamento' : 'Entrega'}</h3>
          {delivery.modalidade === 'levantamento' ? (
            <p>{delivery.localLevantamento}</p>
          ) : (
            <>
              <p>{delivery.morada}</p>
              <p>
                {delivery.concelhoId} · {delivery.contacto}
              </p>
            </>
          )}
          <p>
            {orderDate(delivery.periodoInicial.inicioEm, delivery.periodoInicial.fusoHorario)} —{' '}
            {orderDate(delivery.periodoInicial.fimEm, delivery.periodoInicial.fusoHorario)}
          </p>
          <p className="checkout-note">Hora do produtor: {delivery.periodoInicial.fusoHorario}</p>
        </section>
      )}
      <section>
        <h3>Pagamento</h3>
        <p>
          {paymentLabels[order.pagamento.metodo]} · {stateLabels[order.pagamento.estado]}
        </p>
        <p className="checkout-note">
          O método fica registado na encomenda. Esta plataforma não processa pagamentos online.
        </p>
      </section>
      {order.historicoEstado && (
        <section>
          <h3>Histórico</h3>
          <ol className="live-order-history">
            {order.historicoEstado.map((event, i) => (
              <li key={i}>
                <time dateTime={event.ocorridoEm}>{orderDate(event.ocorridoEm)}</time>
                <span>{event.para ? stateLabels[event.para] : 'Atualização registada'}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
