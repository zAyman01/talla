import type { ReactNode } from 'react';
import Link from 'next/link';
import { container } from '../server/container.ts';
import { readChallengeId, readSessionToken } from '../server/session.ts';
import { SignInForm, CodeForm } from './sign-in-forms.tsx';
import { SignOutButton } from './sign-out-button.tsx';

/**
 * Sign in, then pick a store.
 *
 * Two server-rendered forms rather than one screen with client state. Admin is motion 2
 * and density 7: a form that works without JavaScript is the right shape, and the pending
 * challenge lives in a short cookie instead of a React state machine.
 */

interface StoreRow extends Record<string, unknown> {
  readonly id: string;
  readonly name_ar: string;
  readonly subdomain: string;
}

export default async function Page(): Promise<ReactNode> {
  const { auth, database } = container();
  const token = await readSessionToken();
  const session = token === undefined ? undefined : await auth.resolveSession(token);

  if (session === undefined || !session.ok) {
    const awaitingCode = (await readChallengeId()) !== undefined;
    return (
      <main className="shell">
        <div className="bar">
          <h1>إدارة طلّة</h1>
        </div>
        <div className="card">{awaitingCode ? <CodeForm /> : <SignInForm />}</div>
      </main>
    );
  }

  const memberships = await auth.membershipsFor(session.value.ownerId);
  const ids = memberships.map((membership) => membership.tenantId);
  const stores =
    ids.length === 0
      ? []
      : await database.platform(async (sql) => {
          // The registry read, outside a tenant transaction because the owner may belong
          // to several and no single tenant is current yet (ADR-0022).
          const { rows } = await sql.query<StoreRow>(
            'SELECT id, name_ar, subdomain FROM tenants WHERE id = ANY($1) AND active ORDER BY name_ar',
            [ids],
          );
          return rows;
        });

  return (
    <main className="shell">
      <div className="bar">
        <h1>المتاجر</h1>
        <SignOutButton />
      </div>
      {stores.length === 0 ? (
        <p className="empty">
          لا يوجد متجر مرتبط بهذا الرقم. تواصل مع طلّة لإضافة متجرك.
        </p>
      ) : (
        <div className="card rows">
          {stores.map((store) => (
            <div className="row" key={store.id}>
              <div>
                <div>{store.name_ar}</div>
                <div className="muted">{store.subdomain}</div>
              </div>
              <Link href={`/s/${store.id}`}>فتح</Link>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
