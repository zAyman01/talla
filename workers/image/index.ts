import type { RawUpload, ValidatedPhotoSet, IngestRejection } from '@talla/ingest';
import type { Result } from '@talla/shared';

/**
 * SANDBOXED. Network isolated. Parses untrusted bytes.
 *
 * The only component that parses bytes chosen by someone outside the system. Assume it
 * will eventually be compromised and give it nothing worth having: no database
 * credentials, no egress, no buyer data (spec 12.2).
 *
 * A change here requires both engineers' review (CONTRIBUTING.md).
 */

export interface ImageWorker {
  /**
   * Decode, check, and re-encode. Output is safe for everything downstream; input is
   * assumed hostile in every field.
   */
  process(upload: RawUpload): Promise<Result<ValidatedPhotoSet, IngestRejection>>;
}
