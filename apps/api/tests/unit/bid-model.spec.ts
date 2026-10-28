import { randomUUID } from 'node:crypto';
import { createConnection, Types } from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import { createBidModel } from '../../src/modules/auctions/bid.model.js';

const connection = createConnection(),
  Bid = createBidModel(connection);
afterAll(async () => {
  await connection.close();
});
function input() {
  return {
    leilao: new Types.ObjectId(),
    comprador: new Types.ObjectId(),
    valorCent: 31700,
    sequencia: 1,
    requestId: randomUUID(),
    requestHash: 'a'.repeat(64),
    aceiteEm: new Date(),
  };
}
describe('persistência imutável de licitações — validação isolada', () => {
  it('aceita cêntimos inteiros e sequência atribuída pelo serviço', async () => {
    await expect(new Bid(input()).validate()).resolves.toBeUndefined();
    expect(createBidModel(connection)).toBe(Bid);
  });
  it.each([0, -1, 31.7, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '31700'])(
    'recusa valor inválido %s',
    async (valorCent) => {
      await expect(new Bid({ ...input(), valorCent }).validate()).rejects.toThrow();
    },
  );
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'recusa sequência inválida %s',
    async (sequencia) => {
      await expect(new Bid({ ...input(), sequencia }).validate()).rejects.toThrow();
    },
  );
  it('não aceita campos arbitrários nem referências em falta', async () => {
    expect(() => new Bid({ ...input(), lider: true })).toThrow();
    await expect(new Bid({ ...input(), comprador: undefined }).validate()).rejects.toThrow();
    await expect(new Bid({ ...input(), leilao: undefined }).validate()).rejects.toThrow();
  });
  it('valida a identificação de repetição e a impressão digital', async () => {
    for (const values of [
      { requestId: 'com espaço' },
      { requestId: 'x'.repeat(129) },
      { requestHash: 'incorreto' },
    ])
      await expect(new Bid({ ...input(), ...values }).validate()).rejects.toThrow();
  });
  it('serializa documentos completos e parciais sem identidade privada ou chave', () => {
    const record = new Bid(input()).toJSON();
    expect(Object.keys(record).sort()).toEqual([
      'aceiteEm',
      'id',
      'leilaoId',
      'sequencia',
      'valorCent',
    ]);
    const partial = Bid.hydrate({ _id: new Types.ObjectId(), valorCent: 31700 }).toJSON();
    expect(partial).toMatchObject({ valorCent: 31700 });
    expect(partial).not.toHaveProperty('comprador');
    expect(partial).not.toHaveProperty('requestHash');
  });
  it('não permite inserir fora de uma transação nem alterar um bid já aceite', async () => {
    await expect(new Bid(input()).save()).rejects.toThrow('transação');
    await expect(Bid.hydrate({ _id: new Types.ObjectId(), ...input() }).save()).rejects.toThrow(
      'imutável',
    );
    await expect(
      Bid.hydrate({ _id: new Types.ObjectId(), ...input() }).deleteOne(),
    ).rejects.toThrow('Não eliminar');
    await expect(Bid.deleteMany({})).rejects.toThrow('Não eliminar');
  });
  it('os dois índices únicos cobrem ordem e repetição sem índice redundante', () => {
    const indexes = Bid.schema.indexes();
    expect(indexes).toHaveLength(2);
    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ leilao: 1, sequencia: 1 }, { unique: true }],
        [{ leilao: 1, comprador: 1, requestId: 1 }, { unique: true }],
      ]),
    );
  });
});
