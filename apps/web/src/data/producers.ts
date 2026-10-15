import type { Producer } from '../types/market';

// Todos os produtores e produtos são fictícios. As fotografias são ilustrativas.
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
    region: 'Alto Minho',
    coverImage: {
      src: '/images/harvest.webp',
      alt: 'Colheita variada de legumes, fotografia ilustrativa',
    },
    story: {
      title: 'Uma horta, muitas formas de cuidar.',
      paragraphs: [
        'Imaginámos a Horta da Ribeira a partir de um gesto simples: voltar à terra todos os dias, observar o que cresce e escolher o momento de colher. Nesta história fictícia, os dias começam cedo e a mesa é o lugar onde tudo se encontra.',
        'Entre folhas, raízes e tomates, o calendário acompanha as estações. O saber passa de mão em mão, e cada pequena colheita dá uma nova ideia para cozinhar com o que está perto.',
      ],
    },
    methods: [
      {
        title: 'Ao ritmo das estações',
        description:
          'Na história deste perfil, a escolha das culturas acompanha a época de cada hortícola.',
      },
      {
        title: 'Cuidado com o solo',
        description:
          'Rotação de culturas e compostagem são exemplos de práticas imaginadas para esta horta.',
      },
      {
        title: 'Pequenas colheitas',
        description: 'A seleção manual inspira os lotes de demonstração apresentados no mercado.',
      },
    ],
    organicCertification: {
      kind: 'demonstration',
      label: 'Produção biológica · exemplo',
      note: 'Indicador fictício para demonstrar a interface. Não existe certificação verificada, entidade certificadora ou número de certificado.',
    },
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
    region: 'Alto Minho',
    coverImage: {
      src: '/images/vineyard.webp',
      alt: 'Paisagem agrícola ilustrativa, sem representar este pomar',
    },
    story: {
      title: 'O tempo da fruta sabe esperar.',
      paragraphs: [
        'O Pomar do Vale nasceu como uma história imaginada sobre a paciência. Entre a flor e o fruto, há um tempo que não se apressa; a nossa proposta de perfil dá espaço a esse caminho.',
        'Maçãs, peras e kiwis inspiram uma mesa simples, com fruta para comer ao natural e receitas que prolongam o sabor da colheita. A paisagem fotografada é apenas ilustrativa.',
      ],
    },
    methods: [
      {
        title: 'Colher no momento certo',
        description: 'A maturação orienta a seleção de fruta nesta exploração fictícia.',
      },
      {
        title: 'Diversidade no pomar',
        description:
          'A variedade de fruta inspira o catálogo, sem afirmar variedades certificadas ou práticas verificadas.',
      },
    ],
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
    region: 'Alto Minho',
    coverImage: {
      src: '/images/vineyard.webp',
      alt: 'Paisagem rural ilustrativa, sem representar um apiário',
    },
    story: {
      title: 'Pequenos frascos, grandes memórias.',
      paragraphs: [
        'Neste perfil inteiramente fictício, o mel liga a paisagem às memórias da mesa. Imaginamos o cuidado de observar as florações e de guardar os sabores com tempo.',
        'Um fio de mel sobre o pão, uma compota junto ao queijo: gestos pequenos que dão vida à história. Os frascos e lotes apresentados são exemplos, sem origem comercial verificada.',
      ],
    },
    methods: [
      {
        title: 'Conhecer as florações',
        description: 'A atenção às estações inspira esta narrativa demonstrativa de apicultura.',
      },
      {
        title: 'Preparação em pequenos lotes',
        description:
          'Frascos e compotas ilustram uma proposta artesanal, sem produção real associada.',
      },
    ],
  },
  {
    id: 'quinta-serra',
    name: 'Quinta da Serra',
    locality: 'Seia',
    specialty: 'Queijos e frutos secos',
    description:
      'Uma quinta fictícia onde imaginamos queijo artesanal e frutos secos para uma mesa de partilha. Sem denominações de origem ou certificações reais.',
    image: '/images/catalog/cheese.webp',
    imageAlt: 'Fotografia ilustrativa de pequenos queijos de cabra',
    region: 'Serra da Estrela',
    coverImage: {
      src: '/images/catalog/cheese.webp',
      alt: 'Pequenos queijos de cabra, sem representar produção da Serra da Estrela',
    },
    story: {
      title: 'Saberes que se partilham à mesa.',
      paragraphs: [
        'A Quinta da Serra é uma personagem deste mercado. A sua história imaginada junta a dedicação aos queijos e o gosto pelos frutos secos, com a mesa como ponto de encontro.',
        'A tradição inspira a narrativa, mas não atribuímos denominações protegidas nem certificações reais. A fotografia de queijo de cabra é ilustrativa e não representa queijo da Serra.',
      ],
    },
    methods: [
      {
        title: 'Saber artesanal',
        description: 'O trabalho em pequenos lotes é uma proposta narrativa deste perfil fictício.',
      },
      {
        title: 'Seleção para partilhar',
        description: 'Queijos e frutos secos inspiram combinações para uma mesa de amigos.',
      },
    ],
  },
  {
    id: 'olival-monte',
    name: 'Olival do Monte',
    locality: 'Moura',
    specialty: 'Azeite e azeitonas',
    description:
      'Um olival fictício, criado para mostrar os sabores que queremos aproximar. A fotografia é apenas ilustrativa.',
    image: '/images/catalog/olive-oil.webp',
    imageAlt: 'Fotografia ilustrativa de azeite',
    region: 'Baixo Alentejo',
    coverImage: {
      src: '/images/catalog/olive-oil.webp',
      alt: 'Garrafa de azeite, imagem representativa de um produto',
    },
    story: {
      title: 'Há gestos que sabem a azeite.',
      paragraphs: [
        'Imaginámos o Olival do Monte como um lugar onde a colheita merece tempo e o azeite encontra o seu lugar nas refeições de todos os dias.',
        'Esta história fictícia aproxima o pão, as azeitonas e a cozinha portuguesa. Não atribui características analíticas, variedades de azeitona ou origem protegida aos produtos demonstrativos.',
      ],
    },
    methods: [
      {
        title: 'O tempo da colheita',
        description: 'A atenção ao fruto e às estações inspira a história deste olival fictício.',
      },
      {
        title: 'Da despensa à mesa',
        description:
          'Embalagens pequenas ajudam a apresentar a proposta do mercado, sem processo industrial verificado.',
      },
    ],
    organicCertification: {
      kind: 'demonstration',
      label: 'Produção biológica · exemplo',
      note: 'Indicação de demonstração, sem certificação real ou verificação independente.',
    },
  },
  {
    id: 'forno-aldeia',
    name: 'Forno da Aldeia',
    locality: 'Barcelos',
    specialty: 'Pão e cereais',
    description:
      'Um forno imaginado para este mercado. Pães e cereais que evocam o tempo de fazer as coisas com cuidado.',
    image: '/images/catalog/bread.webp',
    imageAlt: 'Fotografia ilustrativa de pão artesanal',
    region: 'Cávado',
    coverImage: {
      src: '/images/catalog/bread.webp',
      alt: 'Pão de côdea dourada, fotografia representativa e ilustrativa',
    },
    story: {
      title: 'O pão reúne a casa.',
      paragraphs: [
        'O Forno da Aldeia é um forno imaginado. A história começa com farinha, água e o tempo de esperar, e termina com uma mesa onde há sempre lugar para mais alguém.',
        'Broa e pão de centeio dão forma a esta proposta de perfil. A fotografia não representa um estabelecimento real e os produtos não têm encomendas ou entregas disponíveis.',
      ],
    },
    methods: [
      {
        title: 'Dar tempo à massa',
        description: 'A fermentação e a preparação artesanal são temas desta narrativa fictícia.',
      },
      {
        title: 'Cereais na cozinha',
        description: 'Milho e centeio inspiram os produtos de demonstração deste forno.',
      },
    ],
  },
  {
    id: 'pomar-sul',
    name: 'Pomar do Sul',
    locality: 'Faro',
    specialty: 'Citrinos e fruta',
    description:
      'Um pomar fictício inspirado nos sabores do sul. Os dados e a fotografia não representam uma exploração real.',
    image: '/images/catalog/oranges.webp',
    imageAlt: 'Fotografia ilustrativa de laranjas',
    region: 'Algarve',
    coverImage: {
      src: '/images/catalog/oranges.webp',
      alt: 'Laranjas inteiras, fotografia ilustrativa sem origem verificada',
    },
    story: {
      title: 'Uma mesa com o sabor do sul.',
      paragraphs: [
        'O Pomar do Sul é uma história fictícia inspirada na fruta que perfuma a cozinha. Imaginamos a colheita como um convite a descobrir sabores, sem retratar uma exploração concreta.',
        'Laranjas, limões e fruta de estação dão cor ao catálogo. As localidades situam a narrativa, mas as fotografias não comprovam a origem ou a variedade dos frutos.',
      ],
    },
    methods: [
      {
        title: 'Seguir as estações',
        description: 'A escolha de fruta acompanha um calendário de demonstração.',
      },
      {
        title: 'Escolher com cuidado',
        description:
          'A seleção manual inspira a história, sem verificação de métodos de uma exploração real.',
      },
    ],
  },
];
