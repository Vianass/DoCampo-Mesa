import { FormField } from '../../components/FormField';
import type { useLocationDraft } from './useLocationDraft';
export function LocationFields({ location: p }: { location: ReturnType<typeof useLocationDraft> }) {
  return (
    <fieldset className="public-location-fields">
      <legend>Localização pública no mapa</legend>
      <p>
        Escolhe um ponto que aceitas divulgar, por exemplo um local público de referência. Não
        copiamos a morada privada de levantamento nem procuramos coordenadas automaticamente.
      </p>
      <label className="management-check">
        <input
          type="checkbox"
          checked={p.enabled}
          onChange={(e) => {
            p.setEnabled(e.target.checked);
            if (e.target.checked) p.setConsent(false);
          }}
        />
        Publicar um ponto de localização
      </label>
      {p.enabled && (
        <>
          <div className="management-grid">
            <FormField
              label="Latitude pública"
              type="number"
              step="any"
              min={-90}
              max={90}
              required
              value={p.latitude}
              onChange={(e) => p.setLatitude(e.target.value)}
            />
            <FormField
              label="Longitude pública"
              type="number"
              step="any"
              min={-180}
              max={180}
              required
              value={p.longitude}
              onChange={(e) => p.setLongitude(e.target.value)}
            />
          </div>
          <FormField
            label="Descrição do ponto público"
            required
            maxLength={200}
            value={p.description}
            onChange={(e) => p.setDescription(e.target.value)}
            hint="Explica o que representa este ponto; não publiques informação privada."
          />
          <label className="management-check">
            <input
              type="checkbox"
              required
              checked={p.consent}
              onChange={(e) => p.setConsent(e.target.checked)}
            />
            Autorizo a publicação destas coordenadas e desta descrição no meu perfil público.
          </label>
        </>
      )}
      <p>
        Desativar a publicação e guardar remove o ponto do perfil público. Nenhuma localização é
        inventada quando este campo está vazio.
      </p>
    </fieldset>
  );
}
