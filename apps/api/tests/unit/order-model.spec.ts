import { createConnection, Error as MongooseError, Types } from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
import { orderStates, orderReceptionDurationMs } from '../../src/modules/orders/order.constants.js';
import type { OrderRecord } from '../../src/modules/orders/order.types.js';
import {
  measureOrderBudget,
  orderPersistenceSafety,
} from '../../src/modules/orders/order.validation.js';
import { serializeOrderSummary } from '../../src/modules/orders/order.serialization.js';
import {
  homeDelivery,
  idempotencyInput,
  orderComplaintInput,
  orderEvent,
  orderFixtureDate,
  orderInput,
  orderPeriod,
} from '../support/order-fixtures.js';

const connection = createConnection();
const Order = createOrderModel(connection);
afterAll(() => connection.close());

async function invalid(path: string, value: unknown) {
  const document = new Order(orderInput());
  document.set(path, value);
  await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
}

describe('schema orders isolado', () => {
  it('regista só Order, com factory reutilizável e criação/índices automáticos desligados', () => {
    expect(createOrderModel(connection)).toBe(Order);
    expect(connection.modelNames()).toEqual(['Order']);
    expect(Order.collection.name).toBe('orders');
    expect(Order.schema.get('autoCreate')).toBe(false);
    expect(Order.schema.get('autoIndex')).toBe(false);
    expect(Order.schema.get('versionKey')).toBe('versao');
    expect(Order.schema.get('optimisticConcurrency')).toBe(true);
  });

  it.each(orderStates)('aceita uma fixture coerente no estado %s', async (state) => {
    await expect(new Order(orderInput(state)).validate()).resolves.toBeUndefined();
  });

  it('não exige na criação dados que só existem no ciclo posterior', async () => {
    const document = new Order(orderInput());
    await document.validate();
    expect(document.cancelamento).toBeUndefined();
    expect(document.idempotencia).toBeUndefined();
    expect(document.rececao.entregaDeclaradaEm).toBeUndefined();
    expect(document.rececao.concluidaEm).toBeUndefined();
    expect(document.reclamacoes).toHaveLength(0);
  });

  it.each([
    'operacaoCompraId',
    'comprador',
    'produtor',
    'linhas',
    'subtotalProdutosCent',
    'taxaEntregaCent',
    'totalCent',
    'moeda',
    'entrega',
    'pagamento',
    'estado',
    'historicoEstado',
    'rececao',
  ])('exige %s', async (path) => {
    await invalid(path, undefined);
  });

  it.each([
    ['estado', 'entregue'],
    ['pagamento.estado', 'confirmado'],
    ['pagamento.metodo', 'cartao'],
    ['linhas.0.quantidade', 0],
    ['linhas.0.quantidade', 1.5],
    ['linhas.0.quantidade', '500'],
    ['linhas.0.quantidade', 10_000_001],
    ['linhas.0.precoReferenciaCent', 1_000_001],
    ['linhas.0.precoReferenciaCent', 0],
    ['linhas.0.subtotalCent', 0],
    ['linhas.0.subtotalCent', 76],
    ['subtotalProdutosCent', 76],
    ['totalCent', 76],
    ['taxaEntregaCent', -1],
    ['totalCent', Number.MAX_SAFE_INTEGER + 1],
    ['linhas.0.unidadeSnapshot.quantidadeReferencia', 100],
    ['linhas.0.unidadeSnapshot.unidadeBase', 'kg'],
    ['linhas.0.unidadeSnapshot.quantidadeMinima', 501],
    ['linhas.0.unidadeSnapshot.incrementoCompra', 75],
    ['linhas', []],
    ['linhas', [null]],
    ['reclamacoes', [null]],
    ['historicoEstado', []],
    ['comprador', 'invalido'],
    ['produtor', 123],
    ['linhas.0.produto', 'invalido'],
    ['createdAt', new Date(NaN)],
    ['entrega.snapshot.periodoInicial.inicioEm', '2026-10-23'],
    ['entrega.snapshot.periodoInicial.fimEm', new Date('2026-10-23T08:00:00Z')],
    ['entrega.snapshot.periodoInicial.fusoHorario', 'Zona/Inexistente'],
    ['rececao.duracaoMs', 1],
    ['rececao.decorridoMs', orderReceptionDurationMs + 1],
    ['rececao.ultimoInicioEm', new Date(NaN)],
    ['rececao.decorridoMs', 1],
    ['versao', -1],
    ['versao', 0.5],
    ['historicoEstado.0.ator.userId', undefined],
    ['historicoEstado.0.ator.papelNaAcao', 'visitante'],
    ['historicoEstado.0.para', 'entregue'],
    ['historicoEstado.0.ocorridoEm', new Date(NaN)],
    ['historicoEstado.0.versaoObservada', -1],
  ] as const)('recusa persistência inválida de %s = %s', async (path, value) => {
    await invalid(path, value);
  });

  it('rejeita linhas por produto repetido mesmo que os totais sejam coerentes', async () => {
    const document = new Order(orderInput());
    const originalLine = document.toObject({ transform: false }).linhas[0];
    document.set('linhas', [originalLine, { ...originalLine, id: 'outra-linha' }]);
    document.set({ subtotalProdutosCent: 150, totalCent: 150 });
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
  });

  it('aceita entrega privada e exige taxa/snapshot coerentes', async () => {
    await expect(
      new Order(
        orderInput('pendente', { entrega: homeDelivery(), taxaEntregaCent: 250, totalCent: 325 }),
      ).validate(),
    ).resolves.toBeUndefined();
    await invalid('entrega.snapshot.taxaEntregaCent', 250);
    await invalid('entrega.snapshot.morada', 'Não se aplica a levantamento');
    const delivery = new Order(
      orderInput('pendente', { entrega: homeDelivery(), taxaEntregaCent: 250, totalCent: 325 }),
    );
    delivery.set('entrega.snapshot.morada', undefined);
    await expect(delivery.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
  });

  it('aceita várias reclamações semelhantes e propostas/intervenções auditadas', async () => {
    const document = new Order(
      orderInput('pronta', { reclamacoes: [orderComplaintInput('a'), orderComplaintInput('b')] }),
    );
    await document.validate();
    expect(document.reclamacoes).toHaveLength(2);
    expect(document.reclamacoes[0]?.descricao).toBe(document.reclamacoes[1]?.descricao);
  });

  it('recusa IDs repetidos, descrições excessivas e fecho unilateral pelo produtor', async () => {
    const complaint = orderComplaintInput('a');
    for (const reclamacoes of [
      [complaint, complaint],
      [{ ...complaint, descricao: '😀'.repeat(4001) }],
      [
        {
          ...complaint,
          estado: 'resolvida',
          historico: [orderEvent('fecho', 'resolvida', 'produtor')],
        },
      ],
    ])
      await invalid('reclamacoes', reclamacoes);
  });

  it('conta limites de texto por pontos de código e não trunca Unicode', async () => {
    const descricao = '😀'.repeat(4000);
    const document = new Order(
      orderInput('pendente', { reclamacoes: [{ ...orderComplaintInput('unicode'), descricao }] }),
    );
    await document.validate();
    expect(document.reclamacoes[0]?.descricao).toBe(descricao);
  });

  it('representa proposta pendente sem mudar o acordo e exige aceite para a nova referência', async () => {
    const document = new Order(orderInput());
    document.set('entrega.propostas', [
      {
        id: 'p1',
        periodo: orderPeriod(),
        estado: 'pendente',
        historico: [orderEvent('p1', 'pendente', 'produtor')],
      },
    ]);
    await document.validate();
    expect(document.entrega.acordoAtual.origem).toBe('inicial');
    document.set('entrega.acordoAtual', { origem: 'proposta', propostaId: 'p1' });
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
    document.set('entrega.propostas.0.estado', 'aceite');
    document.set('entrega.propostas.0.historico', [
      orderEvent('p1', 'pendente', 'produtor'),
      orderEvent('p1-aceite', 'aceite', 'comprador', 1),
    ]);
    await expect(document.validate()).resolves.toBeUndefined();
  });

  it('um pedido pendente não impede representar preparação', async () => {
    const document = new Order(
      orderInput('em_preparacao', {
        pedidosCancelamento: [
          {
            id: 'pedido',
            estado: 'pendente',
            motivo: 'Motivo fictício',
            criadoEm: orderFixtureDate,
            historico: [orderEvent('pedido', 'pendente')],
          },
        ],
      }),
    );
    await expect(document.validate()).resolves.toBeUndefined();
  });

  it('valida os saldos de reposição e não deduz stock nem regulariza pendências', async () => {
    const document = new Order(orderInput('cancelada'));
    await document.validate();
    expect(document.cancelamento?.reposicoes[0]?.pendente).toBe(200);
    document.set('cancelamento.reposicoes.0.pendente', 199);
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
  });

  it('recusa movimentos duplicados e reposição de outra linha', async () => {
    const document = new Order(orderInput('cancelada'));
    document.set('cancelamento.reposicoes.0.linhaId', 'inexistente');
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
    const duplicate = new Order(orderInput('cancelada'));
    const event = duplicate.toObject({ transform: false }).cancelamento!.reposicoes[0]!
      .movimentos[0]!;
    duplicate.set('cancelamento.reposicoes.0.movimentos', [
      { ...event, quantidade: 100 },
      { ...event, quantidade: 100 },
    ]);
    await expect(duplicate.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
  });

  it('representa pagamento comunicado e pago sem processar dinheiro', async () => {
    const document = new Order(orderInput());
    document.set('pagamento.estado', 'pagamento_comunicado');
    document.set('pagamento.historico', [
      orderEvent('p0', 'por_pagar'),
      orderEvent('p1', 'pagamento_comunicado', 'comprador', 1),
    ]);
    await document.validate();
    document.set('pagamento.estado', 'pago');
    document.set('pagamento.historico', [
      ...document.pagamento.historico,
      orderEvent('p2', 'pago', 'produtor', 2),
    ]);
    await expect(document.validate()).resolves.toBeUndefined();
  });

  it('reversão de pagamento confirmado exige administrador e justificação preservada', async () => {
    for (const papel of ['produtor', 'administrador'] as const) {
      const document = new Order(orderInput());
      document.set('pagamento.historico', [
        orderEvent('p0', 'por_pagar'),
        orderEvent('p1', 'pago', 'produtor', 1),
        orderEvent('p2', 'por_pagar', papel, 2),
      ]);
      await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
    }
    const document = new Order(orderInput());
    document.set('pagamento.historico', [
      orderEvent('p0', 'por_pagar'),
      orderEvent('p1', 'pago', 'produtor', 1),
      {
        ...orderEvent('p2', 'por_pagar', 'administrador', 2),
        justificacao: 'Correção fictícia fundamentada.',
      },
    ]);
    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.pagamento.historico).toHaveLength(3);
  });

  it('permite vários acontecimentos do mesmo comando, com IDs próprios', async () => {
    const document = new Order(orderInput());
    document.set('historicoEstado', [
      orderEvent('inicial', 'pendente'),
      { ...orderEvent('nota'), comandoId: 'comando-inicial' },
    ]);
    await expect(document.validate()).resolves.toBeUndefined();
  });

  it('não normaliza silenciosamente uma chave opaca nem aceita um hash inválido', async () => {
    const document = new Order(orderInput());
    const metadata = idempotencyInput(document._id, document.operacaoCompraId);
    document.set('idempotencia', { ...metadata, chave: ' chave-com-espacos ' });
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
    document.set('idempotencia', { ...metadata, hashCanonico: 'nao-e-sha256' });
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
  });

  it('representa conclusão automática auditada sem timer ou alteração de pagamento', async () => {
    const document = new Order(orderInput('concluida'));
    document.set('rececao.modoConclusao', 'automatica');
    document.set('rececao.confirmacaoRececaoEm', undefined);
    document.set('rececao.decorridoMs', orderReceptionDurationMs);
    document.set(
      'rececao.concluidaEm',
      new Date(orderFixtureDate.getTime() + orderReceptionDurationMs),
    );
    document.set('rececao.historico', [
      {
        ...orderEvent('conclusao-automatica'),
        ator: { tipo: 'sistema', identificador: 'job-ficticio' },
      },
    ]);
    await document.validate();
    expect(document.pagamento.estado).toBe('por_pagar');
    document.set('rececao.decorridoMs', orderReceptionDurationMs - 1);
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
  });

  it('representa contagem ativa e pausa única com várias reclamações', async () => {
    const document = new Order(orderInput('pronta'));
    document.set('rececao.entregaDeclaradaEm', orderFixtureDate);
    document.set('rececao.ultimoInicioEm', orderFixtureDate);
    document.set(
      'rececao.limiteAtualEm',
      new Date(orderFixtureDate.getTime() + orderReceptionDurationMs),
    );
    await document.validate();
    document.set('reclamacoes', [orderComplaintInput('a'), orderComplaintInput('b')]);
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
    document.set('rececao.ultimoInicioEm', null);
    document.set('rececao.limiteAtualEm', null);
    document.set('rececao.pausadoDesde', orderFixtureDate);
    await expect(document.validate()).resolves.toBeUndefined();
  });

  it('valida manifesto e recibo da âncora sem exigir idempotência em todas as orders', async () => {
    const document = new Order(orderInput());
    document.set('idempotencia', idempotencyInput(document._id, document.operacaoCompraId));
    await document.validate();
    document.set('idempotencia.resultadoOriginal.totalCent', 76);
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
  });
});

describe('preservação de snapshots e auditoria em documentos hidratados', () => {
  it.each([
    'linhas.0.nome',
    'entrega.snapshot.localLevantamento',
    'pagamento.metodo',
    'operacaoCompraId',
    'totalCent',
    'versao',
  ])('recusa reescrita de %s', async (path) => {
    const document = Order.hydrate(orderInput());
    document.set(
      path,
      path === 'totalCent' || path === 'versao'
        ? 1
        : path === 'pagamento.metodo'
          ? 'mb_way'
          : 'Valor alterado',
    );
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
  });

  it('recusa reescrita de eventos mas aceita acrescentar um novo evento', async () => {
    const document = Order.hydrate(orderInput());
    document.set('historicoEstado.0.tipo', 'alterado');
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
    const appended = Order.hydrate(orderInput());
    appended.set('historicoEstado', [
      ...appended.historicoEstado,
      orderEvent('nota', undefined, 'produtor', 1),
    ]);
    await expect(appended.validate()).resolves.toBeUndefined();
  });

  it('recusa eliminar reclamações ou alterar conteúdo original', async () => {
    for (const value of [[], [{ ...orderComplaintInput('a'), descricao: 'Reescrita' }]]) {
      const document = Order.hydrate(
        orderInput('pendente', { reclamacoes: [orderComplaintInput('a')] }),
      );
      document.set('reclamacoes', value);
      await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
    }
  });
});

describe('serialização e capacidade BSON', () => {
  it('minimiza JSON/toObject mesmo com contactos, reclamações, âncora e atores internos', () => {
    const document = new Order(
      orderInput('pendente', {
        entrega: homeDelivery(),
        taxaEntregaCent: 250,
        totalCent: 325,
        reclamacoes: [orderComplaintInput('privada')],
      }),
    );
    document.set('idempotencia', idempotencyInput(document._id, document.operacaoCompraId));
    for (const summary of [
      document.toJSON(),
      document.toObject(),
      JSON.parse(JSON.stringify(document)),
    ]) {
      const text = JSON.stringify(summary);
      for (const secret of [
        'morada',
        'contacto',
        'idempotencia',
        'hashCanonico',
        'chave',
        'userId',
        'versao',
        'descricao',
        'comandoId',
      ])
        expect(text).not.toContain(secret);
      expect(summary).toMatchObject({ estado: 'pendente', totalCent: 325 });
    }
  });

  it.each([null, undefined, {}, { estado: 'pendente' }, { linhas: [{ nome: 'Parcial' }] }])(
    'serializa projeção incompleta sem acessos inseguros %#',
    (value) => {
      expect(() => serializeOrderSummary(value)).not.toThrow();
    },
  );

  it('mede BSON real e reserva espaço proporcional aos processos/linhas', () => {
    const document = new Order(orderInput());
    const raw = document.toObject({ transform: false }) as OrderRecord;
    const baseline = measureOrderBudget(raw);
    const active = measureOrderBudget({
      ...raw,
      reclamacoes: [orderComplaintInput('a'), orderComplaintInput('b')],
    });
    expect(active.reservedBytes - baseline.reservedBytes).toBe(
      2 * orderPersistenceSafety.reservePerProcessBytes,
    );
    expect(active.documentBytes).toBeGreaterThan(baseline.documentBytes);
    expect(active.maximumBytes).toBe(16 * 1024 * 1024);
  });

  it('recusa crescimento inseguro sem truncar reclamações ou apagar histórico', async () => {
    const reclamacoes = Array.from({ length: 130 }, (_, index) =>
      orderComplaintInput('r-' + index),
    );
    const document = new Order(orderInput('pendente', { reclamacoes }));
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
    expect(document.reclamacoes).toHaveLength(130);
    expect(document.reclamacoes[0]?.historico).toHaveLength(1);
  });

  it('também recusa um snapshot que excede o limite BSON real, sem truncar o nome', async () => {
    const document = new Order(orderInput());
    const nome = 'x'.repeat(16 * 1024 * 1024);
    document.set('linhas.0.nome', nome);
    await expect(document.validate()).rejects.toBeInstanceOf(MongooseError.ValidationError);
    expect(document.linhas[0]?.nome.length).toBe(nome.length);
  });

  it('reserva espaço para quatro eventos de fecho Unicode mesmo perto do limite BSON', async () => {
    const initial = new Order(
      orderInput('pendente', { reclamacoes: [orderComplaintInput('capacidade')] }),
    );
    const before = measureOrderBudget(initial.toObject({ transform: false }) as OrderRecord);
    const padding = before.maximumBytes - before.documentBytes - before.reservedBytes - 4096;
    initial.set('linhas.0.nome', initial.linhas[0]!.nome + 'x'.repeat(padding));
    await initial.validate();
    const loaded = Order.hydrate(initial.toObject({ transform: false }));
    const events = Array.from({ length: 4 }, (_, index) => ({
      ...orderEvent(
        'fecho-' + index,
        index === 3 ? 'resolvida' : undefined,
        'comprador',
        index + 1,
      ),
      comandoId: '😀'.repeat(128),
      tipo: '😀'.repeat(128),
      justificacao: '😀'.repeat(2000),
      conteudo: '😀'.repeat(2000),
    }));
    loaded.set('reclamacoes.0.estado', 'resolvida');
    loaded.set('reclamacoes.0.historico', [...loaded.reclamacoes[0]!.historico, ...events]);
    await expect(loaded.validate()).resolves.toBeUndefined();
    expect(loaded.reclamacoes[0]?.historico).toHaveLength(5);
    const after = measureOrderBudget(loaded.toObject({ transform: false }) as OrderRecord);
    expect(after.documentBytes + after.reservedBytes).toBeLessThan(after.maximumBytes);
  });

  it('não transforma a proposta de 100 linhas num limite funcional aprovado', async () => {
    const document = new Order(orderInput());
    document.set(
      'linhas',
      Array.from({ length: 101 }, (_, index) => ({
        id: 'linha-' + index,
        produto: new Types.ObjectId(),
        nome: 'Produto fictício',
        quantidade: 500,
        precoReferenciaCent: 150,
        unidadeSnapshot: {
          modalidade: 'peso',
          unidadeBase: 'g',
          quantidadeReferencia: 1000,
          quantidadeMinima: 250,
          incrementoCompra: 50,
        },
        versaoUnidade: 0,
        subtotalCent: 75,
      })),
    );
    document.set({ subtotalProdutosCent: 7575, totalCent: 7575 });
    await expect(document.validate()).resolves.toBeUndefined();
  });
});
