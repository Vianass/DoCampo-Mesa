import { products, producers } from './market';
import { buyerOrders, buyerReviews, buyerBids, BUYER_OBSERVED_AT, DEMO_BUYER_ID } from './buyer';
import { producerDemoDataset } from './producer';
import type {
  AdminDataset,
  AdminDecision,
  AdminReviewCase,
  AdminService,
  AdminUser,
} from '../features/admin/types';

export const DEMO_ADMIN_ID = 'administrador-demonstracao';
const decision: AdminDecision = {
  actorId: DEMO_ADMIN_ID,
  decidedAt: '2026-10-14T08:00:00.000Z',
  reason: 'Exemplo de decisão anterior, sem efeito administrativo real.',
};
const users: AdminUser[] = [
  {
    id: DEMO_BUYER_ID,
    displayName: 'Comprador de demonstração',
    role: 'comprador',
    joinedAt: '2026-10-01T09:00:00Z',
  },
  {
    id: 'outro-participante-ficticio',
    displayName: 'Outro comprador fictício',
    role: 'comprador',
    joinedAt: '2026-10-02T09:00:00Z',
  },
  {
    id: DEMO_ADMIN_ID,
    displayName: 'Administrador de demonstração',
    role: 'administrador',
    joinedAt: '2026-10-01T08:00:00Z',
  },
  ...producers.map((profile) => ({
    id: 'produtor-' + profile.id,
    displayName: profile.name,
    role: 'produtor' as const,
    joinedAt: '2026-10-01T09:00:00Z',
  })),
];
const thirdReview: AdminReviewCase['review'] = {
  id: 'avaliacao-forno-administracao',
  buyerId: DEMO_BUYER_ID,
  orderId: 'enc-261006',
  target: 'produtor',
  producerId: 'forno-aldeia',
  displayName: 'Comprador de demonstração',
  rating: 3,
  text: 'Comentário fictício para explorar uma decisão de moderação já concluída.',
  createdAt: '2026-10-07T12:00:00Z',
  demonstration: true,
};
const serviceDefinitions = [
  [
    'api',
    'API',
    'Pedidos HTTP e regras de negócio no servidor.',
    'indisponivel',
    'Exemplo: pedido indisponível. Nenhum pedido foi efetuado.',
  ],
  [
    'socket',
    'Socket.io',
    'Comunicação futura dos leilões.',
    'desconhecido',
    'Exemplo sem observação. Não existe ligação em tempo real.',
  ],
  [
    'mongo',
    'MongoDB Atlas',
    'Persistência futura dos dados.',
    'desconhecido',
    'Exemplo sem observação da base de dados.',
  ],
  [
    'blob',
    'Blob Storage',
    'Armazenamento futuro de imagens.',
    'degradado',
    'Exemplo hipotético de degradação, sem medição ou acesso ao armazenamento.',
  ],
  [
    'swagger',
    'Swagger UI',
    'Documentação futura da API.',
    'indisponivel',
    'Exemplo sem documentação servida. Não foi consultado qualquer endpoint.',
  ],
] as const;
const services: AdminService[] = serviceDefinitions.map(([id, name, purpose, status, note]) => ({
  id,
  name,
  purpose,
  realStatus: 'nao-monitorizado',
  realObservedAt: null,
  illustration: { status, note, observedAt: status === 'desconhecido' ? null : BUYER_OBSERVED_AT },
}));
const productReferences: Record<string, string> = {
  'lote-peras': 'pera-rocha',
  'lote-mel': 'mel-multifloral',
  'lote-broas': 'pao-milho',
};
export const adminDemoDataset: AdminDataset = {
  observedAt: BUYER_OBSERVED_AT,
  users,
  producers: producers.map((profile) => {
    const status =
      profile.id === 'horta-ribeira' || profile.id === 'pomar-sul'
        ? 'pendente'
        : profile.id === 'olival-monte'
          ? 'rejeitado'
          : 'aprovado';
    return {
      id: profile.id,
      userId: 'produtor-' + profile.id,
      profile: { ...profile },
      application: {
        status,
        submittedAt: status === 'pendente' ? '2026-10-14T09:00:00Z' : '2026-10-02T09:00:00Z',
        decision: status === 'pendente' ? null : { ...decision },
      },
    };
  }),
  products: products.map((product) => ({ ...product })),
  orders: [
    ...new Map(
      [
        ...buyerOrders.map((order) => ({ ...order, producerId: order.items[0]!.producerId })),
        ...producerDemoDataset.orders,
      ].map((order) => [order.id, order]),
    ).values(),
  ],
  cases: [...buyerReviews, thirdReview].map((review, index) => ({
    id: 'denuncia-' + (index + 1),
    review: { ...review },
    status: index === 2 ? 'mantida' : 'pendente',
    decision: index === 2 ? { ...decision } : null,
    reports: Array.from({ length: index === 0 ? 2 : 1 }, (_, report) => ({
      id: 'sinalizacao-' + index + '-' + report,
      reason:
        report === 0
          ? 'Pedido fictício de verificação do conteúdo.'
          : 'Segunda sinalização ilustrativa da mesma avaliação.',
      reportedAt: '2026-10-13T12:00:00Z',
      reporterLabel: 'Participante fictício ' + (report + 1),
    })),
  })),
  auctions: [
    ...new Map(
      [
        ...buyerBids.map(({ auction }) => ({ ...auction, bidCount: auction.currentBid.sequence })),
        ...producerDemoDataset.auctions,
      ].map((auction) => [auction.id, auction]),
    ).values(),
  ].map((auction) => ({ ...auction, productId: productReferences[auction.id] ?? null })),
  services,
};
