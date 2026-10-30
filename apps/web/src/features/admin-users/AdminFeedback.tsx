import { useEffect, useRef } from 'react';
import { Button } from '../../components/Button';
import { useAuth } from '../auth/useAuth';
export function AdminFeedback({
  message,
  retry,
  forbidden = false,
}: {
  message: string;
  retry: () => void;
  forbidden?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    { revalidate } = useAuth();
  useEffect(() => {
    ref.current?.focus();
  }, [message]);
  return (
    <div
      className="admin-application-feedback"
      role="group"
      aria-label="Recuperar consulta administrativa"
      tabIndex={-1}
      ref={ref}
    >
      <p role="alert">{message}</p>
      <Button variant="secondary" onClick={retry}>
        Tentar novamente
      </Button>
      {forbidden && (
        <Button variant="secondary" onClick={() => void revalidate()}>
          Confirmar acesso administrativo
        </Button>
      )}
    </div>
  );
}
