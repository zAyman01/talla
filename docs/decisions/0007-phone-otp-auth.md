# 0007. Phone OTP for store owner authentication

**Status:** Accepted
**Date:** 2026-09-04

## Context

Store owners are small-business operators in MENA who run their business through Instagram
and WhatsApp on a phone. They are not a population that will adopt a password manager.

A password field for this audience produces `123456`, or the same password as their
Instagram account, which is itself frequently compromised. Either way the password is not a
meaningful authentication factor, but it creates the appearance of one.

## Decision

Phone OTP. No password at all for store owner accounts.

Rate limited per phone and per IP, codes expiring in five minutes, attempts capped, and
responses that never reveal whether a number is registered.

If passwords are ever added, Argon2id, and never as the only factor for admin.

## Consequences

SMS delivery cost is real and recurring, and delivery reliability across MENA carriers is
uneven. Budget for it, and have a fallback channel: these owners already live in WhatsApp.

Account recovery becomes carrier-dependent. A lost or ported number is a support
conversation, and SIM swap is a real attack in the region. The audit log
([spec 12.8](../superpowers/specs/2026-09-04-talla-design.md)) is what makes a disputed
recovery resolvable.

In exchange the system stores no password hashes, so there is no credential database worth
stealing, no password reset flow to get wrong, and no credential-stuffing surface from other
sites' breaches.

It also matches how owners already work, which matters more than it sounds: onboarding
friction is the second-ranked risk in the spec, and an authentication step an owner does not
understand is friction at exactly the wrong moment.
