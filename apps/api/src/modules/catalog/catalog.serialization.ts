import { createHmac } from 'node:crypto';
import type { ProductRecord, SaleUnitRecord } from '../products/product.types.js';
import type { ProducerRecord } from '../producers/producer.model.js';
import { productCategories } from '../products/product.constants.js';
import { projectProducerPublic } from '../producers/producer.serialization.js';
import { operationalRevision } from '../concurrency/concurrency-error.js';

export function productTag(
  product: Pick<ProductRecord, '_id' | 'revisaoOperacional'>,
  key: Uint8Array,
): string {
  return (
    '"' +
    createHmac('sha256', key)
      .update(
        'docampo.product.v1\0' +
          product._id.toHexString() +
          '\0' +
          operationalRevision(product.revisaoOperacional),
      )
      .digest('base64url') +
    '"'
  );
}
export function producerPublic(record: ProducerRecord) {
  const result = projectProducerPublic(record);
  if (result.comercial && typeof result.comercial === 'object')
    Reflect.deleteProperty(result.comercial, 'catalogoConcelhosVersao');
  return result;
}
function unitPublic(unit: SaleUnitRecord | undefined) {
  if (!unit) return undefined;
  return {
    modalidade: unit.modalidade,
    unidadeBase: unit.unidadeBase,
    quantidadeReferencia: unit.quantidadeReferencia,
    quantidadeMinima: unit.quantidadeMinima,
    incrementoCompra: unit.incrementoCompra,
    rotulo: unit.rotulo,
    ...(unit.conteudoPorUnidade
      ? {
          conteudoPorUnidade: {
            quantidade: unit.conteudoPorUnidade.quantidade,
            unidade: unit.conteudoPorUnidade.unidade,
          },
        }
      : {}),
  };
}
/** DTO próprio; não usa serialização de documento bruto, referências users ou contadores internos. */
export function productPublic(product: ProductRecord, producer: ProducerRecord) {
  const category = productCategories.find((item) => item.id === product.categoriaId);
  return {
    id: product._id.toHexString(),
    nome: product.nome,
    descricao: product.descricao,
    precoCent: product.precoCent,
    moeda: product.moeda,
    unidadeVenda: unitPublic(product.unidadeVenda),
    categoria: category,
    stockDisponivel: product.stockDisponivel,
    disponivel: (product.stockDisponivel ?? 0) > 0,
    ingredientesAplicaveis: product.ingredientesAplicaveis,
    ingredientes: product.ingredientes,
    etiquetas: product.etiquetas,
    epocaMeses: product.epocaMeses,
    modoProducao: product.modoProducao,
    imagens: product.imagens.map((image) => ({
      url: image.url,
      alt: image.alt,
      principal: image.principal,
    })),
    produtor: {
      id: producer._id.toHexString(),
      nomePublico: producer.nomePublico,
      localidade: producer.localidade,
      concelho: producer.concelho,
      ...(producer.imagem
        ? { imagem: { url: producer.imagem.url, alt: producer.imagem.alt } }
        : {}),
    },
    comercial: producerPublic(producer).comercial,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
export function productOwn(product: ProductRecord, key: Uint8Array) {
  return {
    id: product._id.toHexString(),
    nome: product.nome,
    estadoPublicacao: product.estadoPublicacao,
    descricao: product.descricao,
    categoriaId: product.categoriaId,
    precoCent: product.precoCent,
    moeda: product.moeda,
    unidadeVenda: unitPublic(product.unidadeVenda),
    stockDisponivel: product.stockDisponivel,
    ingredientesAplicaveis: product.ingredientesAplicaveis,
    ingredientes: product.ingredientes,
    etiquetas: product.etiquetas,
    epocaMeses: product.epocaMeses,
    modoProducao: product.modoProducao,
    imagens: product.imagens.map((image) => ({
      url: image.url,
      alt: image.alt,
      principal: image.principal,
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    etag: productTag(product, key),
  };
}
