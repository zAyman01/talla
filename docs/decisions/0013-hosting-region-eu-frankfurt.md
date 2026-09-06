# 0013. The primary database is hosted in EU Frankfurt

**Status:** Accepted
**Date:** 2026-09-06

## Context

From the first cash-on-delivery order Talla holds a buyer's name, phone number, and home
address. That is personal data under Egypt's Personal Data Protection Law 151/2020, and
spec 12.7 records that cross-border transfer is the provision most likely to be enforced.
The spec asked for a MENA or EU region and said the choice costs nothing on day one and a
quarter to change later.

The fact that decides this: **there is no in-country cloud region in Egypt.** Every
available option is a cross-border transfer, so the choice cannot be framed as local versus
foreign. It is a choice between two foreign jurisdictions, and the transfer obligations
under PDPL attach either way.

That reframing removes the argument that usually wins these decisions, and leaves three
that actually differ: the strictness of the destination regime, service coverage and cost,
and where the export path in spec section 3 is going.

## Decision

**Primary PostgreSQL in EU Frankfurt.** Object storage for published assets in the same
region, fronted by a CDN with MENA edge presence so buyer-facing asset latency is decided
by the edge rather than the origin.

The processor and controller split required by spec 12.7 is written into the store
contract, and the privacy notice names the hosting jurisdiction in Arabic, plainly.

## Consequences

**Why not a MENA region.** UAE and Bahrain regions offer residency optics that sell well to
Gulf stores, and neither makes Egyptian buyer data local, because neither is in Egypt. They
cost more, carry a thinner managed-service catalog, and would still be a cross-border
transfer requiring the same lawful basis and the same contract clauses. Paying more for a
weaker platform to buy an appearance of residency that does not survive a careful question
is not a trade worth making.

**Why the EU specifically.** Spec 12.7 says design once for the strictest. A GDPR-grade
destination is the strongest position to argue from under Saudi PDPL and UAE Federal
Decree-Law 45/2021 as the export path opens, and it is the region the Shopify and
WooCommerce export path in spec section 3 is aimed at anyway. Frankfurt also sits roughly
60 ms from Cairo over well-provisioned submarine routes, which is close enough that the
origin is not the thing a buyer feels.

**What this costs, honestly.** A Gulf enterprise buyer may demand in-region residency, and
this decision loses that deal or forces a migration. Talla's v1 customer is a 100 to 400
SKU store sold to in person, not an enterprise procurement process, so that cost is
deferred rather than avoided. If a Gulf pilot demands residency before Phase 3, that is a
superseding record and a real migration, and the content-addressed asset design in
[ADR-0009](0009-content-addressed-assets.md) makes the asset half of it far cheaper than
the database half.

**What it obliges.** Buyer contact fields are encrypted at column level, so that a leaked
backup crossing a border is not a leaked address book. The retention window is defined
before the first pilot rather than after. Deletion and export paths exist from v1 even as a
support-operated script. None of that is new; the region choice is what makes it concrete.

**What it prevents.** The quarter-long migration the spec warned about, and the worse
version of it where the region is chosen implicitly by whoever runs `terraform apply`
first.
