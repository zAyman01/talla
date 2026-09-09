/**
 * SANDBOXED. Network isolated. Parses untrusted bytes.
 *
 * The only component that parses bytes chosen by someone outside the system. Assume it
 * will eventually be compromised and give it nothing worth having: no database
 * credentials, no egress, no buyer data (spec 12.2).
 *
 * A change here requires both engineers' review (CONTRIBUTING.md).
 */

export type {
  ImageWorker,
  ImageWorkerDependencies,
  PhotoQualityRejection,
} from './contracts.ts';

export { createImageWorker } from './process.ts';
