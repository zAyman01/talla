# 0024. Twilio delivers pilot SMS through a narrow carrier adapter

**Status:** Accepted
**Date:** 2026-09-13

## Context

Buyer order verification and owner sign-in both depend on OTP delivery. The production
application images correctly reject the development log channel, but the `sms` channel had
no adapter, so every production-shaped phone flow stopped at delivery. The existing module
interfaces already reduce a carrier to one function that accepts a phone number and code.

## Decision

Use Twilio Messaging Services for the pilot SMS channel, through `packages/otp`. Call the
Messages REST endpoint directly with an API key, a messaging service SID, and a ten-second
timeout. Do not add the Twilio SDK for one request. Both applications use the same adapter.

Selecting `TALLA_OTP_CHANNEL=sms` requires all four Twilio settings at process startup.
The API key secret is a `Sensitive<string>` and is revealed only inside the adapter when
constructing HTTP Basic authentication. The recipient and code appear only in the form
body sent to Twilio. Carrier details never enter a user-facing error or a log line.

## Consequences

Production-shaped buyer and owner flows now have a real delivery path, with one carrier
configuration and identical failure semantics. Talla accepts Twilio's recurring delivery
cost and regional carrier variability for the pilot. The OTP modules still depend only on
a delivery function, so a WhatsApp fallback or another SMS carrier can be added without
changing authentication, sessions, or commerce.

`whatsapp` is not accepted as a configuration value until it has an adapter. A process
that boots with a channel it cannot deliver through is degraded even when its health
endpoint says otherwise.

Owner lookup still has the timing difference explicitly accepted for the pilot in
ADR-0022: a registered number waits on the carrier and an unknown number does not. The SMS
adapter makes that residual easier to measure. Rate limits bound probing, but do not erase
the oracle. If the pilot threat model no longer accepts it, delivery moves behind a durable
outbox so the HTTP response no longer waits on the carrier.

The API response proves acceptance, not handset delivery. Delivery receipts and carrier
monitoring remain deployment work. Local Compose uses valid-shaped but non-working
credentials so applications start without making log OTP available in a production build.
Those values live in `.env.sms`, which only storefront and admin receive. Production
manifests must preserve that scope; migration, seed, image, GPU, and job processes do not
need the carrier credential.
