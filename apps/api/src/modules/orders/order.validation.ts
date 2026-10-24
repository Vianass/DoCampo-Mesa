import { isDeepStrictEqual } from 'node:util';
import { mongo } from 'mongoose';
import { saleDefinitions } from '../products/product.constants.js';
import {
  calculateOrderLineSubtotal,
  calculateOrderProductsSubtotal,
  calculateOrderTotal,
  OrderValidationError,
} from './order.calculations.js';
import { orderReceptionDurationMs } from './order.constants.js';
import type { OrderAuditEvent, OrderRecord } from './order.types.js';

export interface OrderPersistenceIssue {
  campo: string;
  mensagem: string;
}

// Defesa técnica de persistência; não ativa os tetos propostos de 100 linhas/1/6/8 MiB.
export const orderPersistenceSafety = {
  maximumBsonBytes: 16 * 1024 * 1024,
  reservePerProcessBytes: 128 * 1024,
  identifierCharacters: 128,
  eventTextCharacters: 2000,
  reasonCharacters: 500,
  complaintCharacters: 4000,
} as const;

export function measureOrderBudget(order: OrderRecord) {
  const active =
    order.reclamacoes.filter((item) => item.estado !== 'resolvida').length +
    order.pedidosCancelamento.filter((item) => item.estado === 'pendente').length +
    order.entrega.propostas.filter((item) => item.estado === 'pendente').length;
  // Medição pessimista real: quatro eventos máximos por processo e dois por linha
  // para cancelamento/regularização, além da reserva base e de metadados.
  const largestEvent: OrderAuditEvent = {
    id: '😀'.repeat(128),
    comandoId: '😀'.repeat(128),
    tipo: '😀'.repeat(128),
    ator: {
      tipo: 'sistema',
      identificador: '😀'.repeat(128),
    },
    ocorridoEm: new Date(0),
    de: '😀'.repeat(128),
    para: '😀'.repeat(128),
    justificacao: '😀'.repeat(2000),
    conteudo: '😀'.repeat(2000),
    versaoObservada: Number.MAX_SAFE_INTEGER,
  };
  const eventBytes = mongo.BSON.calculateObjectSize(largestEvent);
  const reservedBytes =
    (active + 1) * Math.max(orderPersistenceSafety.reservePerProcessBytes, 4 * eventBytes + 8192) +
    order.linhas.length * (2 * eventBytes + 8192);
  const documentBytes = mongo.BSON.calculateObjectSize(order);
  return { documentBytes, reservedBytes, maximumBytes: orderPersistenceSafety.maximumBsonBytes };
}

export function validateOrderPersistence(order: OrderRecord): OrderPersistenceIssue[] {
  const issues: OrderPersistenceIssue[] = [];
  const fail = (campo: string, mensagem: string) => issues.push({ campo, mensagem });
  function unique(values: readonly string[], path: string) {
    if (new Set(values).size !== values.length) fail(path, 'Identificadores repetidos.');
  }
  function history(events: readonly OrderAuditEvent[], path: string, current?: string) {
    unique(
      events.map((event) => event.id),
      path,
    );
    for (let index = 1; index < events.length; index++) {
      if (events[index]!.ocorridoEm < events[index - 1]!.ocorridoEm)
        fail(path, 'Histórico fora de ordem cronológica.');
    }
    if (
      current !== undefined &&
      events.filter((event) => event.para !== undefined).at(-1)?.para !== current
    ) {
      fail(path, 'O histórico não corresponde ao estado atual.');
    }
  }
  function period(value: OrderRecord['entrega']['snapshot']['periodoInicial'], path: string) {
    if (value.fimEm <= value.inicioEm) fail(path, 'O fim deve ser posterior ao início.');
    try {
      new Intl.DateTimeFormat('pt-PT', { timeZone: value.fusoHorario });
    } catch {
      fail(path, 'Fuso horário IANA inválido.');
    }
  }
  unique(
    order.linhas.map((line) => line.id),
    'linhas',
  );
  unique(
    order.linhas.map((line) => line.produto.toString()),
    'linhas',
  );
  try {
    for (const line of order.linhas) {
      const subtotal = calculateOrderLineSubtotal({
        quantidade: line.quantidade,
        precoReferenciaCent: line.precoReferenciaCent,
        unidadeVenda: line.unidadeSnapshot,
      });
      if (subtotal !== line.subtotalCent)
        fail('linhas', 'Subtotal incompatível com o snapshot comercial.');
    }
    const subtotal = calculateOrderProductsSubtotal(order.linhas.map((line) => line.subtotalCent));
    if (subtotal !== order.subtotalProdutosCent)
      fail('subtotalProdutosCent', 'Soma de subtotais incorreta.');
    if (calculateOrderTotal(subtotal, order.taxaEntregaCent) !== order.totalCent)
      fail('totalCent', 'Total inconsistente.');
  } catch (error) {
    if (!(error instanceof OrderValidationError)) throw error;
    fail('linhas', 'Quantidades, unidades ou valores monetários inválidos.');
  }
  if (order.entrega.snapshot.taxaEntregaCent !== order.taxaEntregaCent)
    fail('taxaEntregaCent', 'A taxa não coincide com o snapshot.');
  if (order.entrega.snapshot.tipo === 'levantamento' && order.taxaEntregaCent !== 0)
    fail('taxaEntregaCent', 'Levantamento sem taxa.');
  period(order.entrega.snapshot.periodoInicial, 'entrega.snapshot.periodoInicial');
  unique(
    order.entrega.propostas.map((item) => item.id),
    'entrega.propostas',
  );
  for (const proposal of order.entrega.propostas) {
    period(proposal.periodo, 'entrega.propostas');
    history(proposal.historico, 'entrega.propostas.historico', proposal.estado);
  }
  const agreement = order.entrega.acordoAtual;
  if (
    agreement.origem === 'proposta' &&
    !order.entrega.propostas.some(
      (item) => item.id === agreement.propostaId && item.estado === 'aceite',
    )
  ) {
    fail('entrega.acordoAtual', 'O acordo deve referir uma proposta aceite.');
  }
  history(order.historicoEstado, 'historicoEstado', order.estado);
  history(order.pagamento.historico, 'pagamento.historico', order.pagamento.estado);
  let previousPayment: string | undefined;
  for (const event of order.pagamento.historico) {
    if (event.para === undefined) continue;
    if (previousPayment === 'pago' && event.para !== 'pago') {
      if (
        event.ator.tipo !== 'utilizador' ||
        event.ator.papelNaAcao !== 'administrador' ||
        !event.justificacao
      ) {
        fail('pagamento.historico', 'Reversão de pago exige decisão administrativa justificada.');
      }
    } else if (event.para === 'pago') {
      if (
        event.ator.tipo !== 'utilizador' ||
        event.ator.papelNaAcao !== 'produtor' ||
        (order.pagamento.metodo !== 'dinheiro' && previousPayment !== 'pagamento_comunicado')
      ) {
        fail(
          'pagamento.historico',
          'Recebimento exige produtor; confirmação direta apenas para dinheiro.',
        );
      }
    } else if (previousPayment === 'pagamento_comunicado' && event.para === 'por_pagar') {
      if (
        event.ator.tipo !== 'utilizador' ||
        event.ator.papelNaAcao !== 'produtor' ||
        !event.justificacao
      ) {
        fail('pagamento.historico', 'Rejeição de comunicação exige produtor e justificação.');
      }
    }
    previousPayment = event.para;
  }
  unique(
    order.pedidosCancelamento.map((item) => item.id),
    'pedidosCancelamento',
  );
  for (const request of order.pedidosCancelamento)
    history(request.historico, 'pedidosCancelamento.historico', request.estado);
  unique(
    order.reclamacoes.map((item) => item.id),
    'reclamacoes',
  );
  for (const complaint of order.reclamacoes) {
    history(complaint.historico, 'reclamacoes.historico', complaint.estado);
    history(complaint.intervencoes, 'reclamacoes.intervencoes');
    if (complaint.estado === 'resolvida') {
      const decision = complaint.historico.filter((event) => event.para === 'resolvida').at(-1);
      if (
        decision?.ator.tipo !== 'utilizador' ||
        decision.ator.papelNaAcao === 'produtor' ||
        (decision.ator.papelNaAcao === 'administrador' && !decision.justificacao)
      )
        fail('reclamacoes', 'Resolução exige comprador ou decisão administrativa fundamentada.');
    }
  }
  if ((order.estado === 'cancelada') !== Boolean(order.cancelamento))
    fail('cancelamento', 'Cancelamento e estado devem ser coerentes.');
  if (order.cancelamento) {
    const cancellation = order.cancelamento;
    if (['concluida', 'cancelada'].includes(cancellation.estadoAnterior))
      fail('cancelamento.estadoAnterior', 'Estado anterior incompatível.');
    history(cancellation.historico, 'cancelamento.historico');
    const cancellationDecision = cancellation.historico.at(-1);
    if (
      cancellationDecision?.ator.tipo === 'utilizador' &&
      cancellationDecision.ator.papelNaAcao === 'administrador' &&
      !cancellationDecision.justificacao
    ) {
      fail('cancelamento.historico', 'Cancelamento administrativo exige justificação.');
    }
    if (
      cancellation.pedidoId &&
      !order.pedidosCancelamento.some(
        (request) => request.id === cancellation.pedidoId && request.estado === 'aceite',
      )
    )
      fail('cancelamento.pedidoId', 'Pedido de cancelamento aceite inexistente.');
    unique(
      cancellation.reposicoes.map((item) => item.linhaId),
      'cancelamento.reposicoes',
    );
    const movementIds: string[] = [];
    for (const restoration of cancellation.reposicoes) {
      const line = order.linhas.find((item) => item.id === restoration.linhaId);
      if (
        !line ||
        line.produto.toString() !== restoration.produto.toString() ||
        line.quantidade !== restoration.debitada ||
        line.versaoUnidade !== restoration.versaoUnidade ||
        !isDeepStrictEqual(line.unidadeSnapshot, restoration.unidadeSnapshot)
      )
        fail('cancelamento.reposicoes', 'Reposição não corresponde à linha histórica.');
      if (
        BigInt(restoration.reposta) + BigInt(restoration.pendente) !==
          BigInt(restoration.autorizada) ||
        BigInt(restoration.autorizada) + BigInt(restoration.naoRepor) !==
          BigInt(restoration.debitada)
      )
        fail('cancelamento.reposicoes', 'Saldos de reposição incoerentes.');
      if (
        restoration.movimentos.reduce((sum, item) => sum + BigInt(item.quantidade), 0n) !==
        BigInt(restoration.reposta)
      )
        fail('cancelamento.reposicoes', 'Movimentos não correspondem à quantidade reposta.');
      history(restoration.movimentos, 'cancelamento.reposicoes.movimentos');
      if (
        restoration.movimentos.some(
          (movement) =>
            movement.quantidade > movement.capacidadeObservada ||
            movement.capacidadeObservada >
              saleDefinitions[restoration.unidadeSnapshot.modalidade].stockMaximo,
        )
      ) {
        fail(
          'cancelamento.reposicoes.movimentos',
          'Movimento superior à capacidade observada ou ao teto da modalidade.',
        );
      }
      movementIds.push(...restoration.movimentos.map((item) => item.id));
    }
    unique(movementIds, 'cancelamento.reposicoes.movimentos');
  }
  const reception = order.rececao;
  history(reception.historico, 'rececao.historico');
  if (reception.decorridoMs > orderReceptionDurationMs)
    fail('rececao.decorridoMs', 'Prazo consumido acima de 168 horas.');
  if (
    !reception.entregaDeclaradaEm &&
    (reception.decorridoMs !== 0 ||
      reception.ultimoInicioEm ||
      reception.pausadoDesde ||
      reception.limiteAtualEm)
  )
    fail('rececao', 'Contagem sem declaração de entrega.');
  if (reception.entregaDeclaradaEm && !reception.concluidaEm && order.estado !== 'cancelada') {
    const paused = order.reclamacoes.some((item) => item.estado !== 'resolvida');
    if (paused) {
      if (!reception.pausadoDesde || reception.ultimoInicioEm || reception.limiteAtualEm)
        fail('rececao', 'Reclamações pendentes exigem cronómetro pausado.');
    } else if (
      !reception.ultimoInicioEm ||
      !reception.limiteAtualEm ||
      reception.pausadoDesde ||
      reception.limiteAtualEm.getTime() !==
        reception.ultimoInicioEm.getTime() + orderReceptionDurationMs - reception.decorridoMs
    )
      fail('rececao', 'Contagem ativa incompatível com o tempo restante.');
  }
  if (
    reception.confirmacaoRececaoEm &&
    reception.entregaDeclaradaEm &&
    reception.confirmacaoRececaoEm < reception.entregaDeclaradaEm
  )
    fail('rececao', 'Receção anterior à declaração de entrega.');
  if (reception.confirmacaoRececaoEm && order.estado !== 'concluida')
    fail('rececao', 'Confirmação de receção exige conclusão registada.');
  if (order.estado === 'concluida') {
    if (!reception.concluidaEm || !reception.modoConclusao || reception.historico.length === 0)
      fail('rececao', 'Conclusão exige data, modo e auditoria.');
    if (reception.modoConclusao === 'comprador' && !reception.confirmacaoRececaoEm)
      fail('rececao', 'Falta confirmação de receção.');
    if (reception.modoConclusao === 'intervencao_administrativa' && !reception.motivoConclusao)
      fail('rececao', 'Intervenção administrativa exige motivo.');
    if (
      reception.modoConclusao === 'automatica' &&
      (!reception.entregaDeclaradaEm ||
        reception.decorridoMs !== orderReceptionDurationMs ||
        order.reclamacoes.some((item) => item.estado !== 'resolvida'))
    )
      fail('rececao', 'Conclusão automática incompatível com o prazo/reclamações.');
  } else if (reception.concluidaEm || reception.modoConclusao)
    fail('rececao', 'Conclusão incompatível com o estado da encomenda.');
  if (order.idempotencia) {
    const anchor = order.idempotencia;
    const receipt = anchor.resultadoOriginal;
    const ids = receipt.encomendas.map((item) => item.orderId.toString());
    unique(ids, 'idempotencia.resultadoOriginal.encomendas');
    unique(
      receipt.encomendas.map((item) => item.produtor.toString()),
      'idempotencia.resultadoOriginal.encomendas',
    );
    if (
      receipt.operacaoCompraId !== order.operacaoCompraId ||
      !ids.includes(order._id.toString()) ||
      !isDeepStrictEqual([...ids].sort(), anchor.encomendas.map((id) => id.toString()).sort())
    )
      fail('idempotencia', 'Manifesto e recibo incompatíveis.');
    const own = receipt.encomendas.find((item) => item.orderId.toString() === order._id.toString());
    if (
      !own ||
      own.produtor.toString() !== order.produtor.toString() ||
      own.totalCent !== order.totalCent
    )
      fail('idempotencia', 'Recibo não corresponde à encomenda âncora.');
    try {
      if (
        calculateOrderProductsSubtotal(receipt.encomendas.map((item) => item.totalCent)) !==
        receipt.totalCent
      )
        fail('idempotencia', 'Total do recibo inconsistente.');
    } catch (error) {
      if (!(error instanceof OrderValidationError)) throw error;
      fail('idempotencia', 'Valores do recibo inválidos.');
    }
  }
  const budget = measureOrderBudget(order);
  if (budget.documentBytes + budget.reservedBytes > budget.maximumBytes)
    fail(
      'reclamacoes',
      'Capacidade BSON insuficiente para preservar documento e reserva de auditoria.',
    );
  return issues;
}

export function validateOrderEvolution(
  before: OrderRecord,
  after: OrderRecord,
): OrderPersistenceIssue[] {
  const issues: OrderPersistenceIssue[] = [];
  const same = (a: unknown, b: unknown, campo: string) => {
    if (!isDeepStrictEqual(a, b))
      issues.push({ campo, mensagem: 'Snapshot ou informação histórica imutável.' });
  };
  const prefix = (a: readonly unknown[], b: readonly unknown[], campo: string) =>
    same(a, b.slice(0, a.length), campo);
  const without = (value: object, fields: readonly string[]) =>
    Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
  for (const field of [
    '_id',
    'operacaoCompraId',
    'comprador',
    'produtor',
    'versao',
    'linhas',
    'subtotalProdutosCent',
    'taxaEntregaCent',
    'totalCent',
    'moeda',
    'createdAt',
    'idempotencia',
  ] as const)
    same(before[field], after[field], field);
  same(before.entrega.snapshot, after.entrega.snapshot, 'entrega.snapshot');
  same(before.pagamento.metodo, after.pagamento.metodo, 'pagamento.metodo');
  prefix(before.historicoEstado, after.historicoEstado, 'historicoEstado');
  prefix(before.pagamento.historico, after.pagamento.historico, 'pagamento.historico');
  prefix(before.rececao.historico, after.rececao.historico, 'rececao.historico');
  for (const field of [
    'entregaDeclaradaEm',
    'confirmacaoRececaoEm',
    'concluidaEm',
    'modoConclusao',
    'motivoConclusao',
  ] as const) {
    if (before.rececao[field] !== undefined)
      same(before.rececao[field], after.rececao[field], 'rececao.' + field);
  }
  for (const [a, b, path] of [
    [before.entrega.propostas, after.entrega.propostas, 'entrega.propostas'],
    [before.pedidosCancelamento, after.pedidosCancelamento, 'pedidosCancelamento'],
    [before.reclamacoes, after.reclamacoes, 'reclamacoes'],
  ] as const) {
    if (b.length < a.length) {
      issues.push({ campo: path, mensagem: 'Não eliminar históricos.' });
      continue;
    }
    for (let i = 0; i < a.length; i++) {
      const previous = a[i]!;
      const next = b[i]!;
      // Intervenções são append-only; o restante conteúdo original não é reescrito.
      if ('intervencoes' in previous && 'intervencoes' in next)
        prefix(previous.intervencoes, next.intervencoes, path);
      same(
        without(previous, ['estado', 'historico', 'intervencoes']),
        without(next, ['estado', 'historico', 'intervencoes']),
        path,
      );
      prefix(previous.historico, next.historico, path);
    }
  }
  if (before.cancelamento) {
    const next = after.cancelamento;
    if (!next) issues.push({ campo: 'cancelamento', mensagem: 'Não eliminar cancelamento.' });
    else {
      same(before.cancelamento.estadoAnterior, next.estadoAnterior, 'cancelamento');
      same(before.cancelamento.motivo, next.motivo, 'cancelamento');
      same(before.cancelamento.pedidoId, next.pedidoId, 'cancelamento');
      prefix(before.cancelamento.historico, next.historico, 'cancelamento.historico');
      same(
        before.cancelamento.reposicoes.length,
        next.reposicoes.length,
        'cancelamento.reposicoes',
      );
      before.cancelamento.reposicoes.forEach((previous, index) => {
        const current = next.reposicoes[index];
        if (!current) return;
        same(
          without(previous, ['reposta', 'pendente', 'movimentos']),
          without(current, ['reposta', 'pendente', 'movimentos']),
          'cancelamento.reposicoes',
        );
        prefix(previous.movimentos, current.movimentos, 'cancelamento.reposicoes.movimentos');
        if (current.reposta < previous.reposta)
          issues.push({
            campo: 'cancelamento.reposicoes',
            mensagem: 'Não reverter reposições registadas.',
          });
      });
    }
  }
  return issues;
}
