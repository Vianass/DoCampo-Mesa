import { test, expect } from '@playwright/test';
import { parseProducerOrder, parseProducerOrders } from '../src/features/producer-orders/contracts';
import { orderFixture } from './support/checkout-fixtures';
import { orderStates } from '../src/features/checkout/contracts';
const tag = '"' + 'a'.repeat(43) + '"';
const page = () => ({
  itens: [{ ...orderFixture(), modalidade: 'levantamento' }],
  pagina: 1,
  porPagina: 12,
  total: 1,
  totalPaginas: 1,
  indicadores: {
    numeroEncomendas: 1,
    porEstado: Object.fromEntries(orderStates.map((s) => [s, s === 'pendente' ? 1 : 0])),
    valorConcluidasCent: 0,
    estadoVendas: 'concluida',
  },
});
test('indicadores não misturam encomendas pendentes com valor concluído', () => {
  const r = parseProducerOrders(page());
  expect(r.indicadores.valorConcluidasCent).toBe(0);
  expect(r.indicadores.porEstado.pendente).toBe(1);
});
for (const invalid of [null, '*', 'W/' + tag, '"curta"'])
  test(`detalhe sem ETag forte é recusado: ${invalid}`, () => {
    expect(() =>
      parseProducerOrder({ ...orderFixture(), acoesPermitidas: ['confirmada'] }, { etag: invalid }),
    ).toThrow();
  });
test('projeção descarta dados privados e versões não contratadas', () => {
  const r = parseProducerOrder(
    {
      ...orderFixture(),
      acoesPermitidas: ['confirmada'],
      comprador: 'privado',
      passwordHash: 'privado',
      versao: 20,
    },
    { etag: tag },
  );
  expect(JSON.stringify(r)).not.toContain('privado');
  expect(r.etag).toBe(tag);
});
test('ações desconhecidas ou conclusão direta não produzem comandos na interface', () => {
  for (const action of ['cancelada', 'concluida', 'pendente', 'livre'])
    expect(() =>
      parseProducerOrder({ ...orderFixture(), acoesPermitidas: [action] }, { etag: tag }),
    ).toThrow();
});
test('contagens incoerentes e totais monetários inseguros são recusados', () => {
  for (const input of [
    { ...page(), indicadores: { ...page().indicadores, numeroEncomendas: 2 } },
    {
      ...page(),
      indicadores: { ...page().indicadores, valorConcluidasCent: Number.MAX_SAFE_INTEGER + 1 },
    },
  ])
    expect(() => parseProducerOrders(input)).toThrow();
});
