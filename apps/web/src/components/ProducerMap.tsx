import { useId } from 'react';
import { Icon } from './Icon';

export function ProducerMap({ locality, region }: { locality?: string; region?: string }) {
  const id = useId();
  const query = locality
    ? new URLSearchParams({ query: `${locality}, Portugal` }).toString()
    : null;
  return (
    <figure className="producer-map">
      <div className="producer-map__illustration">
        <svg viewBox="0 0 600 280" role="img" aria-labelledby={`${id}-title`}>
          <title id={`${id}-title`}>
            {locality
              ? `Representação ilustrativa da localidade ${locality}, sem coordenadas da exploração`
              : 'Localização por disponibilizar, sem coordenadas'}
          </title>
          <rect width="600" height="280" fill="#e4e9dc" />
          <g fill="none" stroke="#c5d0b7" strokeWidth="1.5">
            <path d="M-20 190C110 70 180 260 360 70S570 20 650 80M-20 215C110 95 180 285 360 95S570 45 650 105M-20 240C110 120 180 310 360 120S570 70 650 130M-20 165C110 45 180 235 360 45S570 -5 650 55" />
          </g>
          <path
            d="M-20 20C130 155 185 25 310 170S430 210 620 275"
            fill="none"
            stroke="#cbd9d8"
            strokeWidth="18"
          />
          <path
            d="M-20 100C190 250 295 10 620 155"
            fill="none"
            stroke="#f7f3ea"
            strokeWidth="9"
            strokeDasharray="12 5"
          />
        </svg>
        <div className="producer-map__label">
          <Icon name="location" />
          <strong>{locality ?? 'Localização por disponibilizar'}</strong>
          {region && <span>{region}</span>}
        </div>
        <span className="producer-map__caption">Localização ilustrativa</span>
      </div>
      <figcaption>
        <p>
          {locality
            ? 'A localidade situa esta história fictícia. Não existem coordenadas verificadas nem uma morada de exploração publicada.'
            : 'Ainda não existe uma localidade pública. O mapa será apresentado quando essa informação estiver disponível.'}
        </p>
        {query && (
          <a
            href={`https://www.openstreetmap.org/search?${query}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir mapa de ${locality} (novo separador)`}
          >
            Explorar a localidade no mapa <Icon name="diagonal" />
            <span className="visually-hidden"> (novo separador)</span>
          </a>
        )}
      </figcaption>
    </figure>
  );
}
