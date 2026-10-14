export type Category = 'Todos' | 'Hortícolas' | 'Fruta' | 'Mel e compotas';

export interface Product {
  id: string;
  name: string;
  producer: string;
  producerId: string;
  locality: string;
  category: Exclude<Category, 'Todos'>;
  priceCents: number;
  unit: string;
  image: string;
  imageAlt: string;
  description: string;
  tag?: string;
}

export interface Producer {
  id: string;
  name: string;
  locality: string;
  specialty: string;
  description: string;
  image: string;
  imageAlt: string;
}

export interface Auction {
  id: string;
  title: string;
  producer: string;
  locality: string;
  image: string;
  imageAlt: string;
  quantity: string;
  currentPriceCents: number;
  remainingLabel: string;
}

// Conteúdo inteiramente fictício para explorar a interface, sem contrato de API.
export const products: Product[] = [
  {
    id: 'tomate-coracao',
    name: 'Tomate coração-de-boi',
    producer: 'Horta da Ribeira',
    producerId: 'horta-ribeira',
    locality: 'Ponte de Lima',
    category: 'Hortícolas',
    priceCents: 280,
    unit: 'kg',
    image: '/images/tomatoes.webp',
    imageAlt: 'Tomates vermelhos maduros com os respetivos pedúnculos',
    description:
      'Carnudo, aromático e de pele fina. Um sabor simples que pede azeite, uma pitada de sal e pão à mesa.',
    tag: 'Da época',
  },
  {
    id: 'pera-rocha',
    name: 'Pera Rocha',
    producer: 'Pomar do Vale',
    producerId: 'pomar-vale',
    locality: 'Arcos de Valdevez',
    category: 'Fruta',
    priceCents: 240,
    unit: 'kg',
    image: '/images/pears.webp',
    imageAlt: 'Peras maduras sobre uma superfície de madeira',
    description:
      'Doce e delicada, para comer ao natural ou levar ao forno. A fruta que acompanha os primeiros dias de outono.',
    tag: 'Da época',
  },
  {
    id: 'mel-multifloral',
    name: 'Mel multifloral',
    producer: 'Mel da Encosta',
    producerId: 'mel-encosta',
    locality: 'Viana do Castelo',
    category: 'Mel e compotas',
    priceCents: 750,
    unit: 'frasco de 500 g',
    image: '/images/honey.webp',
    imageAlt: 'Frasco com mel dourado e colher de madeira',
    description:
      'Um frasco de sabor suave e notas florais. Para o pequeno-almoço, uma infusão ou uma receita feita com tempo.',
  },
  {
    id: 'abobora-menina',
    name: 'Abóbora menina',
    producer: 'Horta da Ribeira',
    producerId: 'horta-ribeira',
    locality: 'Ponte de Lima',
    category: 'Hortícolas',
    priceCents: 160,
    unit: 'kg',
    image: '/images/pumpkin.webp',
    imageAlt: 'Abóbora alaranjada rodeada de folhas no campo',
    description:
      'Polpa doce, cor de outono e muitas possibilidades. A base de uma sopa reconfortante ou de um assado de domingo.',
    tag: 'Da época',
  },
];

export const producers: Producer[] = [
  {
    id: 'horta-ribeira',
    name: 'Horta da Ribeira',
    locality: 'Ponte de Lima',
    specialty: 'Hortícolas da época',
    description:
      'Uma pequena horta, muitas estações. Neste perfil fictício, os hortícolas são escolhidos pelo sabor e pelo ritmo da terra.',
    image: '/images/hero.webp',
    imageAlt: 'Imagem ilustrativa de mãos a escolher legumes num cesto de mercado',
  },
  {
    id: 'pomar-vale',
    name: 'Pomar do Vale',
    locality: 'Arcos de Valdevez',
    specialty: 'Fruta com origem',
    description:
      'Um pomar imaginado para o nosso mercado demonstrativo. Fruta que convida a conhecer o caminho entre a árvore e a mesa.',
    image: '/images/vineyard.webp',
    imageAlt: 'Paisagem agrícola ilustrativa, sem representar a exploração fictícia',
  },
  {
    id: 'mel-encosta',
    name: 'Mel da Encosta',
    locality: 'Viana do Castelo',
    specialty: 'Mel e saber artesanal',
    description:
      'Um perfil fictício dedicado ao mel e ao cuidado com a origem. Pequenos frascos, grandes momentos à mesa.',
    image: '/images/honey.webp',
    imageAlt: 'Fotografia ilustrativa de mel num frasco',
  },
];

export const auction: Auction = {
  id: 'cabaz-outono',
  title: 'Uma colheita que merece uma boa mesa.',
  producer: 'Horta da Ribeira',
  locality: 'Ponte de Lima',
  image: '/images/harvest.webp',
  imageAlt: 'Caixa de madeira com uma colheita variada de legumes',
  quantity: 'Lote de 20 cabazes de hortícolas',
  currentPriceCents: 6500,
  remainingLabel: '02h 14m',
};

export const categories: Category[] = ['Todos', 'Hortícolas', 'Fruta', 'Mel e compotas'];

export function formatPrice(amountCents: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(
    amountCents / 100,
  );
}
