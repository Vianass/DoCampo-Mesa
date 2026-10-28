import { createConnection, Types } from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import { createAuctionModel } from '../../src/modules/auctions/auction.model.js';
import {
  auctionCreate,
  auctionEditable,
  bidBody,
} from '../../src/modules/auctions/auction.validation.js';
import { auctionRecord, auctionInput } from '../support/auction-fixtures.js';
const connection = createConnection(),
  Auction = createAuctionModel(connection);
afterAll(async () => {
  await connection.close();
});
describe('schema de leilões e fronteira de escrita', () => {
  it('inicia no preço base sem criar comprador ou bid artificial', async () => {
    const a = new Auction(auctionRecord());
    await a.validate();
    expect(a.licitacaoAtual.valorCent).toBe(a.precoBaseCent);
    expect(a.sequencia).toBe(0);
    expect(a.licitacaoAtual.comprador).toBeNull();
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'incremento inválido %s',
    async (incrementoCent) => {
      await expect(
        new Auction({ ...auctionRecord(), incrementoCent }).validate(),
      ).rejects.toThrow();
    },
  );
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'preço base inválido %s',
    async (precoBaseCent) => {
      await expect(new Auction({ ...auctionRecord(), precoBaseCent }).validate()).rejects.toThrow();
    },
  );
  it('preço base zero mantém primeiro mínimo positivo', async () => {
    await new Auction({
      ...auctionRecord(),
      precoBaseCent: 0,
      licitacaoAtual: { valorCent: 0, comprador: null, bidId: null },
    }).validate();
    expect(auctionCreate.safeParse({ ...auctionInput(), precoBaseCent: 0 }).success).toBe(true);
  });
  it.each([0, 1, 251, -500])('rejeita quantidade fora da grelha %s', async (quantidade) => {
    const a = auctionRecord();
    a.lote.quantidade = quantidade;
    await expect(new Auction(a).validate()).rejects.toThrow();
  });
  it('valida a ordem das datas e não aceita datas atribuídas como strings no modelo', async () => {
    const a = auctionRecord();
    await expect(new Auction({ ...a, terminaEm: a.iniciaEm }).validate()).rejects.toThrow();
    await expect(
      new Auction({ ...a, iniciaEm: a.iniciaEm.toISOString() }).validate(),
    ).rejects.toThrow();
  });
  it('bloqueia liderança sem histórico e vencedor fictício', async () => {
    await expect(
      new Auction({
        ...auctionRecord(),
        licitacaoAtual: {
          valorCent: 30100,
          comprador: new Types.ObjectId(),
          bidId: new Types.ObjectId(),
        },
      }).validate(),
    ).rejects.toThrow();
    await expect(
      new Auction({
        ...auctionRecord(),
        estado: 'terminado',
        encerradoEm: new Date(),
        resultado: {
          tipo: 'vencedor',
          comprador: new Types.ObjectId(),
          bidId: new Types.ObjectId(),
          valorCent: 30000,
        },
      }).validate(),
    ).rejects.toThrow();
  });
  it('não permite mutação ou eliminação pelo modelo', async () => {
    await expect(new Auction(auctionRecord()).save()).rejects.toThrow('transação');
    await expect(Auction.hydrate(auctionRecord()).save()).rejects.toThrow('repositório');
    await expect(Auction.deleteMany({})).rejects.toThrow('histórico');
  });
  it.each([
    'produtorId',
    'comprador',
    'estado',
    'licitacaoAtual',
    'reserva',
    'versao',
    'resultado',
  ])('não aceita atribuição de campo interno %s', (field) => {
    expect(auctionCreate.safeParse({ ...auctionInput(), [field]: 'livre' }).success).toBe(false);
  });
  it('PUT exige os campos editáveis e não aceita trocar o produto/lote', () => {
    expect(auctionEditable.safeParse({ titulo: 'Só título' }).success).toBe(false);
    expect(auctionEditable.safeParse(auctionInput()).success).toBe(false);
  });
  it.each([0, -1, 1.1, NaN, Number.MAX_SAFE_INTEGER + 1, '30100'])(
    'licitação estrita recusa %s',
    (valorCent) => {
      expect(bidBody.safeParse({ valorCent }).success).toBe(false);
    },
  );
  it('não há índice TTL ou unicidade por nome, e modelos não expõem dados privados', () => {
    expect(Auction.schema.indexes().some(([, o]) => 'expireAfterSeconds' in o)).toBe(false);
    const v = JSON.stringify(new Auction(auctionRecord()).toJSON());
    expect(v).not.toContain('criacao');
    expect(v).not.toContain('produtor');
  });
});
