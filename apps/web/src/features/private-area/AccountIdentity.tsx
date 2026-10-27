import type { AccountUser } from '../auth/types';
import { roleLabels } from '../auth/types';
export function AccountIdentity({ user }: { user: AccountUser }) {
  return (
    <section
      className="private-prototype account-identity"
      aria-labelledby="account-identity-title"
    >
      <h2 id="account-identity-title">A tua conta.</h2>
      <dl className="admin-facts">
        <div>
          <dt>Nome</dt>
          <dd>{user.nome}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>Áreas autorizadas</dt>
          <dd>{user.papeis.map((p) => roleLabels[p]).join(' · ')}</dd>
        </div>
      </dl>
      <p>
        Identidade confirmada pelo serviço. A sessão termina ao atualizar esta página ou ao atingir
        o seu prazo.
      </p>
    </section>
  );
}
