'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';
import { confirmGarment } from '../../../../../server/actions.ts';
import type { ActionState } from '../../../../../server/actions.ts';

const EMPTY: ActionState = {};

export function ConfirmForm({
  tenantId,
  garmentId,
}: {
  tenantId: string;
  garmentId: string;
}): ReactNode {
  const [state, action, pending] = useActionState(confirmGarment, EMPTY);
  return (
    <form action={action}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="garmentId" value={garmentId} />
      {state.message !== undefined && (
        <div className="notice" role="alert">
          <span>{state.message}</span>
          {state.fix !== undefined && <span className="muted">{state.fix}</span>}
        </div>
      )}
      <button className="primary" type="submit" disabled={pending}>
        {pending ? 'جارٍ النشر' : 'انشر القطعة'}
      </button>
      <p className="muted">بعد النشر تظهر القطعة في المتجر ويمكن للمشترين طلبها.</p>
    </form>
  );
}
