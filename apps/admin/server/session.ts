import { cookies } from 'next/headers';

/**
 * Session and challenge cookies.
 *
 * Spec 12.4, and the flags are not boilerplate:
 *
 * - `httpOnly`, so a script that gets onto the page cannot read the session.
 * - `secure`, outside development, because an order flow over a downgradeable
 *   connection is the cheapest possible interception (spec 12.6).
 * - `sameSite: 'lax'`, which with the origin check in `proxy.ts` is what stands in for
 *   a CSRF token.
 * - **No `domain`.** Host-only, never scoped to the parent. A cookie on `.talla.app`
 *   would be readable by every tenant storefront, which turns one hostile store into a
 *   compromise of the admin origin. Omitting `domain` is what makes it host-only, so the
 *   absence of a line is the control here, which is exactly why it is written down.
 */

const SESSION = 'talla_admin_session';
const CHALLENGE = 'talla_admin_challenge';

/** Ten minutes: long enough to read an SMS, short enough to be worth little if leaked. */
const CHALLENGE_MAX_AGE_SECONDS = 10 * 60;
/** Matches the absolute session cap in `modules/tenancy`. */
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function base(secure: boolean): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
} {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/' };
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION)?.value;
}

export async function writeSessionToken(token: string, secure: boolean): Promise<void> {
  (await cookies()).set(SESSION, token, {
    ...base(secure),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionToken(): Promise<void> {
  (await cookies()).delete(SESSION);
}

export async function readChallengeId(): Promise<string | undefined> {
  return (await cookies()).get(CHALLENGE)?.value;
}

/**
 * The pending challenge lives in a cookie rather than in client state, so the sign-in
 * screen stays two plain server-rendered forms. Admin is motion 2 and density 7: a form
 * that works without JavaScript is the right shape for it.
 */
export async function writeChallengeId(
  challengeId: string,
  secure: boolean,
): Promise<void> {
  (await cookies()).set(CHALLENGE, challengeId, {
    ...base(secure),
    maxAge: CHALLENGE_MAX_AGE_SECONDS,
  });
}

export async function clearChallengeId(): Promise<void> {
  (await cookies()).delete(CHALLENGE);
}
