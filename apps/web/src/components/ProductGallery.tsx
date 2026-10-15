import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { ProductImage } from '../types/market';
import { MarketImage } from './MarketImage';

export function ProductGallery({
  images,
  productName,
}: {
  images: readonly [ProductImage, ...ProductImage[]];
  productName: string;
}) {
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const active = images[selected] ?? images[0];
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % images.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index + images.length - 1) % images.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = images.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setSelected(next);
    buttons.current[next]?.focus();
  }
  return (
    <section className="product-gallery" aria-label={`Fotografias de ${productName}`}>
      <figure>
        <div className="product-gallery__main" id={`${id}-main`}>
          <MarketImage
            src={active.src}
            alt={active.alt}
            width="1000"
            height="1000"
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <figcaption>
          <span role="status" aria-label="Fotografia selecionada">
            Fotografia {selected + 1} de {images.length}
          </span>
          <span>
            Imagem ilustrativa. A origem e a variedade não são verificadas pela fotografia.
          </span>
        </figcaption>
      </figure>
      {images.length > 1 && (
        <div className="product-gallery__thumbnails" role="group" aria-label="Escolher fotografia">
          {images.map((image, index) => (
            <button
              key={image.src}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              aria-label={`Ver fotografia ${index + 1} de ${productName}`}
              aria-pressed={selected === index}
              aria-controls={`${id}-main`}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => navigate(event, index)}
            >
              <MarketImage src={image.src} alt="" width="120" height="120" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
