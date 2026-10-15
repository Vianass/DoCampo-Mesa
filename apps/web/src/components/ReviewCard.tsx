import type { ProducerReview } from '../types/market';

const dateFormat = new Intl.DateTimeFormat('pt-PT', {
  dateStyle: 'long',
  timeZone: 'Europe/Lisbon',
});

export function ReviewCard({ review }: { review: ProducerReview }) {
  return (
    <article className="review-card" aria-label={`Avaliação de ${review.displayName}`}>
      <div className="review-card__top">
        <p aria-label={`${review.rating} de 5 estrelas`}>
          <span aria-hidden="true">
            {'★'.repeat(review.rating)}
            {'☆'.repeat(5 - review.rating)}
          </span>
          <span>{review.rating}/5</span>
        </p>
        <span className="review-card__demo">Demonstração</span>
      </div>
      <p className="review-card__text">{review.text}</p>
      <footer>
        <h3>{review.displayName}</h3>
        <time dateTime={review.createdAt}>{dateFormat.format(new Date(review.createdAt))}</time>
      </footer>
    </article>
  );
}
