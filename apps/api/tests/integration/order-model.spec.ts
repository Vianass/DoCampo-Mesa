import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import type { HydratedDocument, Model } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/database/connection.js';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
import { orderStates, orderReceptionDurationMs } from '../../src/modules/orders/order.constants.js';
import type { OrderRecord } from '../../src/modules/orders/order.types.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import {
  homeDelivery,
  idempotencyInput,
  orderComplaintInput,
  orderEvent,
  orderFixtureDate,
  orderInput,
  orderPeriod,
} from '../support/order-fixtures.js';
import { userInput, producerInput, decisionInput } from '../support/identity-fixtures.js';
import { publishedProductInput } from '../support/product-fixtures.js';

const configuration = parseEnvironment({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
  MONGODB_DB_NAME: `docampo_test_${randomUUID().replaceAll('-', '')}`,
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: '2000',
});
let database: Awaited<ReturnType<typeof connectDatabase>> | undefined;
let Order: Model<OrderRecord>;

beforeAll(async () => {
  database = await connectDatabase(configuration);
  const hello = await database.connection.db!.admin().command({ hello: 1 });
  expect(hello.setName).toBe('rs-dcm-test');
  expect(hello.isWritablePrimary).toBe(true);
  const info = await database.connection.db!.admin().command({ buildInfo: 1 });
  expect(info.version).toBe('8.0.34');
  Order = createOrderModel(database.connection);
  await Order.createCollection();
  await Order.createIndexes();
});
afterAll(async () => {
  if (!database) return;
  try {
    await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});

describe('persistência orders em MongoDB real, sem checkout', () => {
  it('cria apenas a coleção orders e os cinco índices explícitos além de _id', async () => {
    expect(database!.connection.modelNames()).toEqual(['Order']);
    expect(
      (await database!.connection.db!.listCollections().toArray()).map((item) => item.name),
    ).toEqual(['orders']);
    const indexes = await Order.listIndexes();
    expect(indexes).toHaveLength(11);
    for (const key of [
      { createdAt: -1, _id: -1 },
      { estado: 1, createdAt: -1, _id: -1 },
      { 'pagamento.estado': 1, createdAt: -1, _id: -1 },
      { produtor: 1, createdAt: -1, _id: -1 },
      { comprador: 1, createdAt: -1, _id: -1 },
    ])
      expect(indexes).toContainEqual(expect.objectContaining({ key }));
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { comprador: 1, createdAt: -1 } }),
    );
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { produtor: 1, estado: 1, createdAt: -1 } }),
    );
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { operacaoCompraId: 1, produtor: 1 }, unique: true }),
    );
    expect(indexes).toContainEqual(
      expect.objectContaining({
        key: { 'idempotencia.chave': 1 },
        unique: true,
        partialFilterExpression: { 'idempotencia.chave': { $type: 'string' } },
      }),
    );
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { estado: 1, 'rececao.limiteAtualEm': 1 } }),
    );
    expect(indexes.some((item) => item.expireAfterSeconds !== undefined)).toBe(false);
  });

  it.each(orderStates)(
    'persiste e relê %s com históricos sem campos posteriores obrigatórios',
    async (state) => {
      const created = await Order.create(orderInput(state));
      const read = await Order.findById(created._id).orFail();
      expect(read.estado).toBe(state);
      expect(read.historicoEstado.at(-1)?.para).toBe(state);
      expect(read.versao).toBe(0);
      expect(read.createdAt).toBeInstanceOf(Date);
      expect(read.linhas[0]).toMatchObject({
        quantidade: 500,
        precoReferenciaCent: 150,
        subtotalCent: 75,
      });
      expect(read.linhas[0]?.unidadeSnapshot).toMatchObject({
        modalidade: 'peso',
        unidadeBase: 'g',
        quantidadeReferencia: 1000,
      });
      if (state === 'cancelada')
        expect(read.cancelamento?.reposicoes[0]).toMatchObject({
          reposta: 200,
          pendente: 200,
          naoRepor: 100,
        });
    },
  );

  it.each([
    { totalCent: 76 },
    { estado: 'entregue' },
    { linhas: [] },
    { totalCent: Number.MAX_SAFE_INTEGER + 1 },
    { subtotalProdutosCent: 0 },
    { taxaEntregaCent: -1 },
  ])('recusa documento inválido sem persistir %#', async (overrides) => {
    const before = await Order.countDocuments();
    await expect(Order.create(orderInput('pendente', overrides))).rejects.toMatchObject({
      name: 'ValidationError',
    });
    expect(await Order.countDocuments()).toBe(before);
  });

  it('permite várias encomendas da mesma operação para produtores diferentes', async () => {
    const operation = 'grupo-ficticio-' + randomUUID();
    const first = await Order.create(orderInput('pendente', { operacaoCompraId: operation }));
    const second = await Order.create(
      orderInput('pendente', { operacaoCompraId: operation, produtor: new Types.ObjectId() }),
    );
    expect(first._id.equals(second._id)).toBe(false);
    expect(await Order.countDocuments({ operacaoCompraId: operation })).toBe(2);
  });

  it('índice composto rejeita concorrência duplicada por operação/produtor', async () => {
    const operation = 'duplicada-' + randomUUID();
    const results = await Promise.allSettled([
      Order.create(orderInput('pendente', { operacaoCompraId: operation })),
      Order.create(orderInput('pendente', { operacaoCompraId: operation })),
    ]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((item) => item.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toMatchObject({ code: 11000 });
    expect(await Order.countDocuments({ operacaoCompraId: operation })).toBe(1);
  });

  it('a chave única é global mesmo entre operações/produtores disjuntos', async () => {
    const first = new Order(orderInput());
    const second = new Order(orderInput('pendente', { produtor: new Types.ObjectId() }));
    const firstAnchor = idempotencyInput(first._id, first.operacaoCompraId);
    const secondAnchor = idempotencyInput(second._id, second.operacaoCompraId);
    secondAnchor.chave = firstAnchor.chave;
    secondAnchor.resultadoOriginal.encomendas[0]!.produtor = second.produtor;
    first.set('idempotencia', firstAnchor);
    second.set('idempotencia', secondAnchor);
    const results = await Promise.allSettled([first.save(), second.save()]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((item) => item.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toMatchObject({ code: 11000 });
  });

  it('índice parcial permite várias orders sem chave e preserva recibo original', async () => {
    const document = new Order(orderInput());
    document.set('idempotencia', idempotencyInput(document._id, document.operacaoCompraId));
    await document.save();
    const read = await Order.findById(document._id).orFail();
    expect(read.idempotencia?.resultadoOriginal.totalCent).toBe(75);
    read.set('idempotencia.resultadoOriginal.totalCent', 76);
    await expect(read.save()).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('persiste entrega privada mas JSON e toObject comuns não expõem contactos/auditoria', async () => {
    const created = await Order.create(
      orderInput('pendente', {
        entrega: homeDelivery(),
        taxaEntregaCent: 250,
        totalCent: 325,
        reclamacoes: [orderComplaintInput('a'), orderComplaintInput('b')],
      }),
    );
    const read = await Order.findById(created._id).orFail();
    expect(read.get('entrega.snapshot.morada')).toBe('Morada fictícia privada');
    expect(read.reclamacoes).toHaveLength(2);
    for (const projected of [read.toJSON(), read.toObject()]) {
      const text = JSON.stringify(projected);
      for (const secret of [
        'Morada fictícia privada',
        'Contacto fictício privado',
        'descricao',
        'ator',
        'userId',
        'versao',
        'comandoId',
      ])
        expect(text).not.toContain(secret);
      expect(projected.totalCent).toBe(325);
    }
  });

  it.each([
    'estado totalCent',
    'linhas.nome',
    '-entrega.snapshot.morada',
    '-historicoEstado.ator.userId',
  ])('leitura parcial %s é segura e não pode ser guardada', async (selection) => {
    const created = await Order.create(orderInput());
    const read = await Order.findById(created._id).select(selection).orFail();
    expect(() => read.toJSON()).not.toThrow();
    expect(() => read.toObject()).not.toThrow();
    await expect(read.save()).rejects.toThrow('documento completo');
  });

  it('não permite reescrever nomes/quantidades/condições históricas após criação', async () => {
    const created = await Order.create(orderInput());
    for (const [path, value] of [
      ['linhas.0.nome', 'Reescrito'],
      ['entrega.snapshot.localLevantamento', 'Outro local'],
      ['comprador', new Types.ObjectId()],
      ['historicoEstado.0.tipo', 'Reescrito'],
    ] as const) {
      const read = await Order.findById(created._id).orFail();
      read.set(path, value);
      await expect(read.save()).rejects.toMatchObject({ name: 'ValidationError' });
    }
    expect((await Order.findById(created._id).orFail()).linhas[0]?.nome).toBe('Produto fictício');
  });

  it('guarda eventos adicionais e incrementa versao sem mudar snapshots', async () => {
    const created = await Order.create(orderInput());
    const read = await Order.findById(created._id).orFail();
    read.set('historicoEstado', [
      ...read.historicoEstado,
      orderEvent('nota-' + randomUUID(), undefined, 'produtor', 1),
    ]);
    await read.save();
    expect(read.versao).toBe(1);
    const persisted = await Order.findById(read._id).orFail();
    expect(persisted.versao).toBe(1);
    expect(persisted.historicoEstado).toHaveLength(2);
  });

  it('optimistic concurrency impede que uma gravação antiga perca auditoria concorrente', async () => {
    const created = await Order.create(orderInput());
    const first = await Order.findById(created._id).orFail();
    const second = await Order.findById(created._id).orFail();
    first.set('historicoEstado', [
      ...first.historicoEstado,
      orderEvent('primeiro', undefined, 'produtor', 1),
    ]);
    second.set('historicoEstado', [
      ...second.historicoEstado,
      orderEvent('segundo', undefined, 'produtor', 1),
    ]);
    await first.save();
    await expect(second.save()).rejects.toMatchObject({ name: 'VersionError' });
    expect((await Order.findById(created._id).orFail()).historicoEstado.at(-1)?.id).toBe(
      'primeiro',
    );
  });

  it('não elimina reclamações nem eventos de regularização já persistidos', async () => {
    const created = await Order.create(
      orderInput('pendente', { reclamacoes: [orderComplaintInput('a'), orderComplaintInput('b')] }),
    );
    const read = await Order.findById(created._id).orFail();
    read.set('reclamacoes', []);
    await expect(read.save()).rejects.toMatchObject({ name: 'ValidationError' });
    const cancelled = await Order.create(orderInput('cancelada'));
    cancelled.set('cancelamento.reposicoes.0.movimentos', []);
    await expect(cancelled.save()).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('persiste pedido pendente durante preparação, proposta e pagamento comunicado', async () => {
    const created = await Order.create(
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
        pagamento: {
          metodo: 'mb_way',
          estado: 'pagamento_comunicado',
          historico: [
            orderEvent('p0', 'por_pagar'),
            orderEvent('p1', 'pagamento_comunicado', 'comprador', 1),
          ],
        },
      }),
    );
    const read = await Order.findById(created._id).orFail();
    read.set('entrega.propostas', [
      {
        id: 'proposta',
        periodo: orderPeriod(),
        estado: 'pendente',
        historico: [orderEvent('proposta', 'pendente', 'produtor')],
      },
    ]);
    await read.save();
    expect(read.estado).toBe('em_preparacao');
    expect(read.entrega.acordoAtual.origem).toBe('inicial');
    expect(read.pagamento.estado).toBe('pagamento_comunicado');
  });

  it('persiste conclusão automática registada sem executar um job', async () => {
    const document = new Order(orderInput('concluida'));
    document.set('rececao.modoConclusao', 'automatica');
    document.set('rececao.confirmacaoRececaoEm', undefined);
    document.set('rececao.decorridoMs', orderReceptionDurationMs);
    document.set(
      'rececao.concluidaEm',
      new Date(orderFixtureDate.getTime() + orderReceptionDurationMs),
    );
    document.set('rececao.historico', [
      { ...orderEvent('auto'), ator: { tipo: 'sistema', identificador: 'job-ficticio' } },
    ]);
    await document.save();
    expect((await Order.findById(document._id).orFail()).rececao.modoConclusao).toBe('automatica');
    expect(document.pagamento.estado).toBe('por_pagar');
  });

  it('persiste pagamento confirmado e preserva os acontecimentos de recebimento', async () => {
    const created = await Order.create(
      orderInput('pendente', {
        pagamento: {
          metodo: 'dinheiro',
          estado: 'pago',
          historico: [orderEvent('p0', 'por_pagar'), orderEvent('p1', 'pago', 'produtor', 1)],
        },
      }),
    );
    const read = await Order.findById(created._id).orFail();
    expect(read.pagamento.estado).toBe('pago');
    expect(read.pagamento.historico).toHaveLength(2);
    expect(read.estado).toBe('pendente');
  });

  it('persiste regularização auditada sem alterar stock de produtos', async () => {
    const created = await Order.create(orderInput('cancelada'));
    const read = await Order.findById(created._id).orFail();
    read.set('cancelamento.reposicoes.0.reposta', 400);
    read.set('cancelamento.reposicoes.0.pendente', 0);
    read.set('cancelamento.reposicoes.0.movimentos', [
      read.toObject({ transform: false }).cancelamento!.reposicoes[0]!.movimentos[0],
      {
        ...orderEvent('regularizacao', undefined, 'produtor', 4),
        quantidade: 200,
        capacidadeObservada: 200,
      },
    ]);
    await read.save();
    expect((await Order.findById(read._id).orFail()).cancelamento?.reposicoes[0]).toMatchObject({
      reposta: 400,
      pendente: 0,
    });
    expect(read.cancelamento?.reposicoes[0]?.movimentos).toHaveLength(2);
  });

  it('persiste solução aceite numa reclamação sem eliminar a outra reclamação ativa', async () => {
    const created = await Order.create(
      orderInput('pendente', { reclamacoes: [orderComplaintInput('a'), orderComplaintInput('b')] }),
    );
    const read = await Order.findById(created._id).orFail();
    read.set('reclamacoes.0.estado', 'resolvida');
    read.set('reclamacoes.0.historico', [
      ...read.reclamacoes[0]!.historico,
      orderEvent('solucao-aceite', 'resolvida', 'comprador', 1),
    ]);
    await read.save();
    const persisted = await Order.findById(read._id).orFail();
    expect(persisted.reclamacoes.map((item) => item.estado)).toEqual(['resolvida', 'aberta']);
    expect(persisted.reclamacoes[0]?.historico).toHaveLength(2);
  });

  it('recusa documento acima da capacidade de auditoria sem o inserir ou truncar', async () => {
    const document = new Order(
      orderInput('pendente', {
        reclamacoes: Array.from({ length: 130 }, (_, index) => orderComplaintInput('r-' + index)),
      }),
    );
    await expect(document.save()).rejects.toMatchObject({ name: 'ValidationError' });
    expect(await Order.exists({ _id: document._id })).toBeNull();
    expect(document.reclamacoes).toHaveLength(130);
  });

  it('bloqueia updates/replaces/bulk e gravações sem validação completa', async () => {
    const created = await Order.create(orderInput());
    await expect(Order.updateOne({ _id: created._id }, { totalCent: 1 })).rejects.toThrow('save');
    await expect(Order.replaceOne({ _id: created._id }, orderInput())).rejects.toThrow('save');
    await expect(Order.insertMany([orderInput()])).rejects.toThrow('bulk');
    await expect(
      Order.bulkWrite([{ deleteOne: { filter: { _id: created._id } } }]),
    ).rejects.toThrow('bulk');
    await expect(created.save({ validateBeforeSave: false })).rejects.toThrow('sem validação');
    await expect(created.save({ validateModifiedOnly: true })).rejects.toThrow('sem validação');
    await expect(Order.deleteOne({ _id: created._id })).rejects.toThrow('Eliminação');
  });

  it('mantém snapshots ao editar posteriormente um Product real e minimiza populate', async () => {
    const User = createUserModel(database!.connection);
    const Producer = createProducerModel(database!.connection);
    const Product = createProductModel(database!.connection);
    for (const model of [User, Producer, Product]) {
      await model.createCollection();
      await model.createIndexes();
    }
    const account = await User.create(
      userInput({ emailNormalizado: 'produtor-ficticio@example.invalid', papeis: ['produtor'] }),
    );
    await Producer.create(
      producerInput({
        userId: account._id,
        aprovacao: decisionInput({
          decisao: { autor: account._id, data: new Date('2026-10-22T09:00:00Z') },
        }),
      }),
    );
    const product = await Product.create(publishedProductInput({ produtor: account._id }));
    const created = await Order.create(
      orderInput('pendente', {
        produtor: account._id,
        linhas: [
          {
            id: 'linha-001',
            produto: product._id,
            nome: product.nome,
            quantidade: 500,
            precoReferenciaCent: product.precoCent,
            unidadeSnapshot: product.unidadeVenda,
            versaoUnidade: 0,
            subtotalCent: 75,
          },
        ],
      }),
    );
    product.precoCent = 300;
    product.nome = 'Novo nome';
    await product.save();
    const read: HydratedDocument<OrderRecord> = await Order.findById(created._id)
      .populate('linhas.produto')
      .populate('produtor')
      .orFail();
    expect(read.linhas[0]?.precoReferenciaCent).toBe(150);
    expect(read.linhas[0]?.nome).not.toBe('Novo nome');
    expect(read.totalCent).toBe(75);
    const text = JSON.stringify(read);
    for (const field of [
      'passwordHash',
      'emailNormalizado',
      'papeis',
      'Novo nome',
      'stockDisponivel',
    ])
      expect(text).not.toContain(field);
    expect(read.toJSON()).toMatchObject({ linhas: [{ produtoId: product._id.toHexString() }] });
  });
});
