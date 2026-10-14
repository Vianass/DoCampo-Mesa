import { Link } from 'react-router';
import { Brand } from '../components/Brand';
import { Container } from '../components/Container';
import { Icon } from '../components/Icon';

export function Footer() {
  return (
    <footer className="site-footer">
      <Container>
        <div className="footer-main">
          <div className="footer-brand">
            <Brand light />
            <p>
              Boas coisas crescem perto.
              <br />E merecem chegar à tua mesa.
            </p>
          </div>
          <div>
            <h2>O mercado</h2>
            <Link to="/produtos">Produtos da época</Link>
            <Link to="/produtores">Os nossos produtores</Link>
            <Link to="/leiloes">Leilões</Link>
          </div>
          <div>
            <h2>Vem conhecer</h2>
            <Link to="/como-funciona">Como funciona</Link>
            <Link to="/registo?perfil=produtor">Sou produtor</Link>
            <Link to="/sistema-visual">Sistema visual</Link>
          </div>
          <div className="footer-origin">
            <Icon name="leaf" width="32" height="32" />
            <p>
              Feito com a terra
              <br />e com quem a cuida.
            </p>
            <span>Um projeto académico do IPVC</span>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Do Campo à Mesa</span>
          <span>Produtos, produtores e leilões fictícios. Fotografias ilustrativas.</span>
          <a href="/images/credits.md">
            Créditos das fotografias
            <Icon name="diagonal" width="14" height="14" />
          </a>
        </div>
      </Container>
    </footer>
  );
}
