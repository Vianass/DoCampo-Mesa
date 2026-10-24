import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { checkoutCanonicalVersion, CheckoutValidationError } from './checkout.contract.js';
import type { CheckoutTechnicalLimits } from './checkout.contract.js';
import { resolveCheckoutLimits, validateCheckoutInput } from './checkout.validation.js';

export function canonicalizeCheckout(
  context: unknown,
  key: unknown,
  request: unknown,
  overrides: Partial<CheckoutTechnicalLimits> = {},
): string {
  const input = validateCheckoutInput(context, key, request, overrides);
  const canonical = {
    versao: checkoutCanonicalVersion,
    compradorContaId: input.contexto.compradorContaId,
    linhas: input.pedido.linhas.map((line) => ({
      produtoId: line.produtoId,
      produtorContaId: line.produtorContaId,
      quantidade: line.quantidade,
      precoReferenciaCent: line.ofertaAceite.precoReferenciaCent,
      revisaoProdutoObservada: line.ofertaAceite.revisaoProdutoObservada,
      unidadeVenda: {
        modalidade: line.ofertaAceite.unidadeVenda.modalidade,
        unidadeBase: line.ofertaAceite.unidadeVenda.unidadeBase,
        quantidadeReferencia: line.ofertaAceite.unidadeVenda.quantidadeReferencia,
        quantidadeMinima: line.ofertaAceite.unidadeVenda.quantidadeMinima,
        incrementoCompra: line.ofertaAceite.unidadeVenda.incrementoCompra,
        ...(line.ofertaAceite.unidadeVenda.rotulo === undefined
          ? {}
          : { rotulo: line.ofertaAceite.unidadeVenda.rotulo }),
        ...(line.ofertaAceite.unidadeVenda.conteudoPorUnidade === undefined
          ? {}
          : {
              conteudoPorUnidade: {
                quantidade: line.ofertaAceite.unidadeVenda.conteudoPorUnidade.quantidade,
                unidade: line.ofertaAceite.unidadeVenda.conteudoPorUnidade.unidade,
              },
            }),
      },
    })),
    condicoesPorProdutor: input.pedido.condicoesPorProdutor.map((selection) => ({
      produtorContaId: selection.produtorContaId,
      modalidade: selection.modalidade,
      periodo: {
        inicioEm: selection.periodo.inicioEm,
        fimEm: selection.periodo.fimEm,
        fusoHorario: selection.periodo.fusoHorario,
      },
      metodoPagamento: selection.metodoPagamento,
      taxaEntregaAceiteCent: selection.taxaEntregaAceiteCent,
      revisaoProdutorObservada: selection.revisaoProdutorObservada,
      ...(selection.modalidade === 'entrega'
        ? {
            concelhoId: selection.concelhoId,
            dadosEntregaHash: createHash('sha256')
              .update('docampo.checkout.entrega.v1\0', 'utf8')
              .update(JSON.stringify([selection.morada, selection.contacto]), 'utf8')
              .digest('hex'),
          }
        : {}),
    })),
  };
  const serialized = JSON.stringify(canonical);
  if (Buffer.byteLength(serialized, 'utf8') > resolveCheckoutLimits(overrides).maxCanonicoBytes)
    throw new CheckoutValidationError(
      'LIMITE_TECNICO_EXCEDIDO',
      'pedido',
      'A representação canónica excede o orçamento técnico.',
    );
  return serialized;
}
