import { Error as MongooseError, Schema, Types, mongo } from 'mongoose';
import type { Connection, HydratedDocument, Model } from 'mongoose';
import { saleModalities } from '../products/product.constants.js';
import { dateField, requireDocumentValidation, textField } from '../shared/model-validation.js';
import { userRoles } from '../users/user.model.js';
import {
  orderCancellationRequestStates,
  orderComplaintStates,
  orderCompletionModes,
  orderCurrency,
  orderPaymentMethods,
  orderPaymentStates,
  orderPeriodProposalStates,
  orderReceptionDurationMs,
  orderStates,
} from './order.constants.js';
import type {
  OrderActor,
  OrderAuditEvent,
  OrderCancellation,
  OrderCancellationRequest,
  OrderComplaint,
  OrderDelivery,
  OrderDeliverySnapshot,
  OrderIdempotency,
  OrderLineRecord,
  OrderOriginalReceipt,
  OrderPayment,
  OrderPeriod,
  OrderPeriodProposal,
  OrderReception,
  OrderRecord,
  OrderSaleUnit,
  OrderStockMovement,
  OrderStockRestoration,
} from './order.types.js';
import { serializeOrderSummary } from './order.serialization.js';
import {
  orderPersistenceSafety,
  validateOrderEvolution,
  validateOrderPersistence,
} from './order.validation.js';

const subOptions = { _id: false, versionKey: false, strict: 'throw' } as const;
const id = () => ({
  ...textField('id', orderPersistenceSafety.identifierCharacters),
  set(value: unknown) {
    if (value === undefined || value === null || typeof value === 'string') return value;
    throw new MongooseError.CastError('String', '[tipo inválido]', 'id');
  },
});
const reference = (ref: 'User' | 'Product' | 'Order') => ({
  type: Schema.Types.ObjectId,
  ref,
  required: true,
});
function integer(minimum = 0) {
  return {
    type: Number,
    cast: false,
    required: true,
    min: minimum,
    validate: { validator: Number.isSafeInteger, message: 'É necessário um inteiro seguro.' },
  };
}
function list<T>(schema: Schema<T>, required = false) {
  return {
    type: [schema],
    castNonArrays: false,
    default: required ? undefined : () => [],
    required,
    validate: {
      validator: (items: unknown[]) =>
        Array.isArray(items) &&
        items.every((item) => item != null) &&
        (!required || items.length > 0),
      message: 'Lista estruturada inválida.',
    },
  };
}
function raw(document: HydratedDocument<OrderRecord>): OrderRecord {
  return document.toObject({
    transform: false,
    depopulate: true,
    virtuals: false,
    getters: false,
  }) as OrderRecord;
}
function remember(document: HydratedDocument<OrderRecord>) {
  document.$locals.orderBaseline = mongo.BSON.deserialize(mongo.BSON.serialize(raw(document)));
}

function selectionPaths<T>(schema: Schema<T>, prefix = ''): string[] {
  const fields: string[] = [];
  schema.eachPath((name, path) => {
    const full = prefix + name;
    fields.push(full);
    const nested = (path as typeof path & { schema?: Schema }).schema;
    if (nested) fields.push(...selectionPaths(nested, full + '.'));
  });
  return fields;
}

/** Factory isolada: não regista outros modelos nem liga o módulo ao runtime HTTP. */
export function createOrderModel(connection: Connection): Model<OrderRecord> {
  const existing = connection.models.Order as Model<OrderRecord> | undefined;
  if (existing) return existing;

  const actor = new Schema<OrderActor>(
    {
      tipo: { type: String, enum: ['utilizador', 'sistema'], required: true, cast: false },
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required(this: OrderActor) {
          return this.tipo === 'utilizador';
        },
      },
      papelNaAcao: {
        type: String,
        enum: userRoles,
        cast: false,
        required(this: OrderActor) {
          return this.tipo === 'utilizador';
        },
      },
      identificador: {
        ...id(),
        required(this: OrderActor) {
          return this.tipo === 'sistema';
        },
      },
    },
    subOptions,
  );
  actor.pre('validate', function () {
    if (
      (this.tipo === 'sistema' &&
        (this.get('userId') !== undefined || this.get('papelNaAcao') !== undefined)) ||
      (this.tipo === 'utilizador' && this.get('identificador') !== undefined)
    )
      this.invalidate('tipo', 'Ator técnico e conta são representações distintas.');
  });
  const auditDefinition = {
    id: id(),
    comandoId: id(),
    tipo: id(),
    ator: { type: actor, required: true },
    ocorridoEm: dateField('ocorridoEm'),
    de: { ...id(), required: false },
    para: { ...id(), required: false },
    justificacao: textField('justificacao', orderPersistenceSafety.eventTextCharacters, false),
    conteudo: textField('conteudo', orderPersistenceSafety.eventTextCharacters, false),
    versaoObservada: integer(),
  };
  const audit = new Schema<OrderAuditEvent>(auditDefinition, subOptions);
  function stateAudit(states: readonly string[]) {
    return new Schema<OrderAuditEvent>(
      {
        ...auditDefinition,
        de: { type: String, enum: states, cast: false },
        para: { type: String, enum: states, cast: false },
      },
      subOptions,
    );
  }
  const stateHistory = stateAudit(orderStates);
  const paymentHistory = stateAudit(orderPaymentStates);
  const complaintHistory = stateAudit(orderComplaintStates);
  const cancellationHistory = stateAudit(orderCancellationRequestStates);
  const periodHistory = stateAudit(orderPeriodProposalStates);
  const period = new Schema<OrderPeriod>(
    {
      inicioEm: dateField('inicioEm'),
      fimEm: dateField('fimEm'),
      fusoHorario: textField('fusoHorario', 100),
    },
    subOptions,
  );
  const content = new Schema(
    {
      quantidade: integer(1),
      unidade: { type: String, enum: ['g', 'ml', 'un'], required: true, cast: false },
    },
    subOptions,
  );
  const unit = new Schema<OrderSaleUnit>(
    {
      modalidade: { type: String, enum: saleModalities, required: true, cast: false },
      unidadeBase: { type: String, enum: ['g', 'ml', 'un'], required: true, cast: false },
      quantidadeReferencia: integer(1),
      quantidadeMinima: integer(1),
      incrementoCompra: integer(1),
      rotulo: textField('rotulo', undefined, false),
      conteudoPorUnidade: { type: content, default: undefined },
    },
    subOptions,
  );
  const line = new Schema<OrderLineRecord>(
    {
      id: id(),
      produto: reference('Product'),
      nome: textField('nome'),
      quantidade: integer(1),
      precoReferenciaCent: integer(1),
      unidadeSnapshot: { type: unit, required: true },
      versaoUnidade: integer(),
      subtotalCent: integer(1),
    },
    subOptions,
  );
  const proposal = new Schema<OrderPeriodProposal>(
    {
      id: id(),
      periodo: { type: period, required: true },
      estado: { type: String, enum: orderPeriodProposalStates, required: true, cast: false },
      historico: list(periodHistory, true),
    },
    subOptions,
  );
  const snapshot = new Schema<OrderDeliverySnapshot>(
    {
      tipo: { type: String, enum: ['entrega', 'levantamento'], required: true, cast: false },
      periodoInicial: { type: period, required: true },
      taxaEntregaCent: integer(),
      versaoConfiguracao: integer(),
      concelhoId: {
        ...id(),
        required(this: OrderDeliverySnapshot) {
          return this.tipo === 'entrega';
        },
      },
      morada: {
        ...textField('morada'),
        required(this: OrderDeliverySnapshot) {
          return this.tipo === 'entrega';
        },
      },
      contacto: {
        ...textField('contacto'),
        required(this: OrderDeliverySnapshot) {
          return this.tipo === 'entrega';
        },
      },
      localLevantamento: {
        ...textField('localLevantamento'),
        required(this: OrderDeliverySnapshot) {
          return this.tipo === 'levantamento';
        },
      },
    },
    subOptions,
  );
  snapshot.pre('validate', function () {
    if (
      this.tipo === 'levantamento' &&
      ['morada', 'contacto', 'concelhoId'].some((field) => this.get(field) !== undefined)
    )
      this.invalidate('tipo', 'Levantamento não usa morada/contacto privados de entrega.');
    if (this.tipo === 'entrega' && this.get('localLevantamento') !== undefined)
      this.invalidate('tipo', 'Entrega não usa local de levantamento.');
  });
  const agreement = new Schema(
    {
      origem: { type: String, enum: ['inicial', 'proposta'], required: true, cast: false },
      propostaId: {
        ...id(),
        required(this: { origem: string }) {
          return this.origem === 'proposta';
        },
      },
    },
    subOptions,
  );
  agreement.pre('validate', function () {
    if (this.origem === 'inicial' && this.propostaId !== undefined)
      this.invalidate('propostaId', 'Acordo inicial não referencia proposta.');
  });
  const delivery = new Schema<OrderDelivery>(
    {
      snapshot: { type: snapshot, required: true },
      acordoAtual: { type: agreement, required: true },
      propostas: list(proposal),
    },
    subOptions,
  );
  const payment = new Schema<OrderPayment>(
    {
      metodo: { type: String, enum: orderPaymentMethods, required: true, cast: false },
      estado: { type: String, enum: orderPaymentStates, required: true, cast: false },
      historico: list(paymentHistory, true),
    },
    subOptions,
  );
  const request = new Schema<OrderCancellationRequest>(
    {
      id: id(),
      estado: { type: String, enum: orderCancellationRequestStates, required: true, cast: false },
      motivo: textField('motivo', orderPersistenceSafety.reasonCharacters),
      criadoEm: dateField('criadoEm'),
      historico: list(cancellationHistory, true),
    },
    subOptions,
  );
  const movement = new Schema<OrderStockMovement>(
    { ...auditDefinition, quantidade: integer(1), capacidadeObservada: integer() },
    subOptions,
  );
  const restoration = new Schema<OrderStockRestoration>(
    {
      linhaId: id(),
      produto: reference('Product'),
      unidadeSnapshot: { type: unit, required: true },
      versaoUnidade: integer(),
      debitada: integer(1),
      autorizada: integer(),
      reposta: integer(),
      pendente: integer(),
      naoRepor: integer(),
      movimentos: list(movement),
    },
    subOptions,
  );
  const cancellation = new Schema<OrderCancellation>(
    {
      estadoAnterior: { type: String, enum: orderStates, required: true, cast: false },
      pedidoId: { ...id(), required: false },
      motivo: textField('motivo', orderPersistenceSafety.reasonCharacters),
      historico: list(audit, true),
      reposicoes: list(restoration),
    },
    subOptions,
  );
  const nullableDate = (path: string) => ({
    type: Date,
    required: false,
    default: null,
    set(value: unknown) {
      if (value === null || value === undefined || value instanceof Date) return value;
      throw new MongooseError.CastError('Date', '[tipo inválido]', path);
    },
    validate: {
      validator: (value: Date | null) =>
        value === null || (value instanceof Date && Number.isFinite(value.getTime())),
      message: 'Data inválida.',
    },
  });
  const reception = new Schema<OrderReception>(
    {
      duracaoMs: { ...integer(), enum: [orderReceptionDurationMs] },
      decorridoMs: integer(),
      entregaDeclaradaEm: { ...dateField('entregaDeclaradaEm'), required: false },
      confirmacaoRececaoEm: { ...dateField('confirmacaoRececaoEm'), required: false },
      ultimoInicioEm: nullableDate('ultimoInicioEm'),
      pausadoDesde: nullableDate('pausadoDesde'),
      limiteAtualEm: nullableDate('limiteAtualEm'),
      concluidaEm: { ...dateField('concluidaEm'), required: false },
      modoConclusao: { type: String, enum: orderCompletionModes, cast: false },
      motivoConclusao: textField(
        'motivoConclusao',
        orderPersistenceSafety.eventTextCharacters,
        false,
      ),
      historico: list(audit),
    },
    subOptions,
  );
  const complaint = new Schema<OrderComplaint>(
    {
      id: id(),
      motivo: textField('motivo', orderPersistenceSafety.reasonCharacters),
      descricao: textField('descricao', orderPersistenceSafety.complaintCharacters),
      estado: { type: String, enum: orderComplaintStates, required: true, cast: false },
      criadaEm: dateField('criadaEm'),
      historico: list(complaintHistory, true),
      intervencoes: list(complaintHistory),
    },
    subOptions,
  );
  const receiptItem = new Schema<OrderOriginalReceipt['encomendas'][number]>(
    {
      orderId: reference('Order'),
      produtor: reference('User'),
      estadoInicial: { type: String, enum: orderStates, required: true, cast: false },
      totalCent: integer(1),
    },
    subOptions,
  );
  const receipt = new Schema<OrderOriginalReceipt>(
    {
      operacaoCompraId: id(),
      criadaEm: dateField('criadaEm'),
      encomendas: list(receiptItem, true),
      totalCent: integer(1),
      moeda: { type: String, enum: [orderCurrency], required: true, cast: false },
    },
    subOptions,
  );
  const idempotency = new Schema<OrderIdempotency>(
    {
      chave: { ...id(), match: /^[\x21-\x7e]+$/ },
      hashCanonico: { ...textField('hashCanonico', 64), match: /^[a-f0-9]{64}$/ },
      encomendas: {
        type: [reference('Order')],
        castNonArrays: false,
        required: true,
        default: undefined,
        validate: {
          validator: (ids: Types.ObjectId[]) => Array.isArray(ids) && ids.length > 0,
          message: 'Manifesto obrigatório.',
        },
      },
      resultadoOriginal: { type: receipt, required: true },
    },
    subOptions,
  );

  const schema = new Schema<OrderRecord>(
    {
      operacaoCompraId: id(),
      comprador: reference('User'),
      produtor: reference('User'),
      versao: { ...integer(), default: 0 },
      linhas: list(line, true),
      subtotalProdutosCent: integer(1),
      taxaEntregaCent: integer(),
      totalCent: integer(1),
      moeda: { type: String, enum: [orderCurrency], required: true, cast: false },
      entrega: { type: delivery, required: true },
      pagamento: { type: payment, required: true },
      estado: { type: String, enum: orderStates, required: true, cast: false },
      historicoEstado: list(stateHistory, true),
      pedidosCancelamento: list(request),
      cancelamento: { type: cancellation, default: undefined },
      rececao: { type: reception, required: true },
      reclamacoes: list(complaint),
      idempotencia: { type: idempotency, default: undefined },
      createdAt: { ...dateField('createdAt'), default: () => new Date() },
      updatedAt: { ...dateField('updatedAt'), default: () => new Date() },
    },
    {
      collection: 'orders',
      timestamps: true,
      strict: 'throw',
      minimize: false,
      versionKey: 'versao',
      optimisticConcurrency: true,
      autoCreate: false,
      autoIndex: false,
      bufferCommands: false,
      toJSON: { transform: (_document, value) => serializeOrderSummary(value) },
      toObject: { transform: (_document, value) => serializeOrderSummary(value) },
    },
  );
  const fullFields = selectionPaths(schema);
  schema.pre('validate', function () {
    if (!this.isNew && fullFields.some((field) => !this.isSelected(field)))
      throw new Error('Guardar orders exige documento completo, sem projeções parciais.');
  });
  schema.post('validate', function (document) {
    const value = raw(document);
    const issues = validateOrderPersistence(value);
    const baseline = document.$locals.orderBaseline as OrderRecord | undefined;
    if (!document.isNew && !baseline)
      throw new Error('Documento sem contexto de leitura completo.');
    if (baseline) issues.push(...validateOrderEvolution(baseline, value));
    if (issues.length) {
      const error = new MongooseError.ValidationError();
      for (const issue of issues)
        error.addError(
          issue.campo,
          new MongooseError.ValidatorError({ path: issue.campo, message: issue.mensagem }),
        );
      throw error;
    }
  });
  schema.post('init', remember);
  schema.post('save', remember);
  requireDocumentValidation(schema);
  schema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function () {
    throw new Error('Eliminação de encomendas/auditoria indisponível neste bloco.');
  });
  schema.index({ comprador: 1, createdAt: -1 });
  schema.index({ produtor: 1, estado: 1, createdAt: -1 });
  schema.index({ operacaoCompraId: 1, produtor: 1 }, { unique: true });
  schema.index(
    { 'idempotencia.chave': 1 },
    { unique: true, partialFilterExpression: { 'idempotencia.chave': { $type: 'string' } } },
  );
  schema.index({ estado: 1, 'rececao.limiteAtualEm': 1 });
  return connection.model<OrderRecord>('Order', schema);
}
