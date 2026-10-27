import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { orderListQuery, orderParams } from '../../src/modules/orders/orders.validation.js';
import { buyerOrderDetailDto, checkoutHttpResponse } from '../../src/modules/orders/orders.dto.js';
import {
  createCheckoutExecution,
  prepareCheckoutOrders,
} from '../../src/modules/orders/checkout.preparation.js';
import { validateCheckoutInput } from '../../src/modules/orders/checkout.validation.js';
import { checkoutScenario, checkoutTestNow } from '../support/checkout-fixtures.js';
import type { CheckoutResult } from '../../src/modules/orders/checkout.contract.js';

function prepared(delivery = false) {
  const s = checkoutScenario(1, delivery);
  const input = validateCheckoutInput(
    { compradorContaId: s.buyerId.toHexString() },
    s.chave,
    s.pedido,
  );
  return prepareCheckoutOrders(
    input,
    new Map(s.products.map((p) => [p._id.toHexString(), p])),
    new Map(s.producers.map((p) => [p.userId.toHexString(), p])),
    createCheckoutExecution(input, checkoutTestNow),
  );
}
describe('contrato HTTP de encomendas', () => {
  it('usa paginação e cronologia explícitas', () => {
    expect(orderListQuery.parse({})).toEqual({ pagina: 1, porPagina: 12, ordem: 'recentes' });
    expect(orderListQuery.parse({ pagina: '2', porPagina: '24', ordem: 'antigas' })).toEqual({
      pagina: 2,
      porPagina: 24,
      ordem: 'antigas',
    });
    expect(orderParams.parse({ id: 'ABCDEF123456ABCDEF123456' }).id).toBe(
      'abcdef123456abcdef123456',
    );
  });
  it.each([
    { pagina: '0' },
    { pagina: '1001' },
    { pagina: '1.5' },
    { porPagina: '1000' },
    { ordem: 'nome' },
    { comprador: 'outro' },
    { pagina: ['1', '2'] },
    { estado: 'pendente' },
    { pagina: 1 },
  ])('rejeita query inválida %j', (query) => {
    expect(orderListQuery.safeParse(query).success).toBe(false);
  });
  it('projeta snapshots sem conta compradora, auditoria privada ou metadados da âncora', () => {
    const { orders } = prepared(true);
    const dto = buyerOrderDetailDto(orders[0]!);
    expect(dto).toMatchObject({
      estado: 'pendente',
      totalCent: 325,
      pagamento: { estado: 'por_pagar' },
      entrega: { modalidade: 'entrega', morada: 'Morada privada fictícia' },
      historicoEstado: [{ tipo: 'criacao_compra', para: 'pendente' }],
    });
    expect(dto.linhas[0]).toMatchObject({
      quantidade: 500,
      precoReferenciaCent: 150,
      subtotalCent: 75,
      unidadeVenda: { unidadeBase: 'g' },
    });
    const serialized = JSON.stringify(dto);
    for (const key of [
      'idempotencia',
      'hashCanonico',
      'passwordHash',
      'comandoId',
      'userId',
      'versaoConfiguracao',
      'versaoUnidade',
      'ator',
      'comprador',
    ])
      expect(serialized).not.toContain('"' + key + '"');
  });
  it('levantamento mostra exclusivamente o local oficial persistido', () => {
    const { orders } = prepared();
    const dto = buyerOrderDetailDto(orders[0]!);
    expect(dto.entrega).toMatchObject({ modalidade: 'levantamento', taxaEntregaCent: 0 });
    expect(dto.entrega).not.toHaveProperty('morada');
    expect(dto.entrega).not.toHaveProperty('contacto');
  });
  it.each(['nova', 'replay'] as const)('sucesso %s conserva o recibo original', (origem) => {
    const { recibo } = prepared();
    const response = checkoutHttpResponse({ tipo: 'sucesso', origem, recibo });
    expect(response.status).toBe(origem === 'nova' ? 201 : 200);
    expect(response.body).toEqual({ ...recibo, origem });
    expect(response.location).toBe('/api/orders/' + recibo.encomendas[0]!.orderId);
  });
  it.each(['RECONFIRMACAO_NECESSARIA', 'CONFLITO_REVISAO'] as const)(
    'traduz %s para 409',
    (codigo) => {
      expect(
        checkoutHttpResponse({
          tipo: 'reconfirmacao_necessaria',
          conflitos: [{ codigo, campos: [] }],
        }),
      ).toMatchObject({ status: 409, body: { codigo } });
    },
  );
  it.each([
    ['CONFLITO_IDEMPOTENCIA', 'chaveIdempotencia', 409],
    ['PEDIDO_INVALIDO', 'pedido', 400],
    ['PEDIDO_INVALIDO', 'contexto', 403],
    ['QUANTIDADE_INVALIDA', 'pedido.linhas', 400],
  ] as const)('traduz recusa %s no campo %s para %s', (codigo, campo, status) => {
    expect(
      checkoutHttpResponse({
        tipo: 'recusado',
        erro: { codigo, campos: [{ campo, mensagem: 'Campo inválido.' }] },
      }).status,
    ).toBe(status);
  });
  it('resultado incerto exige a mesma chave sem revelar motivos técnicos', () => {
    const result = {
      tipo: 'resultado_indeterminado',
      codigo: 'RESULTADO_DESCONHECIDO',
      repetirComMesmaChave: true,
      motivo: 'GRUPO_INCONSISTENTE',
    };
    const response = checkoutHttpResponse(result as CheckoutResult);
    expect(response).toMatchObject({
      status: 503,
      body: { codigo: 'RESULTADO_DESCONHECIDO', repetirComMesmaChave: true },
    });
    expect(JSON.stringify(response)).not.toContain('GRUPO_INCONSISTENTE');
  });
  it('identificadores inválidos não chegam à base de dados', () => {
    expect(orderParams.safeParse({ id: 'outro' }).success).toBe(false);
    expect(
      orderParams.safeParse({ id: new Types.ObjectId().toHexString(), comprador: 'intruso' })
        .success,
    ).toBe(false);
  });
});
