import type { ReactNode } from 'react';
import { Container } from '../../components/Container';
import { MarketImage } from '../../components/MarketImage';
import { Link } from 'react-router';

export function AuthPageFrame({
  title,
  accent,
  description,
  children,
}: {
  title: string;
  accent: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Container>
      <div className="auth-layout">
        <div className="auth-story">
          <p className="eyebrow">
            <span className="eyebrow-line" />
            Um mercado com raízes
          </p>
          <h1>
            {title}
            <br />
            <em>{accent}</em>
          </h1>
          <p className="auth-story__description">{description}</p>
          <figure>
            <MarketImage
              src="/images/harvest.webp"
              alt="Legumes numa caixa de madeira, fotografia ilustrativa do mercado"
              width="1200"
              height="800"
            />
            <figcaption>Mais perto da origem. Mais perto de quem importa.</figcaption>
          </figure>
          <Link to="/produtos" className="auth-back">
            ← Continuar pelo mercado
          </Link>
        </div>
        <div className="auth-content">{children}</div>
      </div>
    </Container>
  );
}
