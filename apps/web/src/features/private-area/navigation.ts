import type { Role } from '../auth/types';

export interface PrivateSection {
  slug: string;
  label: string;
  description: string;
  requirement: string;
}
export const privateSections: Record<Role, readonly PrivateSection[]> = {
  comprador: [
    {
      slug: 'encomendas',
      label: 'As minhas encomendas',
      description: 'Acompanhar as tuas encomendas e os respetivos estados.',
      requirement: 'RF-ENC-03',
    },
    {
      slug: 'avaliacoes',
      label: 'As minhas avaliações',
      description: 'Partilhar a experiência depois de uma entrega concluída.',
      requirement: 'RF-AVA-01',
    },
    {
      slug: 'licitacoes',
      label: 'As minhas licitações',
      description: 'Participar nos leilões e acompanhar as tuas ofertas.',
      requirement: 'RF-LEI-02/03',
    },
  ],
  produtor: [
    {
      slug: 'candidatura',
      label: 'A candidatura',
      description: 'Conhecer o percurso de aprovação pelo administrador.',
      requirement: 'RF-AUT-04; Q04',
    },
    {
      slug: 'produtos',
      label: 'Os meus produtos',
      description: 'Preparar o catálogo, preços, fotografias e stock da tua produção.',
      requirement: 'RF-PRO-01',
    },
    {
      slug: 'perfil',
      label: 'O meu perfil público',
      description: 'Apresentar a tua história e o que nasce na tua terra.',
      requirement: 'RF-PRO-02',
    },
    {
      slug: 'encomendas',
      label: 'As minhas encomendas',
      description: 'Consultar e acompanhar as encomendas da tua produção.',
      requirement: 'RF-ENC-04',
    },
    {
      slug: 'leiloes',
      label: 'Os meus leilões',
      description: 'Preparar lotes e acompanhar os teus leilões.',
      requirement: 'RF-LEI-01',
    },
    {
      slug: 'indicadores',
      label: 'Indicadores e stock',
      description: 'Consultar estatísticas próprias e alertas de stock.',
      requirement: 'RF-PRO-03/04',
    },
  ],
  administrador: [
    {
      slug: 'candidaturas',
      label: 'Candidaturas',
      description: 'Analisar candidaturas de produtores para aprovação ou rejeição.',
      requirement: 'RF-AUT-04',
    },
    {
      slug: 'utilizadores',
      label: 'Utilizadores',
      description: 'Consultar a visão global dos utilizadores do mercado.',
      requirement: 'RF-ADM-01',
    },
    {
      slug: 'encomendas',
      label: 'Encomendas',
      description: 'Consultar a visão global de encomendas, sem assumir poderes de alteração.',
      requirement: 'RF-ADM-01',
    },
    {
      slug: 'leiloes',
      label: 'Leilões',
      description: 'Acompanhar os leilões ativos do mercado.',
      requirement: 'RF-ADM-01',
    },
    {
      slug: 'moderacao',
      label: 'Moderação',
      description: 'Consultar denúncias e decisões sobre avaliações e conteúdos.',
      requirement: 'RF-AVA-02',
    },
    {
      slug: 'servicos',
      label: 'Estado dos serviços',
      description: 'Consultar observações futuras dos serviços, sem métricas simuladas.',
      requirement: 'RF-ADM-02',
    },
  ],
};
export function roleHome(role: Role) {
  return `/area/${role}`;
}
export function demoDestination(raw: string | null, role: Role) {
  const home = roleHome(role);
  const allowed = [home, ...privateSections[role].map((section) => `${home}/${section.slug}`)];
  return raw && allowed.includes(raw) ? raw : home;
}
