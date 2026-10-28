import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { checkoutScenario, seedCheckoutScenario } from './checkout-fixtures.js';
import { userInput } from './identity-fixtures.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import type { AuthPrincipal } from '../../src/modules/auth/auth.service.js';
import type { AuctionRecord } from '../../src/modules/auctions/auction.types.js';

export function auctionInput(productId = new Types.ObjectId().toHexString()) {
  return {
    produtoId: productId,
    quantidade: 500,
    titulo: 'Lote agrícola fictício',
    descricao: 'Lote para ensaios isolados.',
    precoBaseCent: 30000,
    incrementoCent: 100,
    terminaEm: new Date(Date.now() + 120000).toISOString(),
  };
}
export async function seedAuctionActors(connection: Connection, buyers = 2) {
  const scenario = await seedCheckoutScenario(connection, checkoutScenario());
  const ids = [scenario.buyerId];
  for (let i = 1; i < buyers; i++) {
    const _id = new Types.ObjectId();
    await createUserModel(connection).create(
      userInput({
        _id,
        emailNormalizado: _id.toHexString() + '@example.invalid',
        papeis: ['comprador'],
      }),
    );
    ids.push(_id);
  }
  const principal = (id: Types.ObjectId, role: 'produtor' | 'comprador'): AuthPrincipal => ({
    id: id.toHexString(),
    nome: 'Conta fictícia',
    email: id.toHexString() + '@example.invalid',
    papeis: [role],
  });
  return {
    scenario,
    seller: principal(scenario.producers[0]!.userId, 'produtor'),
    buyers: ids.map((id) => principal(id, 'comprador')),
    body: auctionInput(scenario.products[0]!._id.toHexString()),
  };
}
export function auctionRecord(): AuctionRecord {
  const now = new Date();
  return {
    _id: new Types.ObjectId(),
    produtor: new Types.ObjectId(),
    produto: new Types.ObjectId(),
    produtorPublico: { perfilId: new Types.ObjectId(), nome: 'Origem fictícia' },
    titulo: 'Lote fictício',
    descricao: 'Descrição do lote fictício.',
    lote: {
      nome: 'Produto fictício',
      quantidade: 500,
      unidadeVenda: {
        modalidade: 'peso',
        unidadeBase: 'g',
        quantidadeReferencia: 1000,
        quantidadeMinima: 250,
        incrementoCompra: 50,
      },
    },
    precoBaseCent: 30000,
    incrementoCent: 100,
    iniciaEm: now,
    terminaEm: new Date(now.getTime() + 120000),
    estado: 'ativo',
    licitacaoAtual: { valorCent: 30000, comprador: null, bidId: null },
    sequencia: 0,
    versao: 0,
    reserva: { estado: 'reservada', reposta: 0, pendente: 0 },
    criacao: { chave: randomUUID(), hash: 'a'.repeat(64) },
    historico: [{ tipo: 'criado', origem: 'sistema', ocorridoEm: now }],
    createdAt: now,
    updatedAt: now,
  };
}
