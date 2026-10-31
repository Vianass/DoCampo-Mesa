import { useOrderUpdates } from '../orders/OrderUpdatesContext';
import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { ProducerTextarea } from '../producer/ProducerFields';
import { useAuth } from '../auth/useAuth';
import { stateLabels } from '../checkout/contracts';
import { record } from '../auctions/contracts';
import {
  ownReviewsPath,
  parseEligibility,
  parseOwnReview,
  parseOwnReviews,
  type EligibleOrder,
} from './contracts';
import { useReviewResource, reviewError } from './useReviewResource';
import { RealReviewCard, ReviewPager } from './ReviewComponents';
import { useReviewFocus } from './useReviewFocus';
type Choice = EligibleOrder['alvos'][number] & { encomendaId: string };
const parseBuyerActivity = (v: unknown) =>
  'resumo' in record(v) ? parseOwnReviews(v) : parseEligibility(v);
function ReviewForm({ choice, cancel }: { choice: Choice; cancel: () => void }) {
  const { request } = useAuth(),
    navigate = useNavigate(),
    [rating, setRating] = useState(''),
    [comment, setComment] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [locked, setLocked] = useState(false),
    controller = useRef<AbortController | undefined>(undefined),
    feedback = useRef<HTMLDivElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  return (
    <section className="admin-application-paper review-create">
      <h2 ref={heading} tabIndex={-1}>
        A tua experiência com {choice.nome}.
      </h2>
      <p>
        Uma avaliação por encomenda e alvo. O comentário e a classificação não podem ser editados ou
        eliminados neste percurso.
      </p>
      {error && (
        <div role="group" aria-label="Recuperar avaliação" tabIndex={-1} ref={feedback}>
          <p role="alert">{error}</p>
          <Button onClick={cancel}>Consultar avaliações antes de repetir</Button>
        </div>
      )}
      <form
        aria-label="Publicar avaliação verificada"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || locked) return;
          setBusy(true);
          setError('');
          const c = new AbortController();
          controller.current = c;
          void request(
            '/reviews',
            parseOwnReview,
            {
              method: 'POST',
              expectedStatus: 201,
              body: {
                encomendaId: choice.encomendaId,
                alvoTipo: choice.alvoTipo,
                ...(choice.produtoId ? { produtoId: choice.produtoId } : {}),
                classificacao: Number(rating),
                comentario: comment,
              },
            },
            c.signal,
          )
            .then((r) => {
              if (!c.signal.aborted)
                void navigate(ownReviewsPath + '/' + r.id, { state: { reviewCreated: true } });
            })
            .catch((e) => {
              if (!c.signal.aborted) {
                setError(reviewError(e));
                setLocked(true);
              }
            })
            .finally(() => {
              if (!c.signal.aborted) setBusy(false);
            });
        }}
      >
        <fieldset disabled={busy || locked}>
          <legend>Classificação de {choice.nome}</legend>
          <div
            className="review-stars"
            role="radiogroup"
            aria-label="Classificação de uma a cinco estrelas"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n}>
                <input
                  type="radio"
                  name="classificacao"
                  value={n}
                  checked={rating === String(n)}
                  onChange={(e) => setRating(e.target.value)}
                  required
                />
                <span aria-hidden="true">★</span>
                <span>
                  {n} {n === 1 ? 'estrela' : 'estrelas'}
                </span>
              </label>
            ))}
          </div>
          <ProducerTextarea
            label="Comentário"
            name="comentario"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            required
            rows={5}
            hint="1 a 1000 caracteres. Texto simples; o conteúdo não é interpretado como HTML."
          />
          <label className="review-confirmation">
            <input type="checkbox" required />
            Confirmo que descrevo a minha experiência desta compra e quero publicar esta avaliação.
          </label>
          <Button type="submit">{busy ? 'A publicar…' : 'Publicar avaliação'}</Button>
        </fieldset>
      </form>
      <Button variant="text" disabled={busy} onClick={cancel}>
        Voltar às avaliações
      </Button>
    </section>
  );
}
function OwnDetail({ id }: { id: string }) {
  const r = useReviewResource('/me/reviews/' + id, parseOwnReview),
    { state } = useLocation();
  return (
    <>
      <Button variant="text" to={ownReviewsPath}>
        ← Todas as avaliações
      </Button>
      {state?.reviewCreated && <p role="status">Avaliação publicada e confirmada pelo serviço.</p>}
      {r.loading && <LoadingSkeleton label="A consultar a tua avaliação" count={1} />}{' '}
      {r.error && (
        <div role="alert">
          {r.error}
          <Button onClick={r.retry}>Tentar novamente</Button>
        </div>
      )}
      {r.data && (
        <>
          <p>Encomenda · {r.data.encomendaId}</p>
          <p>Estado: {r.data.estado === 'publicada' ? 'Publicada' : 'Oculta pela moderação'}</p>
          <p>
            {r.data.alvoTipo === 'produto' ? 'Produto' : 'Produtor'} · {r.data.alvoNome}
          </p>
          <RealReviewCard review={r.data} />
          <p>
            O conteúdo original permanece preservado. Uma avaliação oculta não é incluída nas
            classificações públicas.
          </p>
        </>
      )}
    </>
  );
}
function OwnList() {
  const { revision } = useOrderUpdates();
  const [section, setSection] = useState<'compras' | 'historico'>('compras'),
    [page, setPage] = useState(1),
    [choice, setChoice] = useState<Choice>();
  const path = section === 'compras' ? '/me/review-eligibility' : '/me/reviews',
    r = useReviewResource(
      path + `?pagina=${page}&porPagina=12&ordem=recentes`,
      parseBuyerActivity,
      revision,
    ),
    { title, requestFocus } = useReviewFocus(r.data);
  const pages = r.data?.totalPaginas ?? 0,
    corrected = r.data && page > Math.max(1, pages) ? Math.max(1, pages) : undefined;
  if (corrected) setPage(corrected);
  if (choice)
    return (
      <ReviewForm
        choice={choice}
        cancel={() => {
          requestFocus();
          setChoice(undefined);
          setSection('historico');
          setPage(1);
          r.retry();
        }}
      />
    );
  return (
    <>
      <h2 ref={title} tabIndex={-1}>
        {section === 'compras' ? 'Compras e elegibilidade' : 'Histórico de avaliações'}
      </h2>
      <div className="admin-decision-actions">
        <Button
          variant={section === 'compras' ? 'primary' : 'secondary'}
          onClick={() => {
            setSection('compras');
            setPage(1);
          }}
        >
          Compras e elegibilidade
        </Button>
        <Button
          variant={section === 'historico' ? 'primary' : 'secondary'}
          onClick={() => {
            setSection('historico');
            setPage(1);
          }}
        >
          Histórico de avaliações
        </Button>
        <Button variant="text" onClick={r.retry}>
          Atualizar avaliações
        </Button>
      </div>
      {r.loading && <LoadingSkeleton label="A consultar a tua atividade de avaliações" count={2} />}{' '}
      {r.error && (
        <div role="alert">
          {r.error}
          <Button onClick={r.retry}>Tentar novamente</Button>
        </div>
      )}
      {r.data && !corrected && (
        <>
          {!r.data.itens.length && (
            <EmptyState
              title={
                section === 'compras'
                  ? 'Ainda sem compras nesta consulta.'
                  : 'Ainda sem avaliações nesta consulta.'
              }
              description="Os registos da tua conta aparecerão aqui."
            />
          )}
          <div className="review-grid">
            {r.data.itens.map((item) =>
              'encomendaId' in item && 'alvos' in item ? (
                <article className="admin-application-paper" key={item.encomendaId}>
                  <h2>Uma compra, várias experiências.</h2>
                  <p>Encomenda · {item.encomendaId}</p>
                  <p>
                    {stateLabels[item.estadoEncomenda as keyof typeof stateLabels] ??
                      item.estadoEncomenda}
                  </p>
                  {!item.elegivel && (
                    <p>Aguarda a conclusão confirmada da encomenda para avaliar.</p>
                  )}
                  <ul className="review-targets">
                    {item.alvos.map((target, i) => (
                      <li key={i}>
                        <h3>{target.nome}</h3>
                        {target.avaliacaoId ? (
                          <Button variant="text" to={ownReviewsPath + '/' + target.avaliacaoId}>
                            Consultar avaliação
                          </Button>
                        ) : (
                          <Button
                            disabled={!item.elegivel}
                            onClick={() => setChoice({ ...target, encomendaId: item.encomendaId })}
                          >
                            {target.alvoTipo === 'produto' ? 'Avaliar produto' : 'Avaliar produtor'}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              ) : 'id' in item ? (
                <article key={item.id}>
                  <RealReviewCard review={item} />
                  <p>
                    {item.estado === 'publicada' ? 'Publicada' : 'Oculta pela moderação'} ·{' '}
                    {item.alvoNome}
                  </p>
                  <Button variant="text" to={ownReviewsPath + '/' + item.id}>
                    Consultar avaliação
                  </Button>
                </article>
              ) : null,
            )}
          </div>
          <ReviewPager
            page={page}
            pages={pages}
            change={(value) => {
              requestFocus();
              setPage(value);
            }}
            label="Paginação das minhas avaliações"
          />
        </>
      )}
    </>
  );
}
export default function BuyerReviewsArea() {
  const { pathname } = useLocation(),
    parts = pathname.split('/').filter(Boolean),
    id = parts[3];
  return (
    <div className="buyer-page real-reviews buyer-reviews">
      <header className="buyer-intro">
        <p className="eyebrow">O teu mercado · Comprador</p>
        <h1>As palavras também alimentam.</h1>
        <p>Avaliações de compras concluídas, ligadas à tua conta e verificadas pelo serviço.</p>
      </header>
      <p className="review-dependency">
        Apenas compras concluídas podem ser avaliadas. Depois de receberes os produtos, confirma a
        receção no detalhe da encomenda pronta. A confirmação não altera o pagamento nem cria
        avaliações automaticamente.
      </p>
      {parts.length > 4 || (id && !/^[a-fA-F0-9]{24}$/.test(id)) ? (
        <EmptyState title="A avaliação não está disponível." description="Revê o endereço." />
      ) : id ? (
        <OwnDetail key={id} id={id.toLowerCase()} />
      ) : (
        <OwnList />
      )}
    </div>
  );
}
