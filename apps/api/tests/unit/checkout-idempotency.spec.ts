import { Types, mongo } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  CheckoutIdempotencyConflict,
  identifyCheckout,
  inspectCheckoutGroup,
  isCheckoutIdempotencyKeyConflict,
  isCheckoutReadUnavailable,
  prepareCheckoutIdempotency,
} from '../../src/modules/orders/checkout.idempotency.js';
import { CheckoutValidationError } from '../../src/modules/orders/checkout.contract.js';
import { validateCheckoutInput } from '../../src/modules/orders/checkout.validation.js';
import {
  checkoutIdempotencyFixture,
  cloneCheckoutFixture,
} from '../support/checkout-idempotency-fixtures.js';

function replace(root: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  let record = root as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) record = record[key] as Record<string, unknown>;
  record[keys.at(-1)!] = value;
}

describe('preparação pura de metadados globais', () => {
  it.each([1, 2] as const)(
    'prepara uma única âncora para %s produtores sem gerar uma operação ou alterar documentos',
    (count) => {
      const fixture = checkoutIdempotencyFixture(count);
      const before = mongo.BSON.serialize({ orders: fixture.orders, input: fixture.input });
      const plan = prepareCheckoutIdempotency(fixture.input, [...fixture.orders].reverse());
      expect(plan.ancoraOrderId.equals(fixture.orders[0]!._id)).toBe(true);
      expect(plan.idempotencia.encomendas).toHaveLength(count);
      expect(plan.idempotencia.resultadoOriginal.totalCent).toBe(75 * count);
      expect(plan.idempotencia.resultadoOriginal.operacaoCompraId).toBe(
        fixture.orders[0]!.operacaoCompraId,
      );
      expect(plan.idempotencia.hashCanonico).toBe(fixture.expected.hashCanonico);
      expect(mongo.BSON.serialize({ orders: fixture.orders, input: fixture.input })).toEqual(
        before,
      );
      plan.idempotencia.resultadoOriginal.criadaEm.setTime(0);
      expect(fixture.orders[0]!.createdAt.getTime()).not.toBe(0);
      expect(plan.ancoraOrderId).not.toBe(fixture.orders[0]!._id);
    },
  );
  it.each([
    ['comprador', new Types.ObjectId()],
    ['operacaoCompraId', 'outra-operacao'],
    ['produtor', new Types.ObjectId()],
    ['totalCent', 76],
    ['totalCent', NaN],
    ['moeda', 'USD'],
    ['estado', 'confirmada'],
    ['createdAt', new Date(NaN)],
    ['idempotencia', {}],
    ['_id', 'id-invalido'],
  ])('recusa grupo planeado incoerente em %s %#', (field, value) => {
    const fixture = checkoutIdempotencyFixture();
    const orders = cloneCheckoutFixture(fixture.orders);
    replace(orders, '1.' + field, value);
    expect(() => prepareCheckoutIdempotency(fixture.input, orders)).toThrow(
      CheckoutValidationError,
    );
  });
  it('recusa lista vazia, IDs/produtores duplicados e produtores em falta', () => {
    const fixture = checkoutIdempotencyFixture();
    for (const orders of [[], fixture.orders.slice(0, 1), [fixture.orders[0]!, fixture.orders[0]!]])
      expect(() => prepareCheckoutIdempotency(fixture.input, orders)).toThrow(
        CheckoutValidationError,
      );
  });
});

describe('verificação integral e projeção do recibo', () => {
  it.each([1, 2] as const)(
    'devolve o recibo original de %s produtores em cópias imutáveis',
    (count) => {
      const fixture = checkoutIdempotencyFixture(count);
      const result = inspectCheckoutGroup(
        fixture.anchor,
        [...fixture.members].reverse(),
        fixture.expected,
      );
      expect(result.tipo).toBe('sucesso');
      if (result.tipo !== 'sucesso') throw Error('Expected replay');
      expect(result.origem).toBe('replay');
      expect(result.recibo.totalCent).toBe(75 * count);
      expect(result.recibo.encomendas.map((o) => o.estadoInicial)).toEqual(
        Array(count).fill('pendente'),
      );
      expect(Object.isFrozen(result.recibo.encomendas[0])).toBe(true);
      expect(Object.isFrozen(result.recibo)).toBe(true);
      expect(JSON.stringify(result)).not.toContain(fixture.expected.chave);
      expect(JSON.stringify(result)).not.toContain(fixture.expected.hashCanonico);
      expect(JSON.stringify(result)).not.toContain('localLevantamento');
    },
  );
  it('não usa o estado comercial atual para reconstruir o resultado inicial', () => {
    const fixture = checkoutIdempotencyFixture(1);
    const changed = cloneCheckoutFixture(fixture.members);
    replace(changed, '0.estado', 'cancelada');
    replace(changed, '0.pagamento.estado', 'pago');
    const result = inspectCheckoutGroup(changed[0], changed, fixture.expected);
    expect(result.tipo === 'sucesso' && result.recibo.encomendas[0]?.estadoInicial).toBe(
      'pendente',
    );
  });
  it('rejeita outro comprador e outro fingerprint com o mesmo conflito genérico e sem dados privados', () => {
    const fixture = checkoutIdempotencyFixture();
    const different = validateCheckoutInput(
      { compradorContaId: '000000000000000000000099' },
      fixture.input.chaveIdempotencia,
      fixture.input.pedido,
    );
    const payload = cloneCheckoutFixture(fixture.input.pedido);
    replace(payload, 'linhas.0.quantidade', 1000);
    const changed = validateCheckoutInput(
      fixture.input.contexto,
      fixture.input.chaveIdempotencia,
      payload,
    );
    const messages: string[] = [];
    for (const input of [different, changed]) {
      let failure: unknown;
      try {
        inspectCheckoutGroup(fixture.anchor, [], identifyCheckout(input));
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(CheckoutIdempotencyConflict);
      if (!(failure instanceof CheckoutIdempotencyConflict)) throw Error('Expected conflict');
      expect(failure.codigo).toBe('CONFLITO_IDEMPOTENCIA');
      messages.push(failure.message);
      expect(failure.message + JSON.stringify(failure)).not.toContain(fixture.expected.chave);
      expect(failure).not.toHaveProperty('status');
    }
    expect(messages[0]).toBe(messages[1]);
  });
  it('não aceita apenas a âncora, membros extra ou duplicados como grupo completo', () => {
    const fixture = checkoutIdempotencyFixture();
    for (const members of [
      [],
      [fixture.anchor],
      [...fixture.members, fixture.anchor],
      [fixture.anchor, fixture.anchor],
    ])
      expect(inspectCheckoutGroup(fixture.anchor, members, fixture.expected).tipo).toBe(
        'resultado_indeterminado',
      );
  });
  it.each([
    ['comprador', new Types.ObjectId()],
    ['operacaoCompraId', 'outra-operacao'],
    ['produtor', new Types.ObjectId()],
    ['totalCent', 76],
    ['totalCent', Infinity],
    ['moeda', 'USD'],
    ['idempotencia', {}],
    ['_id', new Types.ObjectId()],
  ])('recusa divergência no membro em %s %#', (field, value) => {
    const fixture = checkoutIdempotencyFixture();
    const members = cloneCheckoutFixture(fixture.members);
    replace(members, '1.' + field, value);
    expect(inspectCheckoutGroup(fixture.anchor, members, fixture.expected).tipo).toBe(
      'resultado_indeterminado',
    );
  });
  it.each([
    ['resultadoOriginal.operacaoCompraId', 'outra-operacao'],
    ['resultadoOriginal.totalCent', 151],
    ['resultadoOriginal.totalCent', NaN],
    ['resultadoOriginal.moeda', 'USD'],
    ['resultadoOriginal.criadaEm', new Date(NaN)],
    ['resultadoOriginal.criadaEm', '2026-10-24'],
    ['resultadoOriginal.encomendas.0.estadoInicial', 'confirmada'],
    ['resultadoOriginal.encomendas.0.totalCent', 76],
    ['resultadoOriginal.encomendas.0.produtor', new Types.ObjectId()],
    ['resultadoOriginal.encomendas.0.orderId', new Types.ObjectId()],
    ['encomendas', []],
    ['resultadoOriginal.encomendas', []],
    ['resultadoOriginal', null],
  ])('recusa recibo/manifesto incoerente em %s %#', (field, value) => {
    const fixture = checkoutIdempotencyFixture();
    const members = cloneCheckoutFixture(fixture.members);
    replace(members, '0.idempotencia.' + field, value);
    expect(inspectCheckoutGroup(members[0], members, fixture.expected).tipo).toBe(
      'resultado_indeterminado',
    );
  });
  it('verifica que totais concordam também com o pedido originalmente aceite', () => {
    const fixture = checkoutIdempotencyFixture();
    const members = cloneCheckoutFixture(fixture.members);
    replace(members, '1.totalCent', 76);
    replace(members, '0.idempotencia.resultadoOriginal.encomendas.1.totalCent', 76);
    replace(members, '0.idempotencia.resultadoOriginal.totalCent', 151);
    expect(inspectCheckoutGroup(members[0], members, fixture.expected).tipo).toBe(
      'resultado_indeterminado',
    );
  });
  it('deteta manifesto duplicado, segunda âncora e âncora fora da escolha determinística', () => {
    const fixture = checkoutIdempotencyFixture();
    const duplicate = cloneCheckoutFixture(fixture.members);
    replace(duplicate, '0.idempotencia.encomendas.1', duplicate[0]!._id);
    expect(inspectCheckoutGroup(duplicate[0], duplicate, fixture.expected).tipo).toBe(
      'resultado_indeterminado',
    );
    const second = cloneCheckoutFixture(fixture.members);
    replace(second, '1.idempotencia', second[0]!.idempotencia);
    expect(inspectCheckoutGroup(second[0], second, fixture.expected).tipo).toBe(
      'resultado_indeterminado',
    );
    const moved = cloneCheckoutFixture(fixture.members);
    replace(moved, '1.idempotencia', moved[0]!.idempotencia);
    replace(moved, '0.idempotencia', undefined);
    expect(inspectCheckoutGroup(moved[1], moved, fixture.expected).tipo).toBe(
      'resultado_indeterminado',
    );
  });
  it('preserva documentos antigos sem metadados nas orders não âncora, sem migrar', () => {
    const fixture = checkoutIdempotencyFixture();
    const members = cloneCheckoutFixture(fixture.members);
    replace(members, '1.idempotencia', null);
    const before = mongo.BSON.serialize({ members });
    expect(inspectCheckoutGroup(members[0], members, fixture.expected).tipo).toBe('sucesso');
    expect(mongo.BSON.serialize({ members })).toEqual(before);
    expect(inspectCheckoutGroup(fixture.orders[0], fixture.orders, fixture.expected).tipo).toBe(
      'resultado_indeterminado',
    );
  });
  it('recusa excesso de membros como limite técnico, sem devolver recibo truncado', () => {
    const fixture = checkoutIdempotencyFixture();
    expect(
      inspectCheckoutGroup(fixture.anchor, fixture.members, fixture.expected, 1),
    ).toMatchObject({ tipo: 'resultado_indeterminado', motivo: 'LIMITE_TECNICO' });
  });
});

describe('classificação limitada dos erros do driver', () => {
  it('identifica apenas E11000 do índice global da chave, nunca todas as duplicações', () => {
    const correct = new mongo.MongoServerError({
      code: 11000,
      keyPattern: { 'idempotencia.chave': 1 },
      keyValue: { 'idempotencia.chave': 'privada' },
    });
    expect(isCheckoutIdempotencyKeyConflict(correct)).toBe(true);
    for (const error of [
      new Error('E11000'),
      { code: 11000, keyPattern: { 'idempotencia.chave': 1 } },
      new mongo.MongoServerError({ code: 11000, keyPattern: { _id: 1 } }),
      new mongo.MongoServerError({ code: 11000, keyPattern: { operacaoCompraId: 1, produtor: 1 } }),
      new mongo.MongoServerError({ code: 112, keyPattern: { 'idempotencia.chave': 1 } }),
    ])
      expect(isCheckoutIdempotencyKeyConflict(error)).toBe(false);
  });
  it('distingue rede, timeout e labels transitórios de erros inesperados ou validação', () => {
    const transient = new mongo.MongoServerError({
      code: 251,
      errorLabels: ['TransientTransactionError'],
    });
    const unknown = new mongo.MongoServerError({
      code: 91,
      errorLabels: ['UnknownTransactionCommitResult'],
    });
    for (const error of [
      transient,
      unknown,
      new mongo.MongoNetworkError('rede privada omitida'),
      new mongo.MongoOperationTimeoutError('timeout'),
      new mongo.MongoServerError({ code: 112 }),
    ])
      expect(isCheckoutReadUnavailable(error)).toBe(true);
    expect(transient.hasErrorLabel('TransientTransactionError')).toBe(true);
    for (const error of [
      new Error('interno'),
      new CheckoutIdempotencyConflict(),
      new mongo.MongoServerError({ code: 13 }),
      { code: 112 },
    ])
      expect(isCheckoutReadUnavailable(error)).toBe(false);
  });
});
