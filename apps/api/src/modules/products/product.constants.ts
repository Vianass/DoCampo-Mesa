export const productCategories = [
  { id: 'cat-001', nome: 'Hortícolas' },
  { id: 'cat-002', nome: 'Fruta' },
  { id: 'cat-003', nome: 'Leguminosas e cereais' },
  { id: 'cat-004', nome: 'Pão e padaria' },
  { id: 'cat-005', nome: 'Laticínios e queijos' },
  { id: 'cat-006', nome: 'Ovos' },
  { id: 'cat-007', nome: 'Mel e compotas' },
  { id: 'cat-008', nome: 'Azeite e azeitonas' },
  { id: 'cat-009', nome: 'Frutos secos e sementes' },
  { id: 'cat-010', nome: 'Ervas e aromáticas' },
  { id: 'cat-011', nome: 'Bebidas' },
  { id: 'cat-012', nome: 'Outros produtos locais' },
] as const;

export const productStates = ['rascunho', 'publicado', 'arquivado'] as const;
export const saleModalities = ['peso', 'volume', 'unidade', 'embalagem'] as const;

// Em embalagem, un significa uma embalagem comercial, nunca o seu conteúdo.
export const saleDefinitions = {
  peso: { unidadeBase: 'g', quantidadeReferencia: 1000, stockMaximo: 10_000_000 },
  volume: { unidadeBase: 'ml', quantidadeReferencia: 1000, stockMaximo: 10_000_000 },
  unidade: { unidadeBase: 'un', quantidadeReferencia: 1, stockMaximo: 100_000 },
  embalagem: { unidadeBase: 'un', quantidadeReferencia: 1, stockMaximo: 100_000 },
} as const;

export const minimumProductPriceCents = 1;
export const maximumProductPriceCents = 1_000_000;
