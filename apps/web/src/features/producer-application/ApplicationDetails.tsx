import { orderDate } from '../orders/format';
import {
  applicationFields,
  stateLabels,
  type ApplicationAttempt,
  type ApplicationField,
} from './model';

export function ApplicationDetails({ application }: { application: ApplicationAttempt }) {
  return (
    <dl className="application-data">
      {(Object.keys(applicationFields) as ApplicationField[]).map((field) => (
        <div
          key={field}
          className={field === 'descricao' ? 'application-data__description' : undefined}
        >
          <dt>{applicationFields[field].label}</dt>
          <dd>{application[field]}</dd>
        </div>
      ))}
      <div>
        <dt>Submetida em</dt>
        <dd>
          <time dateTime={application.submetidaEm}>{orderDate(application.submetidaEm)}</time>
        </dd>
      </div>
      <div>
        <dt>Estado</dt>
        <dd>{stateLabels[application.estado]}</dd>
      </div>
      {application.decisao && (
        <div>
          <dt>Decisão em</dt>
          <dd>
            <time dateTime={application.decisao.data}>{orderDate(application.decisao.data)}</time>
          </dd>
        </div>
      )}
    </dl>
  );
}
