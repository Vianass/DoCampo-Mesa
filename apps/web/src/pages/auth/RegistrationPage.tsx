import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { FormFeedback } from '../../features/auth/FormFeedback';
import { PasswordField } from '../../features/auth/PasswordField';
import { usePrototypeForm } from '../../features/auth/usePrototypeForm';
import type { RegistrationRole } from '../../features/auth/types';
import { AuthPageFrame } from './AuthPageFrame';

function RegistrationForm({ role }: { role: RegistrationRole }) {
  const form = usePrototypeForm('registration', role);
  return (
    <form
      noValidate
      onSubmit={form.onSubmit}
      aria-label="Formulário de registo"
      aria-busy={form.status === 'checking'}
    >
      <FormFeedback {...form} kind="registration" />
      <FormField label="Nome" name="name" autoComplete="name" required error={form.errors.name} />
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={form.errors.email}
      />
      {role === 'produtor' && (
        <fieldset className="auth-producer-fields">
          <legend>A tua produção</legend>
          <FormField
            label="Nome público do produtor"
            name="producerName"
            autoComplete="organization"
            required
            error={form.errors.producerName}
          />
          <FormField
            label="Localidade do produtor"
            name="locality"
            autoComplete="address-level2"
            required
            error={form.errors.locality}
          />
          <p>
            Os novos produtores precisam de uma decisão administrativa. Esta prévia não envia uma
            candidatura nem permite publicar produtos.
          </p>
        </fieldset>
      )}
      <PasswordField
        registration
        error={form.errors.password}
        hint="Pelo menos 8 caracteres, regra provisória desta demonstração."
      />
      <PasswordField
        registration
        name="confirmPassword"
        label="Confirmação da palavra-passe"
        error={form.errors.confirmPassword}
      />
      <Button type="submit" disabled={form.status === 'checking'}>
        {form.status === 'checking'
          ? 'A verificar…'
          : role === 'produtor'
            ? 'Verificar candidatura demonstrativa'
            : 'Verificar registo demonstrativo'}
      </Button>
    </form>
  );
}
export default function RegistrationPage() {
  const [params, setParams] = useSearchParams();
  const requestedRole: RegistrationRole =
    params.get('perfil') === 'produtor' ? 'produtor' : 'comprador';
  const [selection, setSelection] = useState({ source: requestedRole, role: requestedRole });
  // Radio feedback is immediate; URL transitions and browser history remain authoritative.
  if (selection.source !== requestedRole)
    setSelection({ source: requestedRole, role: requestedRole });
  const role = selection.role;
  return (
    <AuthPageFrame
      title="Há uma mesa"
      accent="à tua espera."
      description={
        role === 'produtor'
          ? 'A tua colheita pode fazer parte desta história. Conhece o percurso de entrada no mercado.'
          : 'Conhece quem produz, descobre o que é da época e escolhe a tua próxima história à mesa.'
      }
    >
      <section aria-labelledby="registration-title">
        <p className="eyebrow">Começar pela proximidade</p>
        <h2 id="registration-title">Fazer parte do mercado.</h2>
        <p className="auth-prototype-note">
          Prévia do registo. Usa apenas dados fictícios; não são enviados nem guardados e nenhuma
          conta será criada.
        </p>
        <fieldset className="auth-role-choice">
          <legend>Como queres participar?</legend>
          {(['comprador', 'produtor'] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="registration-role"
                value={value}
                checked={role === value}
                onChange={() => {
                  setSelection({ source: requestedRole, role: value });
                  setParams(value === 'produtor' ? { perfil: value } : {});
                }}
              />
              <span>{value === 'comprador' ? 'Quero comprar' : 'Sou produtor'}</span>
            </label>
          ))}
        </fieldset>
        <RegistrationForm key={role} role={role} />
        <p className="auth-alternative">
          Já conheces o mercado? <Link to="/entrar">Voltar à entrada</Link>
        </p>
      </section>
    </AuthPageFrame>
  );
}
