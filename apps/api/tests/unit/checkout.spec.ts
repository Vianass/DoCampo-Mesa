import { createConnection } from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import { validateCheckoutInput } from '../../src/modules/orders/checkout.validation.js';
import {
  createCheckoutExecution,
  prepareCheckoutOrders,
} from '../../src/modules/orders/checkout.preparation.js';
import { createCheckoutService } from '../../src/modules/orders/checkout.service.js';
import { validateProducerCommercial } from '../../src/modules/producers/producer-commercial.validation.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { ConcurrencyError } from '../../src/modules/concurrency/concurrency-error.js';
import { checkoutScenario, checkoutTestNow } from '../support/checkout-fixtures.js';
import { producerCommercialInput } from '../support/producer-commercial-fixtures.js';
import { userInput } from '../support/identity-fixtures.js';

const connection = createConnection();
const User = createUserModel(connection);
const Producer = createProducerModel(connection);
afterAll(() => connection.close());
function prepare(scenario = checkoutScenario()) {
  const input = validateCheckoutInput(
    { compradorContaId: scenario.buyerId.toHexString() },
    scenario.chave,
    scenario.pedido,
  );
  return prepareCheckoutOrders(
    input,
    new Map(scenario.products.map((p) => [p._id.toHexString(), p])),
    new Map(scenario.producers.map((p) => [p.userId.toHexString(), p])),
    createCheckoutExecution(input, checkoutTestNow),
  );
}

describe('preparação dos snapshots do checkout', () => {
  it.each([1, 2])('prepara %s produtores, uma âncora e recibo integral', (count) => {
    const prepared = prepare(checkoutScenario(count));
    expect(prepared.orders).toHaveLength(count);
    expect(prepared.orders.filter((order) => order.idempotencia)).toHaveLength(1);
    expect(new Set(prepared.orders.map((order) => order.operacaoCompraId)).size).toBe(1);
    expect(prepared.recibo.totalCent).toBe(75 * count);
    expect(prepared.recibo.encomendas).toHaveLength(count);
    for (const order of prepared.orders) {
      expect(order.estado).toBe('pendente');
      expect(order.pagamento.estado).toBe('por_pagar');
      expect(order.rececao).toMatchObject({
        decorridoMs: 0,
        ultimoInicioEm: null,
        limiteAtualEm: null,
      });
    }
  });
  it('agrega antes de arredondar e aplica uma taxa por produtor', () => {
    const scenario = checkoutScenario(1, true);
    const line = scenario.pedido.linhas[0]!;
    scenario.pedido = {
      ...scenario.pedido,
      linhas: [
        { ...line, quantidade: 250 },
        { ...line, quantidade: 250 },
      ],
    };
    const { orders, recibo } = prepare(scenario);
    expect(orders[0]!.linhas).toHaveLength(1);
    expect(orders[0]!.linhas[0]!.subtotalCent).toBe(75);
    expect(orders[0]!.taxaEntregaCent).toBe(250);
    expect(recibo.totalCent).toBe(325);
  });
  it('o local de levantamento provém do produtor e a entrada não é modificada', () => {
    const scenario = checkoutScenario();
    const before = JSON.stringify(scenario);
    const { orders } = prepare(scenario);
    expect(orders[0]!.entrega.snapshot).toMatchObject({
      tipo: 'levantamento',
      localLevantamento: scenario.producers[0]!.comercial.localLevantamento,
    });
    expect(JSON.stringify(scenario)).toBe(before);
    expect(orders[0]!.createdAt).not.toBe(checkoutTestNow);
  });
  it('conserva IDs, data e eventos entre tentativas de preparação', () => {
    const scenario = checkoutScenario(2);
    const input = validateCheckoutInput(
      { compradorContaId: scenario.buyerId.toHexString() },
      scenario.chave,
      scenario.pedido,
    );
    const execution = createCheckoutExecution(input, checkoutTestNow);
    const products = new Map(scenario.products.map((p) => [p._id.toHexString(), p]));
    const producers = new Map(scenario.producers.map((p) => [p.userId.toHexString(), p]));
    expect(prepareCheckoutOrders(input, products, producers, execution)).toEqual(
      prepareCheckoutOrders(input, products, producers, execution),
    );
  });
  it('recusa levantamento sem local, mantendo válida a configuração antiga', () => {
    const scenario = checkoutScenario();
    scenario.producers[0]!.comercial = producerCommercialInput();
    expect(validateProducerCommercial(scenario.producers[0]!.comercial)).toEqual([]);
    expect(() => prepare(scenario)).toThrow(ConcurrencyError);
  });
  it('recusa unidade ou revisão alterada sem adaptar a quantidade', () => {
    const scenario = checkoutScenario();
    scenario.products[0]!.unidadeVenda!.quantidadeMinima = 1000;
    expect(() => prepare(scenario)).toThrow(ConcurrencyError);
    scenario.products[0]!.revisaoOperacional = 1;
    expect(() => prepare(scenario)).toThrow(ConcurrencyError);
  });
  it('não expõe dados de entrega, chave, hash ou pagamento privado no recibo', () => {
    const scenario = checkoutScenario(2, true);
    const { recibo } = prepare(scenario);
    for (const value of [
      scenario.chave,
      'morada',
      'contacto',
      'idempotencia',
      'pagamentoPrivado',
      'hashCanonico',
    ])
      expect(JSON.stringify(recibo)).not.toContain(value);
    expect(Object.isFrozen(recibo)).toBe(true);
  });
});

describe('pré-requisitos compatíveis com documentos antigos', () => {
  it.each(['', ' ', null, 42, 'a\u0000b', 'a'.repeat(4097)])(
    'recusa local inválido: %s',
    (value) => {
      expect(
        validateProducerCommercial({ ...producerCommercialInput(), localLevantamento: value }),
      ).toContainEqual(expect.objectContaining({ campo: 'comercial.localLevantamento' }));
    },
  );
  it('normaliza o novo local e não o expõe no JSON anterior do produtor', async () => {
    const scenario = checkoutScenario();
    const profile = new Producer({
      ...scenario.producers[0],
      comercial: producerCommercialInput({ localLevantamento: '  Local oficial  ' }),
    });
    await profile.validate();
    expect(profile.comercial!.localLevantamento).toBe('Local oficial');
    expect(JSON.stringify(profile)).not.toContain('Local oficial');
  });
  it('users novo tem revisão zero, que não entra na serialização pública', async () => {
    const user = new User(userInput());
    await user.validate();
    expect(user.revisaoOperacional).toBe(0);
    expect(user.toObject()).not.toHaveProperty('revisaoOperacional');
    expect(user.toJSON()).not.toHaveProperty('passwordHash');
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, 1])(
    'não aceita atribuição de revisão inicial %s',
    async (revision) => {
      await expect(
        new User(userInput({ revisaoOperacional: revision })).validate(),
      ).rejects.toThrow();
    },
  );
  it('não permite gravar uma conta lida sem a revisão necessária', async () => {
    const user = User.hydrate(userInput(), { nome: 1, papeis: 1 });
    user.nome = 'Outro nome';
    await expect(user.validate()).rejects.toThrow();
  });
  it.each([0, -1, 0.1, NaN])('recusa um orçamento de tentativas inválido: %s', (maxAttempts) => {
    expect(() =>
      createCheckoutService({
        connection,
        resolveIdentity: async () => ({ compradorContaId: '000000000000000000000011' }),
        maxAttempts,
      }),
    ).toThrow();
  });
  it('rejeita buyerId no pedido e não consulta a persistência', async () => {
    const scenario = checkoutScenario();
    const service = createCheckoutService({
      connection,
      resolveIdentity: async () => ({ compradorContaId: scenario.buyerId.toHexString() }),
    });
    expect(
      await service(scenario.chave, {
        ...scenario.pedido,
        buyerId: scenario.buyerId.toHexString(),
      }),
    ).toMatchObject({ tipo: 'recusado', erro: { codigo: 'PEDIDO_INVALIDO' } });
  });
});
