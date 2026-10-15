import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { FormFeedback } from '../../features/auth/FormFeedback';
import { usePrototypeForm } from '../../features/auth/usePrototypeForm';
import { AuthPageFrame } from './AuthPageFrame';

export default function RecoveryPage() {
  const form = usePrototypeForm('recovery');
  return (
    <AuthPageFrame
      title="Retomar o caminho,"
      accent="com calma."
      description="O teu lugar continua por aqui. Estamos a preparar os próximos passos para voltares ao mercado."
    >
      <section aria-labelledby="recovery-title">
        <p className="eyebrow">Voltar a encontrar a entrada</p>
        <h2 id="recovery-title">Recuperar a palavra-passe.</h2>
        <p className="auth-prototype-note">
          Interface demonstrativa. A recuperação real ainda não está disponível; não enviamos emails
          nem consultamos contas. Usa apenas um email fictício.
        </p>
        <form
          noValidate
          onSubmit={form.onSubmit}
          aria-label="Formulário de recuperação"
          aria-busy={form.status === 'checking'}
        >
          <FormFeedback {...form} kind="recovery" />
          <FormField
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            error={form.errors.email}
          />
          <Button type="submit" disabled={form.status === 'checking'}>
            {form.status === 'checking' ? 'A verificar…' : 'Verificar formulário'}
          </Button>
        </form>
        <p className="auth-alternative">
          <Link to="/entrar">← Voltar à entrada</Link>
        </p>
      </section>
    </AuthPageFrame>
  );
}
