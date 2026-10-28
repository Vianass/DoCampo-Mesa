import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import {
  realtimeFixture,
  connectClient,
  command,
  nextEvent,
} from '../tests/support/realtime-fixtures.js';
import type { BidAccepted } from '../src/realtime/auction.protocol.js';

if (process.env.DOCAMPO_AUCTION_DEMO !== '1' || process.env.NODE_ENV === 'production') {
  throw Error(
    'Usa DOCAMPO_AUCTION_DEMO=1 fora de produção. Apenas MongoDB de teste local é permitido.',
  );
}
const fixture = await realtimeFixture();
let closed: Promise<void> | undefined;
const close = () => (closed ??= fixture.close());
const interrupted = () => {
  void close().finally(() => {
    process.exitCode = 130;
  });
};
process.once('SIGINT', interrupted);
process.once('SIGTERM', interrupted);
try {
  const subject = await fixture.subject(2);
  const auction = await fixture.service.create(
    subject.seller,
    { ...subject.body, terminaEm: new Date(Date.now() + 8000).toISOString() },
    randomUUID(),
  );
  const body = { leilaoId: auction.body.id },
    [a, b] = subject.buyerTokens.map((token) => fixture.client(token));
  assert(a && b);
  await Promise.all([connectClient(a), connectClient(b)]);
  assert((await command(a, 'auction:join', body)).ok);
  assert((await command(b, 'auction:join', body)).ok);
  console.info(
    'Dois compradores fictícios ligados ao mesmo leilão; lote reservado no MongoDB de teste.',
  );
  const seenByB = nextEvent(b, 'auction:updated', (s) => s.sequencia === 1);
  const first = await command<BidAccepted>(a, 'auction:bid', {
    ...body,
    valorCent: 30100,
    requestId: randomUUID(),
  });
  assert(first.ok);
  assert.equal((await seenByB).bidId, first.data.licitacao.id);
  console.info('A licitou 301,00 €; B recebeu a versão 1 confirmada.');
  const seenByA = nextEvent(a, 'auction:updated', (s) => s.sequencia === 2);
  const second = await command<BidAccepted>(b, 'auction:bid', {
    ...body,
    valorCent: 30500,
    requestId: randomUUID(),
  });
  assert(second.ok);
  assert.equal((await seenByA).bidId, second.data.licitacao.id);
  const currentA = await command(a, 'auction:state', body),
    currentB = await command(b, 'auction:state', body);
  assert(currentA.ok && currentB.ok);
  assert.deepEqual(currentA.data.lider, currentB.data.lider);
  console.info('B licitou 305,00 €; A recebeu a versão 2. Ambos observam a mesma liderança.');
  const [finalA, finalB] = await Promise.all([
    nextEvent(a, 'auction:ended'),
    nextEvent(b, 'auction:ended'),
  ]);
  assert.deepEqual(finalA, finalB);
  assert.equal(finalA.resultado?.bidId, second.data.licitacao.id);
  const persisted = await fixture.connection
    .db!.collection('auctions')
    .findOne({ _id: new Types.ObjectId(auction.body.id) });
  assert.equal(persisted!.estado, 'terminado');
  assert.equal(persisted!.resultado.comprador.toHexString(), subject.buyers[1]!.id);
  assert.equal(persisted!.reserva.estado, 'afeta_vencedor');
  assert.equal(
    await fixture.connection.db!.collection('bids').countDocuments({ leilao: persisted!._id }),
    2,
  );
  console.info(
    'Ambos receberam o encerramento versão 3; vencedor, valor e duas ofertas confirmados no MongoDB.',
  );
} finally {
  await close();
  process.off('SIGINT', interrupted);
  process.off('SIGTERM', interrupted);
}
console.info(
  'DEMONSTRAÇÃO APROVADA. Servidor, clientes e base temporária removidos; sem encomenda ou pagamento.',
);
