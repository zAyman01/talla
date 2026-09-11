'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';
import { requestCode, submitCode } from '../server/actions.ts';
import type { ActionState } from '../server/actions.ts';

/**
 * The two sign-in steps.
 *
 * These are client components only so the form can show back what the action returned.
 * They import the action, not the container: `no-client-into-server` in
 * `.dependency-cruiser.cjs` forbids a component reaching `server/`, and the exception for
 * a `'use server'` module is the whole point of the directive.
 */

const EMPTY: ActionState = {};

function Notice({ state }: { state: ActionState }): ReactNode {
  if (state.message === undefined) return null;
  return (
    <div className="notice" role="alert">
      <span>{state.message}</span>
      {state.fix !== undefined && <span className="muted">{state.fix}</span>}
    </div>
  );
}

export function SignInForm(): ReactNode {
  const [state, action, pending] = useActionState(requestCode, EMPTY);
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="phone">رقم الهاتف</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="+201000000000"
          required
        />
      </div>
      <Notice state={state} />
      <button className="primary" type="submit" disabled={pending}>
        {pending ? 'جارٍ الإرسال' : 'أرسل الرمز'}
      </button>
      <p className="muted">
        نرسل رمزًا من ستة أرقام. لا توجد كلمة مرور، ولن نطلب منك واحدة أبدًا.
      </p>
    </form>
  );
}

export function CodeForm(): ReactNode {
  const [state, action, pending] = useActionState(submitCode, EMPTY);
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="code-phone">رقم الهاتف</label>
        <input
          id="code-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="code">الرمز</label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          dir="ltr"
          required
        />
      </div>
      <Notice state={state} />
      <button className="primary" type="submit" disabled={pending}>
        {pending ? 'جارٍ التحقق' : 'تأكيد'}
      </button>
      <p className="muted">الرمز صالح خمس دقائق.</p>
    </form>
  );
}
