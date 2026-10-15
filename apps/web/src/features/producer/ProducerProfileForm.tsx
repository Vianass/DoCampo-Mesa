import { useState } from 'react';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import type { Producer } from '../../types/market';
import type { FieldErrors, ProfileDraft } from './types';
import { ProducerFormErrors, ProducerTextarea } from './ProducerFields';
import { validateProfile } from './selectors';
import { useProducer } from './useProducer';
export function ProducerProfileForm({ profile }: { profile: Producer }) {
  const [draft, setDraft] = useState<ProfileDraft>({
    name: profile.name,
    locality: profile.locality,
    description: profile.description,
  });
  const [errors, setErrors] = useState<FieldErrors<ProfileDraft>>({});
  const { saveProfile } = useProducer();
  function change(key: keyof ProfileDraft, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrors({});
  }
  return (
    <form
      noValidate
      className="producer-editor"
      aria-label="Editar perfil demonstrativo"
      onSubmit={(event) => {
        event.preventDefault();
        const next = validateProfile(draft);
        setErrors(next);
        if (!Object.keys(next).length) saveProfile(draft);
      }}
    >
      <ProducerFormErrors errors={errors} />
      <FormField
        label="Nome público"
        required
        maxLength={120}
        value={draft.name}
        error={errors.name}
        onChange={(event) => change('name', event.target.value)}
      />
      <FormField
        label="Localidade"
        required
        maxLength={120}
        value={draft.locality}
        error={errors.locality}
        onChange={(event) => change('locality', event.target.value)}
      />
      <ProducerTextarea
        label="Descrição do produtor (opcional)"
        rows={5}
        maxLength={1000}
        value={draft.description}
        error={errors.description}
        onChange={(event) => change('description', event.target.value)}
      />
      <p className="producer-help">
        A edição não altera o perfil público, aprovação, conta, certificação ou coordenadas. Mantém
        apenas informação demonstrativa nesta sessão.
      </p>
      <div className="producer-actions">
        <Button type="submit">Guardar perfil na demonstração</Button>
        <Button to="/area/produtor/perfil/pre-visualizacao" variant="secondary">
          Pré-visualizar o perfil
        </Button>
      </div>
    </form>
  );
}
