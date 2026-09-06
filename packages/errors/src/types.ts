/**
 * The error taxonomy, typed. Source of truth for the codes and the copy is
 * docs/architecture/error-taxonomy.md; this file is its executable half, and the two
 * are changed together.
 *
 * A code is permanent. Once shipped its meaning never changes: retire it, never
 * repurpose it.
 */

/** Who reads the message. Determines whether copy is required and what ships on the wire. */
export type ErrorAudience = 'store' | 'buyer' | 'internal';

/** Arabic is written first, then English. Both are product copy, not translations of a log line. */
export interface Copy {
  readonly ar: string;
  readonly en: string;
}

export interface ErrorEntry {
  readonly audience: ErrorAudience;
  readonly httpStatus: number;
  readonly retryable: boolean;
  /** Required for a store or buyer audience, absent for internal codes. */
  readonly message?: Copy;
  /** Required for a store or buyer audience. An error without a next step is not finished. */
  readonly fixAction?: Copy;
  /** Why an internal code exists, for the person reading a trace. */
  readonly note?: string;
}

/** The JSON shape a client receives. Nothing else crosses the boundary. */
export interface WireError {
  readonly code: string;
  readonly http_status: number;
  readonly user_message: Copy;
  readonly fix_action: Copy;
  readonly retryable: boolean;
  readonly trace_id: string;
}
