import { useParams, useSearchParams } from 'react-router';
import { Button } from '../../../components/Button';
import { PriceDisplay } from '../../../components/PriceDisplay';
import { buyerDate } from '../../../features/buyer/selectors';
import { AdminPageFrame } from '../../../features/admin/AdminPageFrame';
import { AdminBadge, AdminEmpty, AdminFilters } from '../../../features/admin/AdminComponents';
import {
  adminHome,
  auctionLabels,
  byId,
  filterOptions,
  selectAdminAuctions,
} from '../../../features/admin/selectors';
export default function AdminAuctionsPage({ detail = false }: { detail?: boolean }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const options = filterOptions(params, auctionLabels);
  return (
    <AdminPageFrame
      title={detail ? 'O retrato de um lote.' : 'Acompanhar os leilões.'}
      description="Lotes agendados, ativos e terminados num retrato fixo de 15 de outubro de 2026, 09:00 UTC. Sem licitações reais ou comunicação em tempo real."
    >
      {(data) => {
        if (detail) {
          const auction = byId(data.auctions, id);
          if (!auction) return <AdminEmpty section="leiloes" missing />;
          const product = byId(data.products, auction.productId ?? undefined);
          return (
            <section className="admin-auction-detail">
              <div className="admin-section-heading">
                <h2>{auction.title}</h2>
                <AdminBadge pending={auction.state === 'ativo'}>
                  {auctionLabels[auction.state]} · retrato simulado
                </AdminBadge>
              </div>
              <p>{auction.lot}</p>
              <Button to={adminHome + '/produtores/' + auction.producerId} variant="text">
                {auction.producerName}
              </Button>
              <dl className="admin-facts">
                <div>
                  <dt>Início</dt>
                  <dd>{buyerDate(auction.startsAt)}</dd>
                </div>
                <div>
                  <dt>Fim</dt>
                  <dd>{buyerDate(auction.endsAt)}</dd>
                </div>
                <div>
                  <dt>Preço base</dt>
                  <dd>
                    <PriceDisplay amountCents={auction.basePriceCents} />
                  </dd>
                </div>
                <div>
                  <dt>Incremento mínimo</dt>
                  <dd>
                    <PriceDisplay amountCents={auction.incrementCents} />
                  </dd>
                </div>
                <div>
                  <dt>Ofertas aceites no retrato</dt>
                  <dd>{auction.bidCount}</dd>
                </div>
                <div>
                  <dt>Oferta mais elevada</dt>
                  <dd>
                    {auction.currentBid ? (
                      <>
                        <PriceDisplay amountCents={auction.currentBid.amountCents} /> · sequência{' '}
                        {auction.currentBid.sequence}
                      </>
                    ) : (
                      'Ainda sem ofertas.'
                    )}
                  </dd>
                </div>
              </dl>
              <h3>Produto e resultado.</h3>
              {product ? (
                <p>
                  Referência ilustrativa:{' '}
                  <Button to={'/produtos/' + product.id} variant="text">
                    {product.name}
                  </Button>{' '}
                  Sem reserva de stock ou decisão sobre Q07.
                </p>
              ) : (
                <p>Lote independente, sem produto individual associado neste exemplo.</p>
              )}
              {auction.result?.kind === 'adjudicado' ? (
                <p className="admin-auction-result">
                  Resultado fictício: adjudicado a{' '}
                  {byId(data.users, auction.result.winnerId)?.displayName ??
                    'participante fictício'}{' '}
                  por <PriceDisplay amountCents={auction.result.amountCents} />. Oferta{' '}
                  {auction.result.bidId}.
                </p>
              ) : (
                <p className="admin-auction-result">
                  {auction.result?.kind === 'sem_licitacoes'
                    ? 'Terminado sem ofertas e sem vencedor.'
                    : 'Resultado ainda não disponível neste retrato.'}
                </p>
              )}
              <p className="admin-help">
                Não se apresenta um histórico completo de ofertas. Identidade, sequência, fecho e
                adjudicação reais dependem do servidor e de D06/D07.
              </p>
              <Button to={adminHome + '/leiloes'} variant="secondary">
                Voltar aos leilões
              </Button>
            </section>
          );
        }
        const list = selectAdminAuctions(data, options.search, options.status);
        return (
          <>
            <AdminFilters label="leilões" options={auctionLabels} {...options} />
            <p className="admin-result-count">{list.length} leilões demonstrativos</p>
            {!list.length ? (
              <AdminEmpty section="leiloes" />
            ) : (
              <ul className="admin-list admin-auction-list">
                {list.map((a) => (
                  <li key={a.id}>
                    <div>
                      <h2>{a.title}</h2>
                      <p>
                        {a.producerName} · {a.lot}
                      </p>
                      <AdminBadge pending={a.state === 'ativo'}>
                        {auctionLabels[a.state]}
                      </AdminBadge>
                      <p>
                        {a.bidCount} ofertas ·{' '}
                        {a.currentBid ? (
                          <>
                            mais elevada: <PriceDisplay amountCents={a.currentBid.amountCents} />
                          </>
                        ) : (
                          <>
                            sem ofertas · base: <PriceDisplay amountCents={a.basePriceCents} />
                          </>
                        )}
                      </p>
                    </div>
                    <Button to={adminHome + '/leiloes/' + a.id} variant="text">
                      Consultar leilão
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      }}
    </AdminPageFrame>
  );
}
