import { useRef } from 'react';
import { Link } from 'react-router';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Button } from '../components/Button';
import { Container } from '../components/Container';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PriceDisplay } from '../components/PriceDisplay';
import { CartLineItem } from '../features/cart/CartLineItem';
import { useCart } from '../features/cart/useCart';

export default function CartPage() {
  const {
    cart,
    producerGroups,
    itemCount,
    countByLine,
    subtotalCents,
    totalCents,
    feedback,
    recoveryMessages,
    clearCart,
    remoteIssue,
  } = useCart();
  const heading = useRef<HTMLHeadingElement>(null);
  function focusHeading() {
    heading.current?.focus({ preventScroll: true });
  }
  return (
    <div className="cart-page">
      <Container>
        <Breadcrumbs
          items={[
            { label: 'Início', to: '/' },
            { label: 'Produtos', to: '/produtos' },
            { label: 'Carrinho' },
          ]}
        />
        <header className="cart-page-intro">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-line" />
              Os sabores que escolheste
            </p>
            <h1 ref={heading} tabIndex={-1}>
              A tua cesta.
              <br />
              <em>Uma mesa a ganhar forma.</em>
            </h1>
            <p>Produtos de diferentes origens, reunidos com gosto para a tua próxima mesa.</p>
          </div>
          <div className="cart-page-intro__aside" aria-hidden="true">
            <Icon name="basket" width="64" height="64" />
            <span>
              Escolher com tempo.
              <br />
              <em>Saborear em companhia.</em>
            </span>
          </div>
        </header>
        {remoteIssue && (
          <p role="alert" className="cart-recovery">
            {remoteIssue}
          </p>
        )}
        {recoveryMessages.length > 0 && (
          <section className="cart-recovery" aria-labelledby="cart-recovery-title">
            <h2 id="cart-recovery-title">Ajustes à cesta guardada</h2>
            <ul>
              {recoveryMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </section>
        )}
        {feedback && (
          <p
            className={`cart-page-feedback ${feedback.kind === 'error' ? 'cart-field-error' : ''}`}
          >
            {feedback.message}
          </p>
        )}
        {cart.items.length ? (
          <>
            <div className="cart-toolbar">
              <p>
                <strong>{itemCount}</strong>{' '}
                {countByLine
                  ? itemCount === 1
                    ? 'artigo'
                    : 'artigos'
                  : itemCount === 1
                    ? 'unidade'
                    : 'unidades'}{' '}
                · {cart.items.length} {cart.items.length === 1 ? 'produto' : 'produtos'} ·{' '}
                {producerGroups.length} {producerGroups.length === 1 ? 'produtor' : 'produtores'}
              </p>
              <button
                type="button"
                className="cart-remove"
                onClick={() => {
                  clearCart();
                  focusHeading();
                }}
              >
                Esvaziar cesta
              </button>
            </div>
            <div className="cart-layout">
              <div className="cart-producers">
                {producerGroups.map((group) => (
                  <section
                    key={group.producerId}
                    className="cart-producer-group"
                    aria-labelledby={`cart-producer-${group.producerId}`}
                  >
                    <header>
                      <div>
                        <p className="eyebrow">Na origem</p>
                        <h2 id={`cart-producer-${group.producerId}`}>
                          <Link to={`/produtores/${group.producerId}`}>
                            {group.producerName}
                            <Icon name="diagonal" />
                          </Link>
                        </h2>
                        <p className="cart-producer-location">
                          <Icon name="location" />
                          {group.producerLocation}
                        </p>
                      </div>
                      <span>
                        {group.quantity}{' '}
                        {countByLine
                          ? group.quantity === 1
                            ? 'artigo'
                            : 'artigos'
                          : group.quantity === 1
                            ? 'unidade'
                            : 'unidades'}
                      </span>
                    </header>
                    {group.lines.map((line) => (
                      <CartLineItem
                        key={line.item.productId}
                        line={line}
                        onRemoved={focusHeading}
                      />
                    ))}
                    <footer>
                      <span>Subtotal de {group.producerName}</span>
                      <PriceDisplay amountCents={group.subtotalCents} />
                    </footer>
                  </section>
                ))}
              </div>
              <aside className="cart-summary" aria-labelledby="cart-summary-title">
                <p className="eyebrow">Da tua escolha à mesa</p>
                <h2 id="cart-summary-title">A cesta em detalhe.</h2>
                <dl>
                  <div>
                    <dt>Quantidade total</dt>
                    <dd>
                      {itemCount}{' '}
                      {countByLine
                        ? itemCount === 1
                          ? 'artigo'
                          : 'artigos'
                        : itemCount === 1
                          ? 'unidade'
                          : 'unidades'}
                    </dd>
                  </div>
                  <div>
                    <dt>Produtos diferentes</dt>
                    <dd>{cart.items.length}</dd>
                  </div>
                  <div>
                    <dt>Subtotal</dt>
                    <dd>
                      <PriceDisplay amountCents={subtotalCents} />
                    </dd>
                  </div>
                  <div className="cart-summary__total">
                    <dt>Total demonstrativo</dt>
                    <dd>
                      <PriceDisplay amountCents={totalCents} large />
                    </dd>
                  </div>
                </dl>
                <p className="cart-summary__note">
                  O total corresponde aos produtos escolhidos. Os custos de entrega não estão
                  incluídos; não existe finalização de compra nesta fase.
                </p>
                <div className="cart-checkout-note">
                  <Icon name="clock" />
                  <div>
                    <h3>O próximo passo está a crescer.</h3>
                    <p>
                      A finalização da compra ficará disponível numa fase futura. Por agora, a cesta
                      guarda apenas as tuas escolhas.
                    </p>
                  </div>
                </div>
                <Button to="/produtos" variant="secondary">
                  Continuar a explorar <Icon name="arrow" />
                </Button>
              </aside>
            </div>
          </>
        ) : (
          <div className="cart-empty">
            <EmptyState
              title="A tua cesta ainda está à espera dos primeiros sabores."
              description="Descobre produtos da época e histórias de quem cuida da terra. As tuas escolhas ficam aqui, prontas para continuar a explorar."
              action={
                <Button to="/produtos">
                  Explorar produtos <Icon name="arrow" />
                </Button>
              }
            />
            <span className="cart-empty__decoration" aria-hidden="true">
              ✳
            </span>
          </div>
        )}
        <p className="cart-demo-note">
          Cesta local, com escolhas do catálogo e eventuais exemplos demonstrativos. Não reserva
          stock nem cria encomendas. Preços e disponibilidade terão de ser confirmados antes de uma
          compra real.
        </p>
      </Container>
    </div>
  );
}
