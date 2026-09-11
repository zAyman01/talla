import type { ReactNode } from 'react';
import { signOut } from '../server/actions.ts';

/** A form, not a link: signing out changes state, so it must not be a GET. */
export function SignOutButton(): ReactNode {
  return (
    <form action={signOut}>
      <button type="submit">تسجيل الخروج</button>
    </form>
  );
}
