import type { ProducerReview } from '../types/market';

// Nomes, comentários e classificações inteiramente fictícios; sem compras verificadas.
export const producerReviews: readonly ProducerReview[] = [
  {
    id: 'review-horta-1',
    producerId: 'horta-ribeira',
    displayName: 'Marta R. · personagem fictícia',
    rating: 5,
    text: 'Nesta história de demonstração, gostei de descobrir hortícolas da época e ideias para uma sopa de outono.',
    createdAt: '2026-10-10T10:00:00Z',
    demonstration: true,
  },
  {
    id: 'review-horta-2',
    producerId: 'horta-ribeira',
    displayName: 'João M. · personagem fictícia',
    rating: 4,
    text: 'Um comentário imaginado para mostrar como a origem e as estações podem ajudar a escolher os produtos.',
    createdAt: '2026-10-08T09:00:00Z',
    demonstration: true,
  },
  {
    id: 'review-pomar-1',
    producerId: 'pomar-vale',
    displayName: 'Sofia L. · personagem fictícia',
    rating: 5,
    text: 'A história deste pomar fictício deu-me vontade de preparar maçãs assadas para a mesa.',
    createdAt: '2026-10-09T16:00:00Z',
    demonstration: true,
  },
  {
    id: 'review-pomar-2',
    producerId: 'pomar-vale',
    displayName: 'Tiago A. · personagem fictícia',
    rating: 4,
    text: 'Uma avaliação demonstrativa sobre a apresentação da fruta. Não corresponde a uma compra real.',
    createdAt: '2026-10-05T10:00:00Z',
    demonstration: true,
  },
  {
    id: 'review-mel-1',
    producerId: 'mel-encosta',
    displayName: 'Leonor C. · personagem fictícia',
    rating: 5,
    text: 'O mel e as compotas inspiram uma mesa de pequeno-almoço. Este comentário faz parte da demonstração.',
    createdAt: '2026-10-11T08:00:00Z',
    demonstration: true,
  },
  {
    id: 'review-forno-1',
    producerId: 'forno-aldeia',
    displayName: 'Rui P. · personagem fictícia',
    rating: 4,
    text: 'Uma história imaginada com pão, calma e vontade de partilhar. Sem encomenda real associada.',
    createdAt: '2026-10-06T15:00:00Z',
    demonstration: true,
  },
];
