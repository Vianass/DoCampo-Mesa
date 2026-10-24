import type { Types } from 'mongoose';
import type { productCategories, productStates, saleModalities } from './product.constants.js';

export type ProductCategoryId = (typeof productCategories)[number]['id'];
export type ProductState = (typeof productStates)[number];
export type SaleModality = (typeof saleModalities)[number];
export type BaseUnit = 'g' | 'ml' | 'un';

export interface SaleUnitRecord {
  modalidade?: SaleModality;
  unidadeBase?: BaseUnit;
  quantidadeReferencia?: number;
  quantidadeMinima?: number;
  incrementoCompra?: number;
  rotulo?: string;
  conteudoPorUnidade?: { quantidade: number; unidade: BaseUnit };
}

export interface ProductImage {
  url: string;
  alt?: string;
  principal: boolean;
}

export interface ProductRecord {
  _id: Types.ObjectId;
  produtor: Types.ObjectId;
  nome: string;
  estadoPublicacao: ProductState;
  descricao?: string;
  categoriaId?: ProductCategoryId;
  precoCent?: number;
  moeda: 'EUR';
  unidadeVenda?: SaleUnitRecord;
  stockDisponivel?: number;
  ingredientesAplicaveis?: boolean;
  ingredientes: string[];
  etiquetas: string[];
  epocaMeses?: number[];
  modoProducao?: string;
  imagens: ProductImage[];
  createdAt: Date;
  updatedAt: Date;
  revisaoOperacional?: number;
}
