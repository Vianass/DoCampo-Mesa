import { Link, useParams } from 'react-router';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { PriceDisplay } from '../../../components/PriceDisplay';
import { BuyerPageFrame } from '../../../features/buyer/BuyerPageFrame';
import { BuyerBidList } from '../../../features/buyer/BuyerBidList';
import { buyerDate, selectBids } from '../../../features/buyer/selectors';

export default function BuyerAuctionPage() {
  const { id } = useParams();
  return (
    <BuyerPageFrame
      title="Uma colheita,"
      accent="outras possibilidades."
      description="Detalhe de um leilão demonstrativo, apenas para leitura."
    >
      {(data) => {
        const bid = selectBids(data).find((entry) => entry.auction.id === id);
        if (!bid)
          return (
            <EmptyState
              title="Este leilão não está no teu percurso."
              description="O identificador não corresponde a uma participação deste comprador no cenário selecionado."
              action={<Button to="/area/comprador/licitacoes">Voltar às licitações</Button>}
            />
          );
        const auction = bid.auction;
        return (
          <>
            <Link className="buyer-detail-link" to="/area/comprador/licitacoes">
              ← Todas as licitações
            </Link>
            <h2 className="buyer-auction-title">{auction.title}</h2>
            <p className="buyer-auction-description">{auction.lot}</p>
            <dl className="buyer-auction-facts">
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
                <dt>Oferta mais elevada no retrato</dt>
                <dd>
                  <PriceDisplay amountCents={auction.currentBid.amountCents} />
                </dd>
              </div>
              <div>
                <dt>Fim indicado no cenário</dt>
                <dd>
                  <time dateTime={auction.endsAt}>{buyerDate(auction.endsAt)}</time>
                </dd>
              </div>
            </dl>
            <BuyerBidList bids={[bid]} />
            <p className="buyer-snapshot-note">
              Dados fictícios, sem sala em direto, contagem decrescente ou envio de ofertas. O
              resultado de um leilão terminado não cria automaticamente uma encomenda nesta
              demonstração.
            </p>
            <Button to="/leiloes" variant="secondary">
              Conhecer os leilões públicos
            </Button>
          </>
        );
      }}
    </BuyerPageFrame>
  );
}
