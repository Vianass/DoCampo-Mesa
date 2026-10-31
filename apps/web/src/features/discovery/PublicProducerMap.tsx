import { useState } from 'react';
import InteractiveMap from './InteractiveMap';
import { Button } from '../../components/Button';
import { mapLink, type PublicLocation } from './location';
export function PublicProducerMap({
  locality,
  region,
  location,
}: {
  locality?: string;
  region?: string;
  location?: PublicLocation;
}) {
  const [enabled, setEnabled] = useState(false);
  if (!location)
    return (
      <div className="producer-location-unavailable">
        <h3>Localização indisponível</h3>
        <p>
          {locality ? `${locality}${region ? ', ' + region : ''}. ` : ''}O produtor ainda não
          publicou um ponto autorizado. Não existe um marcador de exploração.
        </p>
      </div>
    );
  const representable = Math.abs(location.latitude) <= 85.05112878;
  return (
    <figure className="producer-map producer-map--live">
      <figcaption>
        <h3>{location.descricao}</h3>
        <p>
          Ponto indicado pelo produtor: {location.latitude.toLocaleString('pt-PT')},{' '}
          {location.longitude.toLocaleString('pt-PT')}. Não é uma verificação da morada da
          exploração.
        </p>
      </figcaption>
      {!representable ? (
        <p>Este ponto fica fora da área representável por este mapa.</p>
      ) : enabled ? (
        <InteractiveMap location={location} />
      ) : (
        <div className="producer-map-consent">
          <p>
            O mapa utiliza OpenStreetMap. Ao abri-lo, o browser comunica com esse serviço e
            transmite o endereço IP e a origem deste site. Não enviamos contactos, moradas privadas
            ou credenciais.
          </p>
          <Button variant="secondary" onClick={() => setEnabled(true)}>
            Mostrar mapa OpenStreetMap
          </Button>
        </div>
      )}
      <p>
        <a href={mapLink(location)} target="_blank" rel="noopener noreferrer">
          Abrir localização no OpenStreetMap (novo separador) ↗
        </a>
      </p>
    </figure>
  );
}
