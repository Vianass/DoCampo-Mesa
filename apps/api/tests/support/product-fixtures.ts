import { Types } from 'mongoose';
import type { ProductRecord } from '../../src/modules/products/product.types.js';

export const testProductImage = {
  url: 'https://example.invalid/produto.jpg',
  alt: 'Produto fictício',
  principal: true,
};

export function publishedProductInput(overrides: Record<string, unknown> = {}) {
  return {
    produtor: new Types.ObjectId(),
    nome: 'Produto fictício de teste',
    descricao: 'Descrição fictícia do produto.',
    estadoPublicacao: 'publicado',
    categoriaId: 'cat-001',
    precoCent: 150,
    unidadeVenda: { modalidade: 'peso', quantidadeMinima: 250, incrementoCompra: 50 },
    stockDisponivel: 10_000,
    ingredientesAplicaveis: false,
    imagens: [{ ...testProductImage }],
    ...overrides,
  } as Partial<ProductRecord>;
}
