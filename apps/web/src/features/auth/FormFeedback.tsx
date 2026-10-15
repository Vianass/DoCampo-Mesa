import type { RefObject } from 'react';
import type { FormErrors, AuthFormKind } from './validation';

const unavailable: Record<AuthFormKind, string> = {
  login:
    'A autenticação ainda não está disponível. Não validámos credenciais nem iniciámos uma sessão. Podes explorar os papéis na demonstração abaixo.',
  registration:
    'O registo real chega numa próxima etapa. O formulário foi verificado apenas neste ecrã; nenhuma conta ou candidatura foi criada.',
  recovery:
    'A recuperação ainda não está disponível. Nenhum email foi enviado e nenhuma palavra-passe foi alterada.',
};
export function FormFeedback({
  errors,
  status,
  summaryRef,
  kind,
}: {
  errors: FormErrors;
  status: 'idle' | 'checking' | 'unavailable';
  summaryRef: RefObject<HTMLDivElement | null>;
  kind: AuthFormKind;
}) {
  return (
    <>
      {Object.keys(errors).length > 0 && (
        <div className="auth-errors" ref={summaryRef} tabIndex={-1} role="alert">
          <p>Revê os campos assinalados.</p>
          <ul>
            {Object.entries(errors).map(([name, message]) => (
              <li key={name}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="auth-form-status" role="status" aria-live="polite" aria-atomic="true">
        {status === 'checking' && <p>A verificar o formulário neste ecrã…</p>}
        {status === 'unavailable' && <p>{unavailable[kind]}</p>}
      </div>
    </>
  );
}
