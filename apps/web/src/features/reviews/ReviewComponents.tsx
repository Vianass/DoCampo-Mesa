import { Button } from '../../components/Button';
import { ReviewCard } from '../../components/ReviewCard';
import type { PublicReview } from './contracts';
export function RealReviewCard({ review }: { review: PublicReview }) {
  return (
    <ReviewCard
      verified
      review={{
        displayName: review.autorPublico,
        rating: review.classificacao,
        text: review.comentario,
        createdAt: review.criadaEm,
      }}
    />
  );
}
export function ReviewPager({
  page,
  pages,
  change,
  label,
}: {
  page: number;
  pages: number;
  change: (v: number) => void;
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
