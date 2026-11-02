import { Link, useLocation } from 'react-router';
import { moderationBase } from './contracts';
export function ModerationNav() {
  const { pathname } = useLocation(),
    tab = pathname.split('/')[4];
  return (
    <nav className="moderation-nav" aria-label="Secções de moderação">
      {(
        [
          ['', 'Avaliações'],
          ['/denuncias', 'Denúncias'],
          ['/produtos', 'Produtos'],
          ['/perfis', 'Perfis'],
        ] as const
      ).map(([path, label]) => {
        const selected = path
          ? pathname.startsWith(moderationBase + path)
          : !['denuncias', 'produtos', 'perfis'].includes(tab ?? '');
        return (
          <Link key={path} to={moderationBase + path} aria-current={selected ? 'page' : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
