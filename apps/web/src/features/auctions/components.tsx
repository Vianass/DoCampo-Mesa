import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { MarketImage } from '../../components/MarketImage';
import { PriceDisplay } from '../../components/PriceDisplay';
import { useRemote } from '../api/useRemote';
import { catalogApi } from '../api/catalog';
import { auctionLabels, type AuctionSummary, type AuctionState } from './contracts';
import {
  auctionDate,
  remainingLabel,
  serverTime,
  sampleClock,
  lotLabel,
  type ClockSample,
} from './model';

export function AuctionBadge({ state }: { state: AuctionState }) {
  return (
    <span className={'auction-state auction-state--' + state}>
      {state === 'ativo' && <i aria-hidden="true" />}
      {auctionLabels[state]}
    </span>
  );
}
export function AuctionImage({ auction }: { auction: AuctionSummary }) {
  const product = useRemote('auction-image:' + auction.produtoId, (signal) =>
    catalogApi.product(auction.produtoId, signal),
  );
  const image = product.data?.imagens.find((i) => i.principal) ?? product.data?.imagens[0];
  return (
    <div className="auction-photo">
      <MarketImage
        src={image?.url ?? '/images/product-placeholder.svg'}
        alt={image?.alt ?? 'Imagem de ' + auction.lote.nome}
        width="1200"
        height="900"
        loading="lazy"
      />
      <span className="auction-photo__caption">
        {image ? 'Fotografia do catálogo · imagem ilustrativa' : 'Fotografia não disponível'}
      </span>
    </div>
  );
}
export function AuctionClock({
  state,
  sample,
  onBoundary,
}: {
  state: Pick<AuctionSummary, 'estado' | 'iniciaEm' | 'terminaEm'>;
  sample: ClockSample;
  onBoundary?: () => void;
}) {
  const [now, setNow] = useState(() => serverTime(sample));
  useEffect(() => {
    const tick = () => setNow(serverTime(sample));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [sample]);
  const target = Date.parse(state.estado === 'agendado' ? state.iniciaEm : state.terminaEm),
    remaining = target - now;
  const reached = remaining <= 0;
  useEffect(() => {
    if (reached && ['ativo', 'agendado'].includes(state.estado)) onBoundary?.();
  }, [reached, state.estado, onBoundary]);
  return (
    <div
      className="auction-clock"
      data-remaining-ms={Math.max(0, Math.round(remaining))}
      aria-label={state.estado === 'agendado' ? 'Tempo até ao início' : 'Tempo restante'}
    >
      <span>
        {state.estado === 'agendado'
          ? 'Começa dentro de'
          : state.estado === 'ativo'
            ? 'Termina dentro de'
            : 'Prazo encerrado'}
      </span>
      <strong aria-live="off">
        {!['ativo', 'agendado'].includes(state.estado)
          ? '—'
          : remaining > 0
            ? remainingLabel(remaining)
            : 'A confirmar…'}
      </strong>
      {remaining <= 0 && ['ativo', 'agendado'].includes(state.estado) && (
        <small>
          {state.estado === 'ativo'
            ? 'A aguardar o encerramento confirmado.'
            : 'A aguardar a abertura confirmada.'}
        </small>
      )}
    </div>
  );
}
export function LiveAuctionCard({
  auction,
  own = false,
}: {
  auction: AuctionSummary;
  own?: boolean;
}) {
  const [clock] = useState(() => sampleClock(auction.serverNow));
  const path = own ? '/area/produtor/leiloes/' + auction.id : '/leiloes/' + auction.id;
  return (
    <article className="auction-lot-card">
      <Link to={path} state={{ auction }} aria-label={'Conhecer ' + auction.titulo}>
        <AuctionImage auction={auction} />
      </Link>
      <div className="auction-lot-card__body">
        <div className="auction-card-top">
          <AuctionBadge state={auction.estado} />
          <span>{lotLabel(auction)}</span>
        </div>
        <p className="auction-origin">{auction.produtor.nome}</p>
        <h2>
          <Link to={path} state={{ auction }}>
            {auction.titulo}
          </Link>
        </h2>
        <p className="auction-product-name">{auction.lote.nome}</p>
        <div className="auction-lot-card__numbers">
          <div>
            <span>Valor atual do lote</span>
            <PriceDisplay amountCents={auction.licitacaoAtual.valorCent} />
            <small>
              Base <PriceDisplay amountCents={auction.precoBaseCent} />
            </small>
          </div>
          <AuctionClock state={auction} sample={clock} />
        </div>
        <p className="auction-date-line">
          Início · <time dateTime={auction.iniciaEm}>{auctionDate(auction.iniciaEm)}</time>
          <br />
          Fim · <time dateTime={auction.terminaEm}>{auctionDate(auction.terminaEm)}</time>
        </p>
        <Button to={path} state={{ auction }} variant="secondary">
          {own ? 'Gerir leilão' : 'Conhecer o lote'} <span aria-hidden="true">↗</span>
        </Button>
      </div>
    </article>
  );
}
export function AuctionPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="auction-pagination" aria-label="Paginação de leilões">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Página anterior
      </Button>
      <span>
        Página {page} de {totalPages}
      </span>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Página seguinte
      </Button>
    </nav>
  );
}
