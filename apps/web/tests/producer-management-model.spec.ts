import { test, expect } from './support/test';
import {
  stockState,
  parseOwnProduct,
  parseProfile,
  productInput,
} from '../src/features/producer-management/contracts';
const p = {
  id: '000000000000000000000001',
  etag: '"' + 'A'.repeat(43) + '"',
  nome: 'Produto',
  estadoPublicacao: 'rascunho',
  ingredientes: [],
  etiquetas: [],
  imagens: [],
};
test('rascunho incompleto e limiar não inventado', () => {
  expect(parseOwnProduct(p).stockDisponivel).toBeUndefined();
  expect(stockState(parseOwnProduct(p))).toBe('Por definir');
});
test('stock zero prevalece; limiar usa a unidade base e não inventa alerta sem configuração', () => {
  const input = productInput(parseOwnProduct(p));
  expect(stockState({ ...input, stockDisponivel: 0, limiarStockBaixo: 0 })).toBe('Indisponível');
  expect(stockState({ ...input, stockDisponivel: 250, limiarStockBaixo: 500 })).toBe(
    'Stock reduzido',
  );
  expect(stockState({ ...input, stockDisponivel: 500, limiarStockBaixo: 500 })).toBe(
    'Stock reduzido',
  );
  expect(stockState({ ...input, stockDisponivel: 500 })).toBe('Disponível');
});
for (const extra of [
  { etag: 'fraco' },
  { estadoPublicacao: 'toString' },
  { stockDisponivel: -1 },
  { limiarStockBaixo: 1.5 },
  { imagens: [{ url: 'javascript:alert(1)' }] },
])
  test('resposta de produto inválida ' + JSON.stringify(extra), () =>
    expect(() => parseOwnProduct({ ...p, ...extra })).toThrow(),
  );
test('payload editável exclui ID, versão e reservas', () => {
  const input = productInput(
    parseOwnProduct({
      ...p,
      reservasLeilao: [{ quantidade: 500, unidade: 'g', estado: 'reservada' }],
    }),
  );
  expect(input).not.toHaveProperty('id');
  expect(input).not.toHaveProperty('reservasLeilao');
  expect(input).not.toHaveProperty('etag');
});
test('perfil próprio não transforma um papel ou aprovação em campo editável', () => {
  const profile = parseProfile({
    ...p,
    nomePublico: 'Origem',
    localidade: 'Viana',
    concelho: 'Viana',
    descricao: 'Descrição',
    telefone: 'Privado',
    comercial: null,
    estadoAprovacao: 'aprovado',
  });
  expect(profile.comercial).toBeNull();
  expect(() => parseProfile({ ...profile, estadoAprovacao: 'administrador' })).toThrow();
});
