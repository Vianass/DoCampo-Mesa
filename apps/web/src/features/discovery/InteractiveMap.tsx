import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '../../components/Button';
import type { PublicLocation } from './location';
export default function InteractiveMap({ location }: { location: PublicLocation }) {
  const container = useRef<HTMLDivElement>(null),
    mapRef = useRef<LeafletMap | null>(null),
    [attempt, setAttempt] = useState(0),
    [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    void import('leaflet')
      .then((L) => {
        if (stopped || !container.current) return;
        const map = L.map(container.current, {
          scrollWheelZoom: false,
          keyboard: true,
          zoomControl: false,
        }).setView([location.latitude, location.longitude], 13);
        mapRef.current = map;
        L.control
          .zoom({ zoomInTitle: 'Ampliar mapa', zoomOutTitle: 'Reduzir mapa', zoomOutText: '−' })
          .addTo(map);
        // Imagens dos tiles, sem cookies/credenciais de escrita nem cache desativada.
        const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          minZoom: 3,
          maxZoom: 19,
          keepBuffer: 0,
          updateWhenIdle: true,
          referrerPolicy: 'strict-origin-when-cross-origin',
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        });
        let failed = false;
        tiles.on('tileerror', () => {
          failed = true;
          if (!stopped) setState('error');
        });
        tiles.on('load', () => {
          if (!stopped) {
            clearTimeout(timer);
            setState(failed ? 'error' : 'ready');
          }
        });
        tiles.addTo(map);
        L.circleMarker([location.latitude, location.longitude], {
          radius: 9,
          color: '#193c34',
          weight: 3,
          fillColor: '#f7f3ea',
          fillOpacity: 1,
        }).addTo(map);
        timer = setTimeout(() => {
          if (!stopped) setState('error');
        }, 12000);
        map.invalidateSize();
      })
      .catch(() => {
        if (!stopped) setState('error');
      });
    return () => {
      stopped = true;
      clearTimeout(timer);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [location.latitude, location.longitude, attempt]);
  return (
    <div className="producer-interactive-map">
      <p className="map-instructions">
        Mapa interativo: usa os botões + e − para ampliar. Com o mapa focado, as setas deslocam a
        vista; Tab permite sair. A descrição e as coordenadas acima são uma alternativa ao mapa.
      </p>
      {state === 'loading' && <p role="status">A carregar cartografia…</p>}
      {state === 'error' && (
        <div role="alert">
          <p>Não foi possível carregar toda a cartografia. O ponto textual continua disponível.</p>
          <Button
            variant="secondary"
            onClick={() => {
              setState('loading');
              setAttempt((v) => v + 1);
            }}
          >
            Tentar carregar o mapa novamente
          </Button>
        </div>
      )}
      <div
        ref={container}
        className="producer-map-canvas"
        role="region"
        aria-label={'Mapa do ponto público: ' + location.descricao}
        aria-busy={state === 'loading'}
      />
      <p className="map-attribution">
        Cartografia ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap contributors
        </a>
        .{' '}
        <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">
          Comunicar um problema no mapa
        </a>
        .
      </p>
    </div>
  );
}
