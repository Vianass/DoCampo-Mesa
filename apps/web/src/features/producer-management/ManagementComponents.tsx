import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../auth/useAuth';
import type { Photo } from './contracts';
export function ManagementFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="producer-management">
      <header className="producer-intro">
        <p className="eyebrow">A tua produção · Gestão real</p>
        <h1>{title}</h1>
        <p>Dados guardados na tua conta. Cada alteração é confirmada pelo serviço.</p>
      </header>
      {children}
    </section>
  );
}
export function ManagementState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error?: string;
  retry: () => void;
}) {
  return loading ? (
    <LoadingSkeleton label="A consultar a tua produção" count={2} />
  ) : error ? (
    <div role="alert">
      <p>{error}</p>
      <Button onClick={retry}>Tentar novamente</Button>
    </div>
  ) : null;
}
export function MutationFeedback({ error, retry }: { error: string; retry: () => void }) {
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  return error ? (
    <div ref={feedback} tabIndex={-1} className="management-feedback" role="alert">
      <p>{error}</p>
      <Button variant="secondary" onClick={retry}>
        Consultar estado atual
      </Button>
    </div>
  ) : null;
}
export function ManagedPhoto({ photo }: { photo: Photo }) {
  const { request } = useAuth(),
    [loaded, setLoaded] = useState<{ source: string; url: string }>();
  const managed = new URL(photo.url).pathname.startsWith('/api/media/');
  useEffect(() => {
    if (!managed) return;
    const c = new AbortController();
    let objectUrl: string | undefined;
    void request(
      new URL(photo.url).pathname.replace(/^\/api/, ''),
      (v) => {
        if (!(v instanceof Blob)) throw Error();
        return v;
      },
      { responseType: 'blob' },
      c.signal,
    )
      .then((blob) => {
        if (!c.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ source: photo.url, url: objectUrl });
        }
      })
      .catch(() => undefined);
    return () => {
      c.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.url, managed, request]);
  const src = managed ? (loaded?.source === photo.url ? loaded.url : undefined) : photo.url;
  return src ? (
    <img src={src} alt={photo.alt ?? 'Fotografia do produto'} width={320} height={240} />
  ) : (
    <p role="status">Fotografia indisponível ou a carregar.</p>
  );
}
