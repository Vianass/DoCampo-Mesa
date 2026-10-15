import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { DemoAccess } from '../../features/auth/DemoAccess';
import { FormFeedback } from '../../features/auth/FormFeedback';
import { PasswordField } from '../../features/auth/PasswordField';
import { usePrototypeForm } from '../../features/auth/usePrototypeForm';
import { AuthPageFrame } from './AuthPageFrame';

export default function LoginPage() {
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
          Interface em preparação. A autenticação ainda não está disponível. Usa apenas dados
          fictícios; este formulário não os envia nem guarda.
        </p>
        {params.has('destino') && (
          <p className="auth-session-note" role="status">
            Precisas de escolher um papel de demonstração para conhecer essa área. Recarregar a
            página termina a demonstração anterior.
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
            {form.status === 'checking' ? 'A verificar…' : 'Verificar acesso'}
          </Button>
        </form>
        <p className="auth-alternative">
          Ainda não tens conta? <Link to="/registo">Conhecer o registo</Link>
        </p>
      </section>
      <DemoAccess />
    </AuthPageFrame>
  );
}
