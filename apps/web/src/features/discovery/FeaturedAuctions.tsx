import { useEffect, useRef } from 'react';
import { Button } from '../../components/Button';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { PriceDisplay } from '../../components/PriceDisplay';
import { getJson } from '../api/client';
import { useRemote } from '../api/useRemote';
import { parseAuctions, type AuctionSummary } from '../auctions/contracts';
import { AuctionBadge, AuctionClock, AuctionImage } from '../auctions/components';
import { lotLabel, sampleClock, serverTime, type ClockSample } from '../auctions/model';

function FeaturedCard({
  auction,
  sample,
  refresh,
}: {
  auction: AuctionSummary;
  sample: ClockSample;
  refresh: () => void;
}) {
  const boundary = useRef(false);
  return (
    <article className="auction-card featured-auction" aria-label="Leilão real em destaque">
      <div className="auction-card__image">
        <AuctionImage auction={auction} />
      </div>
      <div className="auction-card__content">
        <AuctionBadge state={auction.estado} />
        <h3>{auction.titulo}</h3>
        <p className="auction-card__description">{auction.lote.nome}</p>
        <p className="auction-card__origin">{auction.produtor.nome}</p>
        <p className="auction-card__quantity">{lotLabel(auction)}</p>
        <div className="auction-card__numbers">
          <div>
            <span>Valor atual do lote</span>
            <PriceDisplay amountCents={auction.licitacaoAtual.valorCent} large />
            <small>
              {auction.sequencia
                ? 'Oferta confirmada pelo serviço'
                : 'Preço base · ainda sem ofertas'}
            </small>
          </div>
          <AuctionClock
            state={auction}
            sample={sample}
            onBoundary={() => {
              if (!boundary.current) {
                boundary.current = true;
                refresh();
              }
            }}
          />
        </div>
        <Button to={'/leiloes/' + auction.id} variant="light">
          Conhecer o leilão ↗
        </Button>
        <p className="auction-card__note">
          Detalhe e ofertas exigem sessão. O resultado é confirmado pelo serviço.
        </p>
      </div>
    </article>
  );
}
export function FeaturedAuctions() {
  const resource = useRemote('home-live-auctions', async (signal) => {
    const sent = performance.now();
    const page = await getJson(
      '/auctions?estado=ativo&porPagina=12&ordem=recentes',
      parseAuctions,
      signal,
    );
    const received = performance.now();
    return { ...page, received, sent };
  });
  const retry = useRef(resource.retry);
  useEffect(() => {
    retry.current = resource.retry;
  }, [resource.retry]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') retry.current();
    }, 15000);
    return () => clearInterval(timer);
  }, []);
  if (resource.loading) return <LoadingSkeleton label="A consultar leilões em direto" count={1} />;
  if (resource.error)
    return (
      <div className="auction-notice" role="alert">
        <p>Não foi possível consultar os leilões em direto.</p>
        <Button onClick={resource.retry} variant="secondary">
          Voltar a consultar leilões
        </Button>
      </div>
    );
  const data = resource.data!;
  const auction = data.itens.find((item) => {
    const now = serverTime(sampleClock(item.serverNow, data.received, data.sent));
    return (
      item.estado === 'ativo' &&
      Date.parse(item.iniciaEm) <= now &&
      now < Date.parse(item.terminaEm)
    );
  });
  if (!auction)
    return (
      <EmptyState
        title="Ainda sem leilões em direto."
        description="Volta mais tarde ou explora os leilões agendados. Os estados são confirmados pelo serviço."
        action={
          <Button to="/leiloes" variant="secondary">
            Consultar os leilões
          </Button>
        }
      />
    );
  return (
    <FeaturedCard
      key={auction.id + ':' + auction.versao + ':' + auction.serverNow}
      auction={auction}
      sample={sampleClock(auction.serverNow, data.received, data.sent)}
      refresh={resource.retry}
    />
  );
}
