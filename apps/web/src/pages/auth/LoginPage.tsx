import { demonstrationSite } from '../../features/auth/demo-mode';
import { useAuth } from '../../features/auth/useAuth';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { DemoAccess } from '../../features/auth/DemoAccess';
import { FormFeedback } from '../../features/auth/FormFeedback';
import { PasswordField } from '../../features/auth/PasswordField';
import { usePrototypeForm } from '../../features/auth/usePrototypeForm';
import { AuthPageFrame } from './AuthPageFrame';

export default function LoginPage() {
  const { session, notice, logout } = useAuth();
  const form = usePrototypeForm('login');
  const [params] = useSearchParams();
  return (
    <AuthPageFrame
      title="É bom voltar"
      accent="às origens."
      description="Um lugar para quem escolhe com cuidado e valoriza o que cresce perto."
    >
      <section aria-labelledby="login-title">
        <p className="eyebrow">O teu lugar à mesa</p>
        <h2 id="login-title">Entrar no mercado.</h2>
        <p className="auth-prototype-note">
          {demonstrationSite
            ? 'Interface de demonstração, sem autenticação real. Usa apenas dados fictícios; este formulário não os envia nem guarda.'
            : 'Entra com a tua conta. A sessão é mantida apenas neste separador e termina ao atualizar a página. Não partilhes as tuas credenciais.'}
        </p>
        {!demonstrationSite && notice && (
          <p className="auth-session-note" role="status">
            {notice}
          </p>
        )}
        {!demonstrationSite && session.kind === 'authenticated' && (
          <p className="auth-session-note">
            Sessão de {session.user.nome}. <Link to="/area">Ir para a minha área</Link> ·{' '}
            <button type="button" className="catalog-clear" onClick={() => void logout()}>
              Terminar sessão
            </button>
          </p>
        )}
        {params.has('destino') && (demonstrationSite || !notice) && (
          <p className="auth-session-note" role="status">
            {demonstrationSite
              ? 'Precisas de escolher um papel de demonstração para conhecer essa área. Recarregar a página termina a demonstração anterior.'
              : 'Precisas de iniciar sessão para aceder a essa área. Se atualizaste a página, entra novamente.'}
          </p>
        )}
        <form
          noValidate
          onSubmit={form.onSubmit}
          aria-label="Formulário de entrada"
          aria-busy={form.status === 'checking'}
        >
          <FormFeedback {...form} kind="login" />
          <FormField
            label="Email"
            name="email"
            type="email"
            autoComplete="username"
            required
            error={form.errors.email}
          />
          <PasswordField error={form.errors.password} />
          <Link className="auth-recovery-link" to="/recuperar-palavra-passe">
            Esqueceste-te da palavra-passe?
          </Link>
          <Button type="submit" disabled={form.status === 'checking'}>
            {form.status === 'checking'
              ? 'A verificar…'
              : demonstrationSite
                ? 'Verificar acesso'
                : 'Entrar'}
          </Button>
        </form>
        <p className="auth-alternative">
          Ainda não tens conta? <Link to="/registo">Conhecer o registo</Link>
        </p>
      </section>
      {demonstrationSite ? (
        <>
          <DemoAccess />
          <a className="auth-back" href="/entrar">
            Voltar à entrada real
          </a>
        </>
      ) : (
        <p className="auth-alternative">
          <a href="/demonstracao/entrar" target="_blank" rel="noopener noreferrer">
            Explorar a interface demonstrativa (novo separador, sem iniciar sessão)
          </a>
        </p>
      )}
    </AuthPageFrame>
  );
}
