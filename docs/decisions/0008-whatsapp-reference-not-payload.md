# 0008. WhatsApp handoff carries a reference, not order contents

**Status:** Accepted
**Date:** 2026-09-04

## Context

Orders hand off to WhatsApp, because that is where these stores already talk to buyers and
where the cash-on-delivery conversation actually happens.

The convenient implementation puts the full order into the message: buyer name, delivery
address, phone, item list, total. One tap, everything the store needs, nothing to look up.

That message goes through a third party.

## Decision

The handoff sends an order reference and a link. The store opens the order in Talla to see
buyer details.

## Consequences

One extra tap for the store owner, and the store must be signed in to see the details. Mild
friction on a flow that owners run many times a day, and the most likely thing they will
complain about.

In exchange, buyer name, address, and basket never enter a third-party message thread.
Under Egypt's PDPL 151/2020 and its regional equivalents that is a disclosure Talla would
otherwise be making on the store's behalf, and it would drag a messaging platform into the
processor chain for no functional gain.

It also keeps the order state in one place. A message is a snapshot; if the buyer changes
the address, a thread full of stale copies is worse than no copy.

Revisit only if store owners genuinely cannot work this way in practice. The right response
then is a better mobile order view, not a fuller message.
