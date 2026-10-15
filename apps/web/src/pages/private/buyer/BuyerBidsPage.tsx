import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { BuyerPageFrame } from '../../../features/buyer/BuyerPageFrame';
import { BuyerBidList } from '../../../features/buyer/BuyerBidList';
import { selectBids } from '../../../features/buyer/selectors';

export default function BuyerBidsPage() {
  return (
    <BuyerPageFrame
      title="As minhas licitações."
      description="As colheitas que despertaram a tua curiosidade, num retrato de participações ilustrativas."
    >
      {(data) => {
        const bids = selectBids(data);
        return (
          <section aria-labelledby="buyer-bids-title">
            <h2 id="buyer-bids-title" className="visually-hidden">
              Lista de participações demonstrativas
            </h2>
            {bids.length ? (
              <BuyerBidList bids={bids} />
            ) : (
              <EmptyState
                title="Ainda sem ofertas neste cenário."
                description="Podes conhecer a proposta pública de leilões. Nenhuma oferta real pode ser enviada nesta fase."
                action={
                  <Button to="/leiloes" variant="secondary">
                    Conhecer os leilões
                  </Button>
                }
              />
            )}
          </section>
        );
      }}
    </BuyerPageFrame>
  );
}
