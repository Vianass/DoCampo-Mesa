import { Schema, mongo, Types } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { dateField, requireDocumentValidation, textField } from '../shared/model-validation.js';
import { requireOperationSession } from '../concurrency/operation-session.js';
import { validateOrderLineQuantity, validateOrderSaleUnit } from '../orders/order.calculations.js';
import { auctionStates } from './auction.types.js';
import type { AuctionRecord } from './auction.types.js';
const options = { _id: false, strict: 'throw', versionKey: false } as const;
const integer = (min = 0) => ({
  type: Number,
  required: true,
  cast: false,
  min,
  max: Number.MAX_SAFE_INTEGER,
  validate: { validator: Number.isSafeInteger, message: 'Inteiro seguro obrigatório.' },
});
const reference = (ref: string) => ({ type: Schema.Types.ObjectId, ref, required: true });
export function createAuctionModel(connection: Connection): Model<AuctionRecord> {
  const existing = connection.models.Auction as Model<AuctionRecord> | undefined;
  if (existing) return existing;
  const lote = new Schema<AuctionRecord['lote']>(
    {
      nome: textField('nome', 180),
      quantidade: integer(1),
      unidadeVenda: { type: Schema.Types.Mixed, required: true },
    },
    options,
  );
  const result = new Schema<NonNullable<AuctionRecord['resultado']>>(
    {
      tipo: { type: String, enum: ['sem_licitacoes', 'vencedor'], required: true },
      comprador: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      bidId: { type: Schema.Types.ObjectId, ref: 'Bid', default: null },
      valorCent: {
        type: Number,
        cast: false,
        default: null,
        validate: {
          validator: (v: unknown) =>
            v === null || (typeof v === 'number' && Number.isSafeInteger(v) && v > 0),
          message: 'Valor final inválido.',
        },
      },
    },
    options,
  );
  const schema = new Schema<AuctionRecord>(
    {
      produtor: reference('User'),
      produto: reference('Product'),
      produtorPublico: {
        type: new Schema<AuctionRecord['produtorPublico']>(
          { perfilId: reference('ProducerProfile'), nome: textField('nome', 160) },
          options,
        ),
        required: true,
      },
      titulo: textField('titulo', 180),
      descricao: textField('descricao', 5000),
      lote: { type: lote, required: true },
      precoBaseCent: integer(),
      incrementoCent: integer(1),
      iniciaEm: dateField('iniciaEm'),
      terminaEm: dateField('terminaEm'),
      estado: { type: String, enum: auctionStates, required: true },
      licitacaoAtual: {
        type: new Schema<AuctionRecord['licitacaoAtual']>(
          {
            valorCent: integer(),
            comprador: { type: Schema.Types.ObjectId, ref: 'User', default: null },
            bidId: { type: Schema.Types.ObjectId, ref: 'Bid', default: null },
          },
          options,
        ),
        required: true,
      },
      sequencia: integer(),
      versao: integer(),
      reserva: {
        type: new Schema<AuctionRecord['reserva']>(
          {
            estado: {
              type: String,
              enum: ['reservada', 'afeta_vencedor', 'libertada', 'libertacao_pendente'],
              required: true,
            },
            reposta: integer(),
            pendente: integer(),
          },
          options,
        ),
        required: true,
      },
      resultado: { type: result, default: undefined },
      encerradoEm: { ...dateField('encerradoEm'), required: false },
      criacao: {
        type: new Schema<AuctionRecord['criacao']>(
          {
            chave: { ...textField('chave', 128), match: /^[\x21-\x7e]{1,128}$/ },
            hash: { ...textField('hash', 64), match: /^[a-f0-9]{64}$/ },
          },
          options,
        ),
        required: true,
        select: false,
      },
      historico: {
        type: [
          new Schema<AuctionRecord['historico'][number]>(
            {
              tipo: textField('tipo', 80),
              ocorridoEm: dateField('ocorridoEm'),
              origem: { type: String, enum: ['produtor', 'sistema'], required: true },
              ator: { type: Schema.Types.ObjectId, ref: 'User' },
            },
            options,
          ),
        ],
        required: true,
        castNonArrays: false,
        default: undefined,
      },
      createdAt: dateField('createdAt'),
      updatedAt: dateField('updatedAt'),
    },
    {
      collection: 'auctions',
      strict: 'throw',
      versionKey: false,
      autoCreate: false,
      autoIndex: false,
      bufferCommands: false,
      toJSON: {
        transform: (_doc, value) => ({
          ...(value._id instanceof Types.ObjectId ? { id: value._id.toHexString() } : {}),
          estado: value.estado,
          sequencia: value.sequencia,
        }),
      },
      toObject: {
        transform: (_doc, value) => ({
          ...(value._id instanceof Types.ObjectId ? { id: value._id.toHexString() } : {}),
          estado: value.estado,
          sequencia: value.sequencia,
        }),
      },
    },
  );
  schema.pre('validate', function () {
    if (!(this.terminaEm > this.iniciaEm))
      this.invalidate('terminaEm', 'O fim deve ser posterior ao início.');
    if (
      Number.isSafeInteger(this.precoBaseCent) &&
      Number.isSafeInteger(this.incrementoCent) &&
      BigInt(this.precoBaseCent) + BigInt(this.incrementoCent) > BigInt(Number.MAX_SAFE_INTEGER)
    )
      this.invalidate('precoBaseCent', 'Limite de representação excedido.');
    try {
      validateOrderSaleUnit(this.lote.unidadeVenda);
      validateOrderLineQuantity(this.lote.quantidade, this.lote.unidadeVenda, this.lote.quantidade);
    } catch {
      this.invalidate('lote', 'Quantidade ou unidade inválida.');
    }
    if (!this.lote || !this.licitacaoAtual || !this.reserva) {
      this.invalidate('lote', 'Documento incompleto.');
      return;
    }
    const b = this.licitacaoAtual;
    if (
      this.sequencia === 0
        ? b.valorCent !== this.precoBaseCent || b.comprador !== null || b.bidId !== null
        : !(b.comprador instanceof Types.ObjectId) ||
          !(b.bidId instanceof Types.ObjectId) ||
          b.valorCent < this.precoBaseCent + this.incrementoCent
    )
      this.invalidate('licitacaoAtual', 'Oferta e sequência incompatíveis.');
    const terminal = ['terminado', 'cancelado'].includes(this.estado);
    if (terminal !== !!this.encerradoEm || (this.estado === 'terminado') !== !!this.resultado)
      this.invalidate('estado', 'Resultado e encerramento incompatíveis.');
    if (this.estado === 'cancelado' && this.sequencia !== 0)
      this.invalidate('estado', 'Não cancelar após uma oferta aceite.');
    if (this.resultado) {
      const r = this.resultado;
      if (
        this.sequencia === 0
          ? r.tipo !== 'sem_licitacoes' ||
            r.comprador !== null ||
            r.bidId !== null ||
            r.valorCent !== null
          : r.tipo !== 'vencedor' ||
            !r.comprador?.equals(b.comprador!) ||
            !r.bidId?.equals(b.bidId!) ||
            r.valorCent !== b.valorCent
      )
        this.invalidate('resultado', 'Resultado incompatível com a última oferta.');
    }
    const reserve = this.reserva;
    const held = !terminal || (this.estado === 'terminado' && this.sequencia > 0);
    const expectedReserve = held
      ? this.estado === 'terminado'
        ? 'afeta_vencedor'
        : 'reservada'
      : reserve.pendente > 0
        ? 'libertacao_pendente'
        : 'libertada';
    if (
      reserve.estado !== expectedReserve ||
      (held && (reserve.reposta !== 0 || reserve.pendente !== 0)) ||
      reserve.reposta + reserve.pendente > this.lote.quantidade ||
      (terminal &&
        this.sequencia === 0 &&
        reserve.reposta + reserve.pendente !== this.lote.quantidade)
    )
      this.invalidate('reserva', 'Saldo incompatível.');
    if (!this.historico?.length) this.invalidate('historico', 'Falta auditoria.');
    if (
      mongo.BSON.calculateObjectSize(this.toObject({ transform: false })) + 65536 >
      16 * 1024 * 1024
    )
      this.invalidate('historico', 'Capacidade de auditoria excedida.');
  });
  requireDocumentValidation(schema);
  schema.pre('save', function () {
    if (!this.isNew) throw Error('Alterações de leilão exigem o repositório condicional.');
    requireOperationSession(this.$session() ?? undefined, true);
  });
  schema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function () {
    throw Error('Não eliminar o histórico de leilões.');
  });
  schema.pre('deleteOne', { document: true, query: false }, function () {
    throw Error('Não eliminar o histórico de leilões.');
  });
  schema.index({ produtor: 1, createdAt: -1 });
  schema.index({ estado: 1, terminaEm: 1 });
  schema.index({ estado: 1, iniciaEm: 1 });
  schema.index({ produtor: 1, 'criacao.chave': 1 }, { unique: true });
  schema.index(
    { 'reserva.pendente': 1 },
    { partialFilterExpression: { 'reserva.pendente': { $gt: 0 } } },
  );
  return connection.model<AuctionRecord>('Auction', schema);
}
