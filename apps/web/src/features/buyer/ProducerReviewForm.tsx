import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { eligibleReviewOrders, validateReview } from './selectors';
import { useBuyer } from './useBuyer';
import type { BuyerDataset } from './types';

export function ProducerReviewForm({ data }: { data: BuyerDataset }) {
  const { submitReview, reviewFeedback } = useBuyer();
  const choices = eligibleReviewOrders(data);
  const [orderId, setOrderId] = useState(choices[0]?.id ?? '');
  const [rating, setRating] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const id = useId();
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  return (
    <section className="buyer-review-form" aria-labelledby={`${id}-title`}>
      <p className="eyebrow">Depois da entrega</p>
      <h2 id={`${id}-title`}>Partilhar uma experiência.</h2>
      <p>
        Exercício local sobre uma entrega fictícia. Não publica uma avaliação no mercado nem
        comprova uma compra.
      </p>
      {reviewFeedback && (
        <p
          role="status"
          aria-live="polite"
          className="buyer-review-feedback"
          key={reviewFeedback.id}
        >
          {reviewFeedback.message}
        </p>
      )}
      {choices.length ? (
        <form
          noValidate
          aria-label="Avaliação demonstrativa de produtor"
          onSubmit={(event) => {
            event.preventDefault();
            const draft = { orderId, rating: Number(rating), text };
            const invalid = validateReview(data, draft);
            setError(invalid);
            if (!invalid) {
              submitReview(draft);
              setText('');
              setRating('');
            }
          }}
        >
          {error && (
            <p
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              id={`${id}-error`}
              className="cart-field-error"
            >
              {error}
            </p>
          )}
          <div className="buyer-form-field">
            <label htmlFor={`${id}-order`}>Encomenda entregue e produtor</label>
            <select
              id={`${id}-order`}
              className="form-select"
              value={orderId}
              required
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => {
                setOrderId(event.target.value);
                setError(null);
              }}
            >
              {choices.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.reference} · {order.items[0]?.producerName}
                </option>
              ))}
            </select>
          </div>
          <div className="buyer-form-field">
            <label htmlFor={`${id}-rating`}>Classificação</label>
            <select
              id={`${id}-rating`}
              className="form-select"
              value={rating}
              required
              aria-invalid={
                !!error &&
                (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5)
              }
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => {
                setRating(event.target.value);
                setError(null);
              }}
            >
              <option value="">Escolhe de 1 a 5</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} de 5
                </option>
              ))}
            </select>
          </div>
          <div className="buyer-form-field">
            <label htmlFor={`${id}-comment`}>
              Comentário <span>(opcional)</span>
            </label>
            <textarea
              id={`${id}-comment`}
              className="form-control"
              value={text}
              maxLength={1000}
              rows={4}
              aria-describedby={`${id}-hint`}
              onChange={(event) => setText(event.target.value)}
            />
            <p id={`${id}-hint`}>Até 1000 caracteres nesta demonstração.</p>
          </div>
          <Button type="submit">Acrescentar à demonstração</Button>
        </form>
      ) : (
        <p className="buyer-no-review-choice">
          Não existem encomendas entregues sem avaliação do produtor neste cenário.
        </p>
      )}
    </section>
  );
}
