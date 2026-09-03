# Profile Specification — Partner and Company
## AssuredGig / AssuredCrew — MVP

| | |
|---|---|
| **Purpose** | Field-level source of truth for the partner and company profiles |
| **Consumers** | Database schema · worker app design · ops console design · matching logic |
| **Status** | Draft v0.1 — for review |
| **Date** | 10 August 2026 |
| **Derived from** | BRD v0.1; Backend PRD C-02; Frontend PRD S-04–S-06, S-21 |

**Tags:** **`[D]`** decided · **`[P]`** proposed, needs a yes/no · **`[O]`** open fork.

**How to read the field tables.** Each field carries: the storage name (snake_case, as it will
appear in the table), type, whether it is required and *at what point*, who enters it, validation,
and the UI treatment. **"Required" is qualified by stage** — a field required to receive an offer is
not necessarily required to finish sign-up, and conflating the two is what produces abandoned
onboarding.

**The two profiles are not symmetric.** `[D]` The partner profile is self-entered on a budget
Android phone by someone who may read Tamil more comfortably than English. The company profile is
entered by ops in the console, because demand runs concierge (BR-04). They therefore have different
validation postures, different UI constraints, and different tolerance for optional fields.

---

## 1. Governing principles

1. **Ask only for what matching, contacting, or paying requires.** `[P]` Every additional field is a
   drop-off point on a phone. If no downstream system consumes it, it does not exist.
2. **Declared location is not tracked location.** `[D]` (CHK-08) A partner's home area is *stated by
   the partner*, once. It is not read from the device, and no location is captured outside
   attendance events. This distinction must survive into implementation.
3. **Derived fields are never entered.** `[D]` Reliability, shift counts and standing are computed
   (Backend PRD C-08). No form, console or import may write them.
4. **Company identity is visibility-controlled, not merely stored.** `[D]` (BR-03) The company
   profile holds fields that must not reach a partner before acceptance. Visibility is specified
   per field in §7 and enforced at the API, not in the client.
5. **Money is integer paise.** `[D]` No floats, anywhere, ever.
6. **Phone numbers are E.164.** `[D]` They are the login identity and the messaging address; a
   loosely stored number breaks both.

---

## 2. Partner profile — overview

Five groups. Only groups A and B are needed to *exist*; A through D are needed to *receive offers*.

| Group | Contents | Needed to sign up | Needed to receive offers |
|---|---|---|---|
| A. Identity | Phone, name, photo, language | Yes | Yes |
| B. Work | Roles willing to work | Yes | Yes |
| C. Location | Home area, travel distance | No | **Yes** |
| D. Availability | Days and time bands | No | **Yes** |
| E. Documents | Identity documents | No | `[O]` Register #4 |
| F. Derived | Score, counts, standing | — | System-written |

**Design consequence.** `[P]` Onboarding can end after B, with C and D prompted before the partner
becomes offer-eligible. But since ops vetting gates eligibility anyway (BE-AUTH-06), the simpler
path is to collect A–D in one stepped flow and let vetting be the only gate. **Recommended: collect
A–D at onboarding.**

---

## 3. Partner profile — field specification

### 3.1 Group A — Identity

| Field | Type | Required | Entered by | Validation | UI treatment |
|---|---|---|---|---|---|
| `id` | uuid/cuid | System | — | — | Never shown |
| `phone` | string, E.164 | **Yes**, at sign-up | Partner | Valid Indian mobile; unique across partners | Numeric keypad, country code fixed to +91 `[P]`; immutable after verification `[P]` |
| `phone_verified_at` | timestamp | System | — | Set on OTP success | — |
| `full_name` | string | **Yes** | Partner | 2–60 chars; letters, spaces, common punctuation; not blank | Single text field, no first/last split `[P]` — Indian naming conventions vary too widely for a two-field form |
| `preferred_language` | enum `en` \| `ta` | **Yes** | Partner | One of the supported set | Chosen on S-01 before anything else (AUTH-01); changeable in settings (AUTH-03) |
| `profile_photo_key` | string, object key | **Yes** `[P]` | Partner | Image, ≤ 5 MB pre-compression, face present `[P]` | Camera capture, front-facing, with a retake step; **doubles as the face-verification reference** (BE-PROF-05) |
| `date_of_birth` | date | `[O]` | Partner | 18+ if collected | See §10, Open 1 |
| `gender` | enum | `[O]` | Partner | — | See §10, Open 2 |
| `status` | enum | System | Ops | `pending` · `vetted` · `suspended` · `inactive` | Shown to partner as plain standing text, not a raw enum |
| `created_at`, `updated_at` | timestamp | System | — | — | — |

**`profile_photo_key` is not a decoration.** `[P]` It is the reference image for check-in face
verification, so it must be captured under the same conditions as a check-in selfie — live camera,
front-facing, no gallery import. A photo uploaded from the gallery would let a partner set a
reference that isn't them, which quietly defeats CHK-01.

**Phone immutability `[P]`.** Changing the login identity mid-pilot creates an account-merge problem
nobody wants during a pilot. Recommend: not self-editable; ops-changeable with an audit entry.

### 3.2 Group B — Work

| Field | Type | Required | Entered by | Validation | UI treatment |
|---|---|---|---|---|---|
| `roles` | many-to-many → `role` | **Yes**, ≥ 1 | Partner | Each from the controlled list | Multi-select of large tappable cards with icons `[P]` — icons matter for low-literacy users |
| `experience_note` | text | No | Partner | ≤ 300 chars | Optional free text; ops reads it during vetting `[P]` |

**Roles are a controlled list, not free text.** `[D]` Matching filters on them (BE-OFF-02); free text
cannot be filtered. The list content is `[O]` — Register #7, which professions the MVP serves.

**Recommended starting list `[P]`**, pending Register #7: event/wedding service staff, hotel and
restaurant service, kitchen helper, housekeeping, retail assistant, loading and shifting help.
Six or fewer keeps the selection screen to one scroll.

### 3.3 Group C — Location and travel

| Field | Type | Required | Entered by | Validation | UI treatment |
|---|---|---|---|---|---|
| `home_area_id` | fk → `area` | **Yes** for offers | Partner | From the controlled area list | Searchable list of named localities `[P]`, not a map — a name is easier than a pin for this user |
| `home_lat`, `home_lng` | decimal | **Yes** for offers | Derived from area, or partner-adjusted `[P]` | Valid coordinates within the operating district | Optional "adjust on map" step, skippable |
| `travel_distance_m` | integer, metres | **Yes** for offers | Partner | Bounded to a configured range | Three or four preset chips (e.g. 5 / 10 / 20 km) `[P]` — a slider is precision the user doesn't have and doesn't need |
| `address_text` | text | No | Partner | ≤ 200 chars | Collected only if ops needs it for vetting `[P]`; not used by matching |

**Why an area list rather than a map pin.** `[P]` Distance matching only needs to be accurate to
roughly a kilometre. A named locality is faster to enter, easier to validate, gives ops a
human-readable value, and avoids teaching partners that the app wants their exact home location —
which sits badly beside the no-tracking commitment (CHK-08).

**`area` is a reference table** seeded with Nagercoil-district localities. `[P]` It also becomes the
"area only" value shown on an unaccepted offer (BR-03), so it must be a name a partner recognises.

### 3.4 Group D — Availability

| Field | Type | Required | Entered by | Validation | UI treatment |
|---|---|---|---|---|---|
| `availability` | rows of (weekday, time_band) | **Yes** for offers, ≥ 1 | Partner | Weekday 0–6; band from the controlled set | Grid of days × bands, tap to toggle `[P]` |
| `availability_note` | text | No | Partner | ≤ 200 chars | Free text for exceptions |

**Time bands, not arbitrary times.** `[P]` A controlled set — morning, afternoon, evening, night,
full day — is far easier to enter on a phone than start/end pickers, and is precise enough for a
hard filter. Exact shift times are a property of the requirement, not of availability.

**Availability is a filter input, not a promise.** `[P]` A partner outside their stated availability
can still be offered a shift by ops with a note; the field narrows the shortlist, it does not
constrain ops.

### 3.5 Group E — Documents `[O]` Register #4

Built only under branch B (in-app capture). Under branch A, documents are handled by ops offline and
none of these fields exist in the app.

| Field | Type | Required | Entered by | Validation | UI treatment |
|---|---|---|---|---|---|
| `document_type` | enum | Yes | Partner | `id_proof` · `address_proof` · `bank_proof` · `other` | Type picker then camera |
| `file_key` | string, object key | Yes | Partner | Image or PDF, ≤ 5 MB | Camera or file, with retake |
| `review_status` | enum | System | Ops | `pending` · `verified` · `rejected` | Plain status chip in profile |
| `review_note` | text | No | Ops | ≤ 300 chars | Shown to partner on rejection |
| `expires_at` | date | No | Ops | Future date | Only relevant for licences |

**Recommendation stands: branch A for MVP** (Frontend PRD §11.4). Storing identity documents adds a
review queue, a rejection-messaging path, and a data-protection obligation for no test value while
vetting is already a concierge conversation.

### 3.6 Group F — Derived fields (system-written, never entered)

| Field | Type | Written by | Shown to partner |
|---|---|---|---|
| `reliability_score` | decimal 0–100, nullable | Scoring job | `[O]` Register #2 — flag `reliability_visible` |
| `score_formula_version` | string | Scoring job | No |
| `shifts_completed` | integer | Booking events | Yes `[P]` |
| `shifts_no_show` | integer | Booking events | Yes, in history (HIST-04) |
| `confirmation_response_rate` | decimal | Scoring job | `[O]` with score |
| `last_worked_at` | timestamp | Booking events | Yes `[P]` |
| `vetted_at`, `vetted_by` | timestamp, fk | Ops action | No |

**These belong in the partner record as a cache, with snapshots held separately** (Backend PRD
BE-REL-03). The cached value is what matching reads; the snapshot history is what survives a dispute.

---

## 4. Partner profile — mobile design implications

| Implication | Reason |
|---|---|
| Four onboarding steps, one question per screen | Groups A–D map to S-04, S-05, S-06 plus the identity capture inside S-04 |
| Every selection is a tap, never free typing, except name and optional notes | Typing Tamil on a budget keyboard is the highest-friction action in the flow `[P]` |
| Role and area selectors need icons and large targets | Low-literacy users, 48 dp minimum (NFR-06) |
| Photo capture needs an explicit retake and a "this is used to check you in" rationale | It is a biometric reference, and the partner should know that `[P]` |
| Progress must be visible and resumable | A dropped connection mid-onboarding must not restart the flow `[P]` |
| Profile edit reuses the same components as onboarding | Avoids a second set of screens for the same fields |
| Nothing in the profile displays money owed, balance, or wallet | BR-01 `[D]` |

**Field-level save, not form-level.** `[P]` Each step commits as it completes, so a partner who
abandons at step 3 keeps steps 1 and 2. On a connection this unreliable, an all-or-nothing form
loses real sign-ups.

---

## 5. Company profile — overview

**Entered by ops in the console, not self-serve.** `[D]` (BR-04) There is no company-facing app at
MVP. This drives admin console design and the schema, not mobile.

Three groups: the business, its locations, and its commercial terms.

---

## 6. Company profile — field specification

### 6.1 Group A — Business identity

| Field | Type | Required | Entered by | Validation | Notes |
|---|---|---|---|---|---|
| `id` | uuid/cuid | System | — | — | |
| `brand` | enum `assuredcrew` | System | — | Default | Discriminator for the shared backend `[D]` |
| `type` | enum `smb` \| `enterprise` | **Yes** | Ops | — | Gates future billing and SLA behaviour `[D]`; `smb` throughout the pilot |
| `legal_name` | string | **Yes** | Ops | 2–120 chars | The name on any future invoice |
| `display_name` | string | **Yes** | Ops | 2–80 chars | **What a partner sees after acceptance** (§7) |
| `business_category` | enum | **Yes** `[P]` | Ops | Controlled list | Hotel, restaurant, event/wedding services, retail, catering, other |
| `gstin` | string | No | Ops | GSTIN format if present | Not needed at MVP (BR-01), collected opportunistically |
| `status` | enum | System | Ops | `active` · `paused` · `blocked` | |
| `notes` | text | No | Ops | — | Free-form ops context; never partner-visible |
| `created_at`, `updated_at` | timestamp | System | — | — | |

### 6.2 Group B — Contacts

A company has one or more contacts. **Not user accounts** — there is no company login at MVP `[D]`.

| Field | Type | Required | Entered by | Validation | Notes |
|---|---|---|---|---|---|
| `contact_name` | string | **Yes** | Ops | 2–60 chars | |
| `contact_phone` | string, E.164 | **Yes** | Ops | Valid Indian mobile | The WhatsApp number ops actually uses `[P]` |
| `contact_role` | string | No | Ops | ≤ 40 chars | "Owner", "Manager" |
| `is_primary` | boolean | **Yes** | Ops | Exactly one primary | |
| `whatsapp_opt_in` | boolean | `[P]` | Ops | — | Demand-side comms run on WhatsApp |

**Contact phone is never exposed to a partner.** `[D]` (BR-02) There is no worker–business messaging
channel; contact happens through ops.

### 6.3 Group C — Locations

**A separate entity, and the more important one.** `[P]` A company may have several sites, and it is
the *location*, not the company, that carries the geofence centre a check-in is validated against
(BE-CHK-02). Getting this wrong makes every check-in at a second branch fail.

| Field | Type | Required | Entered by | Validation | Notes |
|---|---|---|---|---|---|
| `id` | uuid/cuid | System | — | — | |
| `company_id` | fk | **Yes** | System | — | |
| `label` | string | **Yes** | Ops | ≤ 60 chars | "Main branch", "Banquet hall" |
| `address_text` | text | **Yes** | Ops | ≤ 300 chars | **Shown to partner after acceptance** |
| `area_id` | fk → `area` | **Yes** | Ops | From the area list | **Shown to partner before acceptance** (BR-03) |
| `lat`, `lng` | decimal | **Yes** | Ops | Within operating district | The geofence centre |
| `geofence_radius_m` | integer | No | Ops | Bounded | **Per-location override** of the global default `[P]` |
| `landmark` | text | No | Ops | ≤ 200 chars | More useful than an address for finding a shop `[P]` |
| `check_in_code` | string | No | Ops | 4–6 digits | For high-value shifts (CHK-05) `[O]` — see §10, Open 5 |
| `is_active` | boolean | **Yes** | Ops | — | |

**Per-location radius override matters.** `[P]` A 150 m default is wrong for a large wedding venue
and wrong for a shop in a dense market row. Without an override, ops has to choose between false
rejections and a radius so wide it stops proving presence.

**Coordinates are ops-verified, not geocoded blindly.** `[P]` A wrong pin means every check-in at
that site fails or every check-in from the street passes. Recommend ops confirms the pin on a map
during setup, and that the first shift at a new location is watched.

### 6.4 Group D — Commercial terms (recorded, not transacted)

`[D]` (BR-01) No payment is processed at MVP. These fields record the agreement.

| Field | Type | Required | Entered by | Notes |
|---|---|---|---|---|
| `default_pay_rate_paise` | integer | No | Ops | Convenience default for new requirements |
| `payment_terms` | enum `secured` \| `credit` | System | Ops | Everyone starts `secured` `[D]`; recorded now, enforced in Phase 2 |
| `agreed_fee_note` | text | No | Ops | Free text during pilot; structured pricing is Phase 2 `[P]` |

**No wallet, no balance, no invoice entity at MVP.** `[D]` These are Phase-2 concerns and building
them now would create tables nobody writes to.

### 6.5 Group E — Derived

| Field | Type | Written by | Notes |
|---|---|---|---|
| `shifts_requested`, `shifts_filled` | integer | Booking events | Feeds fill rate (BE-OPS-03) |
| `no_show_incidents` | integer | Booking events | The count the promise is measured against |
| `last_requirement_at` | timestamp | Booking events | Ops uses it to spot churn `[P]` |

---

## 7. Visibility matrix `[D]` BR-03

**The single most important table in this document.** It determines what the API sends, and it is
enforced by omission at the source — the server does not send withheld fields, so no client bug can
leak them (Backend PRD §16).

| Field | Partner before acceptance | Partner after acceptance | Ops |
|---|---|---|---|
| Company `display_name` | **No** | Yes | Yes |
| Company `legal_name` | No | No `[P]` | Yes |
| Company `business_category` | Yes `[P]` | Yes | Yes |
| Contact name and phone | **No** | **No** `[D]` (BR-02) | Yes |
| Location `area` | **Yes** | Yes | Yes |
| Location `address_text` | **No** | Yes | Yes |
| Location `lat`/`lng` | **No** | Yes | Yes |
| Location `landmark` | No | Yes | Yes |
| Location `check_in_code` | No | **No** `[P]` | Yes |
| Company notes | No | No | Yes |
| Pay rate for the shift | Yes | Yes | Yes |

**`check_in_code` is never sent to the partner** `[P]` — the shop supplies it verbally at the door.
Sending it to the device would make it a second copy of something the partner already has, which
defeats the point of the check.

**Partner fields visible to a company:** none at MVP `[P]`. There is no company app; ops relays what
is needed. When a company app arrives, this table needs a mirror column — worth noting now so it
isn't retrofitted.

---

## 8. Reference data required

These lookup tables must exist before either profile can be created, and their content is a product
decision, not an engineering one.

| Table | Purpose | Content decided by | Status |
|---|---|---|---|
| `role` | Partner roles, requirement roles, matching filter | Founders | `[O]` Register #7 |
| `area` | Home area, offer area display, coarse distance | Ops + founders | `[P]` Seed with Nagercoil district localities |
| `time_band` | Availability bands | `[P]` Recommended set in §3.4 | Proposed |
| `business_category` | Company classification | `[P]` | Proposed |
| `decline_reason` | Fixed list for OFFER-05 | `[P]` | Proposed |
| `cancel_reason` | Fixed list for CONF-05 | `[P]` | Proposed |

**Seeding `role` and `area` is a launch blocker**, not a nice-to-have. Neither profile can be
completed without them, and matching cannot run.

---

## 9. Validation summary

| Rule | Applies to | Enforcement |
|---|---|---|
| Phone unique and E.164 | Partner, company contact | Database constraint + API |
| Partner phone immutable post-verification | Partner | API; ops override with audit `[P]` |
| At least one role | Partner | API, at the offer-eligibility gate |
| At least one availability row | Partner | API, at the offer-eligibility gate |
| Home coordinates within operating district | Partner | API `[P]` — catches a mis-dropped pin |
| Travel distance within configured bounds | Partner | API, bounds from config |
| Exactly one primary contact | Company | API |
| Location coordinates within operating district | Company location | API |
| Geofence radius within configured bounds | Company location | API |
| Money fields are integer paise | Both | Type-level `[D]` |
| Derived fields reject external writes | Both | No API surface exposes them `[D]` |

**Offer eligibility is a computed gate, not a stored flag** `[P]`: vetted status **and** ≥1 role
**and** availability **and** home coordinates **and** travel distance. Storing it as a boolean
invites it going stale.

---

## 10. Open decisions

| # | Decision | Affects | Recommendation |
|---|---|---|---|
| 1 | Collect date of birth? | Partner Group A | **Yes if any role has an age requirement or documents are collected; otherwise no.** It is PII with no matching use of its own |
| 2 | Collect gender? | Partner Group A | **Only if ops needs it for specific placements** (some venues request it). If collected, make it optional with a prefer-not-to-say option — and note it is a discrimination surface that needs a deliberate answer, not a default |
| 3 | Which roles the MVP serves | `role` table, whole matching flow | Register #7 — **launch blocker** |
| 4 | Documents in-app or ops-offline | Partner Group E | Register #4 — recommend ops-offline |
| 5 | Is `check_in_code` per location or per shift? | Company location vs requirement | **Per shift `[P]`** — a static per-location code leaks to regulars and stops proving anything. Per-shift means generating and communicating it, which is ops work; decide before high-value shifts run |
| 6 | Bank details for future payouts | Partner, new group | **Do not collect at MVP.** BR-01 means nothing consumes them, and holding bank data with no payment flow is pure liability |
| 7 | Multiple phone numbers per partner | Partner Group A | Not at MVP; one number is the identity |
| 8 | Partner-visible company rating | Company derived | Not at MVP; no mechanism exists to produce it |

Decision 3 blocks launch. Decisions 1, 2 and 5 should be answered before the schema is written,
since they add or remove fields. The rest can wait.

---

## 11. Entity summary for schema work

The tables this document implies, without prescribing the schema itself.

**Partner side:** `partner` (Groups A–C, F) · `partner_role` (join) · `partner_availability` ·
`partner_document` `[O]`.

**Company side:** `company` (Groups A, D, E) · `company_contact` · `company_location`.

**Reference:** `role` · `area` · `time_band` · `business_category` · `decline_reason` ·
`cancel_reason`.

**Related, specified elsewhere:** `reliability_score` snapshots (Backend PRD C-08), `requirement`,
`booking`, `attendance`.

**Two notes for whoever writes the schema.** `company_location` — not `company` — is what a
`requirement` points at, because the geofence lives there. And every derived field in Group F must
be writable only by the scoring and booking-event paths; if it appears in a profile-update DTO, that
is a defect.
