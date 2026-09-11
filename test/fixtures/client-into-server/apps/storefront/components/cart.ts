// Fixture. This import is the violation the gate must catch: a client component reaching
// into the server container, which ships the connection string to the browser.
import { connectionString } from '../server/container.ts';

export const target: string = connectionString;
