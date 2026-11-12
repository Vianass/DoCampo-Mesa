import { Button } from '../../components/Button';
import { PriceDisplay } from '../../components/PriceDisplay';
import type { AuctionDetail } from './contracts';

export function AuctionPurchaseNotice({ detail }: { detail: AuctionDetail }) {
  if (detail.estado !== 'terminado' || detail.resultado?.tipo !== 'vencedor' || !detail.compra)
    return null;
  const winner = detail.lider?.proprio && !detail.reserva;
  return (
    <section className="auction-final" aria-label="Compra do lote">
      <h2>{winner ? 'Parabéns! Ganhaste este leilão.' : 'Venda do lote'}</h2>
      <p>
        {detail.lote.nome} · {detail.produtor.nome} ·{' '}
        <PriceDisplay amountCents={detail.resultado.valorCent!} />
      </p>
      <p>
        {detail.compra.estado === 'confirmada'
          ? 'Encomenda criada.'
          : 'Compra pendente de confirmação pelo vencedor.'}
      </p>
      {detail.compra.encomendaId ? (
        <Button
          to={
            '/area/' +
            (detail.reserva ? 'produtor' : 'comprador') +
            '/encomendas/' +
            detail.compra.encomendaId
          }
        >
          Consultar encomenda do leilão
        </Button>
      ) : winner ? (
        <Button to={'/checkout/leilao/' + detail.id}>Finalizar compra</Button>
      ) : null}
    </section>
  );
}
