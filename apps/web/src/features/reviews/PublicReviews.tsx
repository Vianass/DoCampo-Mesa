import { useState } from 'react';
import { getJson } from '../api/client';
import { useRemote } from '../api/useRemote';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { RemoteError } from '../market/RemoteError';
import { parsePublicReviews, type ReviewTarget } from './contracts';
import { RealReviewCard, ReviewPager } from './ReviewComponents';
import { useReviewFocus } from './useReviewFocus';
export function PublicReviews({
  id,
  kind,
  alvoTipo = 'produtor',
  title,
}: {
  id: string;
  kind: 'products' | 'producers';
  alvoTipo?: ReviewTarget;
  title: string;
}) {
  const [page, setPage] = useState(1),
    path = `/${kind}/${id}/reviews?pagina=${page}&porPagina=12&ordem=recentes${kind === 'producers' ? '&alvoTipo=' + alvoTipo : ''}`,
    r = useRemote(path, (signal) => getJson(path, parsePublicReviews, signal)),
    { title: heading, requestFocus } = useReviewFocus(r.data);
  return (
    <section className="real-reviews public-reviews" aria-label={title}>
      <p className="eyebrow">Experiências de compras verificadas</p>
      <h2 ref={heading} tabIndex={-1}>
        {title}
      </h2>
      <Button variant="text" disabled={r.loading} onClick={r.retry}>
        Atualizar avaliações
      </Button>
      {r.loading ? (
        <LoadingSkeleton label="A consultar avaliações publicadas" count={2} />
      ) : r.error ? (
        <RemoteError
          error={r.error}
          retry={() => {
            requestFocus();
            r.retry();
          }}
        />
      ) : (
        r.data && (
          <>
            <p className="reviews-summary" role="status">
              {r.data.resumo.media === null
                ? 'Sem classificação'
                : `${r.data.resumo.media.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} / 5`}{' '}
              · {r.data.total}{' '}
              {r.data.total === 1 ? 'avaliação publicada' : 'avaliações publicadas'}
            </p>
            {r.data.total > 0 && (
              <dl className="review-distribution" aria-label="Distribuição das classificações">
                {[5, 4, 3, 2, 1].map((n) => (
                  <div key={n}>
                    <dt>
                      {n} {n === 1 ? 'estrela' : 'estrelas'}
                    </dt>
                    <dd>{r.data!.resumo.distribuicao[n]}</dd>
                  </div>
                ))}
              </dl>
            )}
            {r.data.itens.length ? (
              <div className="review-grid">
                {r.data.itens.map((item) => (
                  <RealReviewCard key={item.id} review={item} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Ainda sem palavras à mesa."
                description={
                  r.data.total
                    ? 'Esta página não tem avaliações. Escolhe outra página.'
                    : 'As avaliações publicadas de compras concluídas aparecerão aqui.'
                }
              />
            )}
            <ReviewPager
              page={page}
              pages={r.data.totalPaginas}
              change={(value) => {
                requestFocus();
                setPage(value);
              }}
              label={'Paginação: ' + title}
            />
          </>
        )
      )}
    </section>
  );
}
