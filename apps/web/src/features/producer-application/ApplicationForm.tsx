import { FormField } from '../../components/FormField';
import { Button } from '../../components/Button';
import { ProducerTextarea, ProducerFormErrors } from '../producer/ProducerFields';
import { applicationFields, type ApplicationField } from './model';
import { useApplication } from './useApplication';

export function ApplicationForm() {
  const { state, edit, submit } = useApplication();
  const resubmission = state.application?.estado === 'rejeitado';
  const input = (field: ApplicationField, autoComplete: string, type = 'text') => (
    <FormField
      label={applicationFields[field].label}
      name={field}
      type={type}
      autoComplete={autoComplete}
      required
      value={state.draft[field]}
      onChange={(event) => edit(field, event.target.value)}
      error={state.errors[field]}
      hint={`Até ${applicationFields[field].maximum} caracteres.`}
    />
  );
  return (
    <section className="application-paper" aria-labelledby="application-form-title">
      <p className="eyebrow">{resubmission ? 'Uma nova oportunidade' : 'Começar pela origem'}</p>
      <h2 id="application-form-title">
        {resubmission ? 'Vamos rever a tua candidatura.' : 'Conta-nos o que produzes.'}
      </h2>
      <p>
        {resubmission
          ? 'Atualiza os dados tendo em conta o motivo da rejeição. A tentativa anterior fica no teu histórico.'
          : 'Apresenta a tua exploração ou atividade à equipa. Todos os campos são obrigatórios.'}
      </p>
      <form
        noValidate
        aria-label="Candidatura a produtor"
        aria-busy={state.saving}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <ProducerFormErrors errors={state.errors} />
        <fieldset disabled={state.saving || state.uncertain}>
          <legend className="visually-hidden">Dados da candidatura — todos obrigatórios</legend>
          {input('nomePublico', 'organization')}
          <div className="application-form-row">
            {input('localidade', 'address-level3')}
            {input('concelho', 'address-level2')}
          </div>
          <ProducerTextarea
            label={applicationFields.descricao.label}
            name="descricao"
            required
            rows={6}
            value={state.draft.descricao}
            onChange={(event) => edit('descricao', event.target.value)}
            error={state.errors.descricao}
            hint="O que produzes e como desenvolves a atividade. Até 5000 caracteres."
          />
          {input('telefone', 'tel', 'tel')}
          <p className="application-privacy">
            O telefone é um contacto privado para a candidatura. Não é apresentado no perfil
            público.
          </p>
          <Button type="submit" disabled={state.saving || state.uncertain}>
            {state.saving
              ? 'A enviar candidatura…'
              : resubmission
                ? 'Reapresentar candidatura'
                : 'Enviar candidatura'}
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
