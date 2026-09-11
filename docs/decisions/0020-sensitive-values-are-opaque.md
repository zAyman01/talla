# 0020. Sensitive values are opaque wrappers, not branded strings

**Status:** Accepted
**Date:** 2026-09-11

## Context

Spec 16.5 and [`CLAUDE.md`](../../CLAUDE.md) section 4 both say the same thing: buyer PII
never appears in a log line, including inside error payloads. It is listed as a
non-negotiable, on the grounds that it is expensive or impossible to retrofit.

Until Stage S there was no logger, so the rule had nothing to bind to. It was a sentence
that a reviewer had to enforce by noticing, on every change, forever.

The obvious mechanism is a branded type. It does not work.

```ts
type Sensitive<T> = T & { readonly __sensitive: true };
```

A branded string is still a `string`. It satisfies every signature a plain string
satisfies, so `logger.info('order.placed', { phone })` compiles, runs, and writes the
number. The brand documents intent to a reader and communicates nothing to the compiler at
the call site that matters.

## Decision

A sensitive value is an **opaque wrapper object**, in `packages/sensitive`:

```ts
const ACCESS: unique symbol = Symbol('talla.sensitive.access');
interface Sensitive<T> { readonly [ACCESS]: () => T; toJSON: () => string; }
```

It is not assignable to the logger's field type, so a log site carrying one fails to
compile. `toJSON` and `toString` return `[sensitive]`, so `JSON.stringify` of a containing
object cannot spill it. The accessor symbol is module private, so nothing outside that file
can reach the value without calling `reveal`.

`reveal` has two legitimate call sites, named in its doc comment: the privacy box that
seals a buyer record, and the OTP delivery adapter that hands a number to a carrier.

## Consequences

The rule is now a property of the program rather than a property of the reviewer. A new
log line carrying a phone number does not reach review, because it does not build.

**It costs ergonomics at every site that handles buyer data**, which is the trade being
made deliberately. Wrapping and unwrapping is friction, and it is concentrated exactly
where friction is worth paying for. Code that does not touch PII never sees the type.

**It is not a capability boundary.** `Object.getOwnPropertySymbols` finds the accessor, and
anyone determined to leak a phone number still can. This stops the accident, which is the
failure that actually happens, and it does not pretend to stop an attacker who is already
executing code in the process.

**A runtime redactor sits behind it** in `packages/observability` as defence in depth, and
a test asserts it never fires on real logging paths. If redaction triggers, a typed hole
exists somewhere, and the build should say so rather than quietly saving the day.

**Config secrets use the same wrapper**, so a database URL with a password in it cannot be
logged either, and a configuration error message never contains the value it rejected.
