import type { CheckoutResult } from './checkout.contract.js';
import type { OrderRecord, OrderSaleUnit } from './order.types.js';

function saleUnit(unit: OrderSaleUnit) {
  return {
    modalidade: unit.modalidade,
    unidadeBase: unit.unidadeBase,
    quantidadeReferencia: unit.quantidadeReferencia,
    quantidadeMinima: unit.quantidadeMinima,
    incrementoCompra: unit.incrementoCompra,
    ...(unit.rotulo !== undefined ? { rotulo: unit.rotulo } : {}),
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
function period(value: OrderRecord['entrega']['snapshot']['periodoInicial']) {
  return {
    inicioEm: value.inicioEm.toISOString(),
    fimEm: value.fimEm.toISOString(),
    fusoHorario: value.fusoHorario,
  };
}
/** Projeção exclusiva do comprador autorizado: nunca serializar o documento/âncora inteiro. */
export function buyerOrderDto(order: OrderRecord) {
  return {
    id: order._id.toHexString(),
    operacaoCompraId: order.operacaoCompraId,
    produtorContaId: order.produtor.toHexString(),
    estado: order.estado,
    linhas: order.linhas.map((line) => ({
      id: line.id,
      produtoId: line.produto.toHexString(),
      nome: line.nome,
      quantidade: line.quantidade,
      precoReferenciaCent: line.precoReferenciaCent,
      unidadeVenda: saleUnit(line.unidadeSnapshot),
      subtotalCent: line.subtotalCent,
    })),
    subtotalProdutosCent: order.subtotalProdutosCent,
    taxaEntregaCent: order.taxaEntregaCent,
    totalCent: order.totalCent,
    moeda: order.moeda,
    pagamento: { metodo: order.pagamento.metodo, estado: order.pagamento.estado },
    criadaEm: order.createdAt.toISOString(),
    atualizadaEm: order.updatedAt.toISOString(),
  };
}
export function buyerOrderDetailDto(order: OrderRecord) {
  const delivery = order.entrega.snapshot;
  return {
    ...buyerOrderDto(order),
    entrega: {
      modalidade: delivery.tipo,
      periodoInicial: period(delivery.periodoInicial),
      taxaEntregaCent: delivery.taxaEntregaCent,
      ...(delivery.tipo === 'levantamento'
        ? { localLevantamento: delivery.localLevantamento }
        : {
            concelhoId: delivery.concelhoId,
            morada: delivery.morada,
            contacto: delivery.contacto,
          }),
    },
    historicoEstado: order.historicoEstado.map((event) => ({
      tipo: event.tipo,
      ...(event.de ? { de: event.de } : {}),
      ...(event.para ? { para: event.para } : {}),
      ocorridoEm: event.ocorridoEm.toISOString(),
    })),
  };
}

/** Mantém os resultados comerciais existentes; motivos técnicos de recuperação não atravessam HTTP. */
export function checkoutHttpResponse(result: CheckoutResult) {
  if (result.tipo === 'sucesso')
    return {
      status: result.origem === 'nova' ? 201 : 200,
      body: { ...result.recibo, origem: result.origem },
      location: '/api/orders/' + result.recibo.encomendas[0]!.orderId,
    };
  if (result.tipo === 'resultado_indeterminado')
    return {
      status: 503,
      body: {
        codigo: 'RESULTADO_DESCONHECIDO',
        mensagem:
          'Não foi possível confirmar o resultado. Repete o mesmo pedido com a mesma chave.',
        repetirComMesmaChave: true,
      },
    };
  if (result.tipo === 'reconfirmacao_necessaria')
    return {
      status: 409,
      body: {
        codigo: result.conflitos.some((c) => c.codigo === 'CONFLITO_REVISAO')
          ? 'CONFLITO_REVISAO'
          : 'RECONFIRMACAO_NECESSARIA',
        mensagem: 'Consulta as condições atuais e confirma novamente a compra.',
        campos: result.conflitos.flatMap((c) => c.campos.map((f) => ({ ...f }))),
      },
    };
  const capability = result.erro.campos.some((f) => f.campo === 'contexto');
  return {
    status: capability ? 403 : result.erro.codigo === 'CONFLITO_IDEMPOTENCIA' ? 409 : 400,
    body: {
      codigo: capability ? 'ACESSO_PROIBIDO' : result.erro.codigo,
      mensagem: capability
        ? 'As capacidades necessárias à compra não estão disponíveis.'
        : result.erro.codigo === 'CONFLITO_IDEMPOTENCIA'
          ? 'Não é possível reutilizar a chave para este pedido.'
          : 'Revê os campos do pedido.',
      ...(!capability ? { campos: result.erro.campos.map((f) => ({ ...f })) } : {}),
    },
  };
}
