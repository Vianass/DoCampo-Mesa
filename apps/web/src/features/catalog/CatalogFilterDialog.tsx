import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';

export function CatalogFilterDialog({
  children,
  total,
  onDismiss,
  onApply,
}: {
  children: ReactNode;
  total: number;
  onDismiss: () => void;
  onApply: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  function dismiss() {
    dialogRef.current?.close();
    onDismiss();
  }
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const onResize = (event: MediaQueryListEvent) => {
      if (event.matches) {
        dialogRef.current?.close();
        onDismiss();
      }
    };
    media.addEventListener('change', onResize);
    return () => media.removeEventListener('change', onResize);
  }, [onDismiss]);
  return (
    <dialog
      ref={dialogRef}
      className="catalog-filter-dialog"
      aria-label="Filtros do catálogo"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div className="catalog-filter-dialog__sheet">
        <div className="catalog-filter-dialog__top">
          <p className="eyebrow">Escolhe à tua maneira</p>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar filtros"
            onClick={dismiss}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="catalog-filter-dialog__body">{children}</div>
        <div className="catalog-filter-dialog__footer">
          <Button
            onClick={() => {
              dialogRef.current?.close();
              onApply();
            }}
          >
            Ver {total} {total === 1 ? 'produto' : 'produtos'}
            <Icon name="arrow" />
          </Button>
        </div>
      </div>
    </dialog>
  );
}
