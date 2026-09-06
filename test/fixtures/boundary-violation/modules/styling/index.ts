// Fixture. This import is the violation the boundary gate must catch: styling reaching
// into commerce's internals instead of its published interface.
import { marginFloor } from '../commerce/internal/pricing.ts';

export const floor: number = marginFloor;
