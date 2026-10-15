import { useParams } from 'react-router';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { PriceDisplay } from '../../../components/PriceDisplay';
import { StatusBadge } from '../../../components/StatusBadge';
import { buyerDate } from '../../../features/buyer/selectors';
import { ProducerPageFrame } from '../../../features/producer/ProducerPageFrame';
import { ownAuctions } from '../../../features/producer/selectors';
export default function ProducerAuctionDetailPage() {
  const { id } = useParams();
  return (
    <ProducerPageFrame
      title="Uma colheita em perspetiva."
      description="O lote e o seu estado no cenário, sem comandos de licitação."
    >
      {(data) => {
        const auction = ownAuctions(data).find((entry) => entry.id === id);
        if (!auction)
          return (
            <EmptyState
              title="Este leilão não pertence à tua produção."
              description="O identificador não existe neste conjunto demonstrativo."
              action={<Button to="/area/produtor/leiloes">Voltar aos leilões</Button>}
            />
          );
        return (
          <section className="producer-auction-detail">
            <StatusBadge tone="neutral">
              {auction.state === 'ativo'
                ? 'Ativo'
                : auction.state === 'agendado'
                  ? 'Agendado'
                  : 'Terminado'}
            </StatusBadge>
            <h2>{auction.title}</h2>
            <p>{auction.lot}</p>
            <dl className="producer-facts">
              <div>
                <dt>Preço base do lote</dt>
                <dd>
                  <PriceDisplay amountCents={auction.basePriceCents} />
                </dd>
              </div>
              <div>
                <dt>Incremento do cenário</dt>
                <dd>
                  <PriceDisplay amountCents={auction.incrementCents} />
                </dd>
              </div>
              <div>
                <dt>
                  {auction.currentBid
                    ? 'Oferta mais elevada no retrato'
                    : 'Valor inicial · sem ofertas'}
                </dt>
                <dd>
                  <PriceDisplay
                    amountCents={auction.currentBid?.amountCents ?? auction.basePriceCents}
                  />
                </dd>
              </div>
              <div>
                <dt>Ofertas aceites</dt>
                <dd>{auction.bidCount}</dd>
              </div>
              <div>
                <dt>Início ilustrativo</dt>
                <dd>
                  <time dateTime={auction.startsAt}>{buyerDate(auction.startsAt)}</time>
                </dd>
              </div>
              <div>
                <dt>Fim ilustrativo</dt>
                <dd>
                  <time dateTime={auction.endsAt}>{buyerDate(auction.endsAt)}</time>
                </dd>
              </div>
            </dl>
            <div className="producer-auction-result">
              <h3>Resultado no cenário.</h3>
              <p>
                {auction.state !== 'terminado'
                  ? 'Resultado ainda por determinar neste retrato.'
                  : auction.result?.kind === 'sem_licitacoes'
                    ? 'Terminado sem licitações. Não existe vencedor; o preço base não é uma oferta.'
                    : 'Terminado com uma oferta vencedora fictícia. Não foi criada uma encomenda.'}
              </p>
              {auction.result?.kind === 'adjudicado' && (
                <PriceDisplay amountCents={auction.result.amountCents} />
              )}
            </div>
            <p className="producer-help">
              A sequência representa ofertas aceites no exemplo, não atividade em direto. O servidor
              será responsável por prazo, concorrência, histórico e resultado.
            </p>
            <Button to="/area/produtor/leiloes" variant="secondary">
              Voltar aos leilões
            </Button>
          </section>
        );
      }}
    </ProducerPageFrame>
  );
}
