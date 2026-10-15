import { Link } from 'react-router';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { ReviewCard } from '../../../components/ReviewCard';
import { producers } from '../../../data/market';
import { BuyerPageFrame } from '../../../features/buyer/BuyerPageFrame';
import { ProducerReviewForm } from '../../../features/buyer/ProducerReviewForm';
import { selectReviews } from '../../../features/buyer/selectors';

export default function BuyerReviewsPage() {
  return (
    <BuyerPageFrame
      title="As minhas avaliações."
      description="Depois de uma entrega, as palavras também ajudam a conhecer a origem."
    >
      {(data) => {
        const reviews = selectReviews(data);
        return (
          <>
            <section className="buyer-reviews" aria-labelledby="buyer-reviews-title">
              <h2 id="buyer-reviews-title" className="visually-hidden">
                Avaliações demonstrativas a produtores
              </h2>
              {reviews.length ? (
                reviews.map((review) => (
                  <div className="buyer-review" key={review.id}>
                    <div>
                      <h3>
                        <Link to={`/produtores/${review.producerId}`}>
                          {producers.find((producer) => producer.id === review.producerId)?.name ??
                            'Produtor do cenário'}
                        </Link>
                      </h3>
                      <p>
                        Encomenda fictícia{' '}
                        <Link to={`/area/comprador/encomendas/${review.orderId}`}>
                          {data.orders.find((order) => order.id === review.orderId)?.reference ??
                            review.orderId}
                        </Link>{' '}
                        · Sem compra verificada
                      </p>
                    </div>
                    <ReviewCard review={review} />
                    <Link className="buyer-detail-link" to={`/produtores/${review.producerId}`}>
                      Conhecer o produtor →
                    </Link>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="As palavras ainda estão por partilhar."
                  description="Não existem avaliações neste cenário. Só uma entrega fictícia concluída permite explorar o formulário."
                  action={
                    <Button to="/area/comprador/encomendas" variant="secondary">
                      Consultar encomendas
                    </Button>
                  }
                />
              )}
            </section>
            <ProducerReviewForm data={data} />
          </>
        );
      }}
    </BuyerPageFrame>
  );
}
