import { useLocation } from 'react-router';
import { Button } from '../../components/Button';
import { objectId } from '../api/catalog-contract';
import { AuthorizedAuctionDetail } from './AuctionDetailPage';
export default function BuyerAuctionsArea() {
  const id = useLocation().pathname.split('/')[4];
  if (id && objectId(id)) return <AuthorizedAuctionDetail id={id} />;
  return (
    <section className="auction-management">
      <header className="auction-room-intro">
        <p className="eyebrow">O teu mercado · Leilões</p>
        <h1>Há colheitas que merecem a tua oferta.</h1>
        <p>
          Entra num lote para acompanhar o valor em direto, apresentar uma oferta e consultar as
          tuas participações no respetivo histórico.
        </p>
        <Button to="/leiloes">Encontrar o próximo lote ↗</Button>
      </header>
      <div className="auction-notice">
        <h2>As tuas ofertas, em cada leilão.</h2>
        <p>
          O histórico de cada lote identifica as tuas ofertas. Uma listagem global das tuas
          participações ainda não está disponível; não apresentamos atividade ilustrativa como sendo
          tua.
        </p>
      </div>
    </section>
  );
}
