# The HunterReady API

Read a CV into structured fields, and render structured fields into a PDF that automated screening
can parse. Two endpoints, because everything else in the product operates on the object the first one
produces.

> **This page explains; [`/docs`](https://hunterready.eduardoinerarte.dk/docs) enumerates.**
> The browsable reference is generated from the Zod schemas the server validates against, so its
> field lists cannot drift from what the API accepts — and the document behind it,
> [`/v1/openapi.json`](https://hunterready.eduardoinerarte.dk/v1/openapi.json), imports into Postman
> or Bruno and generates a typed client.
>
> What is here and not there is the reasoning: who consents, what is deliberately absent, and why a
> `422` will never tell you which field was wrong. OpenAPI is better at reference and worse at prose,
> so the two sit beside each other rather than one replacing the other.

**Base URL:** `https://hunterready.eduardoinerarte.dk`
**Version:** `v1`. The unversioned `/api/*` routes are what the browser client talks to; they change
when the interface changes and are not a contract.

**Beta.** Everything here works and some of it will change. Breaking changes get a new version
prefix, never a silent edit to `v1`.

---

## Authentication

Every `/v1` request needs a key:

```
Authorization: Bearer hr_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are issued by hand while there is a small number of them. Ask Edd.

**A key is shown once.** It is stored as a hash and cannot be read back — not by support, not from a
database dump. If you lose one, it gets revoked and you get another.

**Revocation is immediate.** A revoked key fails on its very next call; there is no cache to wait
out. So if a key leaks, say so and it stops working in seconds.

Every key begins `hr_live_`, which makes a leaked one greppable in your logs and recognisable in a
paste. Treat it like a password: environment variable, never a repository, never a client-side
bundle. **A key in a browser is a key anybody can read.**

Anything not authenticated gets `401`, in one shape for every reason — missing header, malformed
header, unknown key, revoked key. That is deliberate: distinguishing them would tell somebody holding
a stolen key whether it was ever real.

---

## Which model reads the CV, and who consents

This is the part of the API that is not like other APIs, so it is worth two minutes.

Sending somebody's CV to a third-party model is conditional on **their** consent to a **named
company**, not on yours and not on a checkbox in a contract. Our own interface asks the person
directly. Your integration has no person at our keyboard, so:

**By default the CV is read on our own hardware and does not leave it.** No header, no transfer,
nothing to consent to. This is the safe path and it is what you get if you do nothing.

**To use the larger third-party model, assert the consent on each request:**

```
X-HunterReady-Consent: minimax
```

Valid values are `minimax`, `deepseek`, and `local` (which is the same as sending nothing). Anything
unrecognised is treated as no consent, and the CV stays here.

By sending that header you are stating that the person whose CV this is agreed to the transfer, to
that named company, and that **you hold the record of it**. Per request, never per key: a key is not
a standing permission to send anybody's CV anywhere.

The response tells you which path actually ran, in `method`. If you assert consent and read back
`local`, the account behind your key is not entitled to the third-party model. Nothing about that
account is disclosed beyond that.

The reasoning is in [ADR-032](../09-decisions.md).

---

## `POST /v1/cv`

A document in, structured fields out.

**Request:** `multipart/form-data` with the document under `file`.

| Accepts | `.pdf` `.docx` `.doc` `.txt` `.md`, and a photograph of a printed page |
| ------- | ---------------------------------------------------------------------- |
| Maximum | 10 MB                                                                  |

The format is detected from the bytes, not the filename, so a `.docx` renamed `.pdf` still works.

```bash
curl -X POST https://hunterready.eduardoinerarte.dk/v1/cv \
  -H "Authorization: Bearer $HR_KEY" \
  -F "file=@cv.pdf"
```

**Response `200`:**

```json
{
  "resume": { "schemaVersion": "1.0", "basics": {}, "work": [] },
  "provenance": [
    {
      "path": "basics.fullName",
      "confidence": 1,
      "sourceText": "MARTA SØRENSEN",
      "inferred": false
    }
  ],
  "method": "local",
  "scanned": false,
  "requestId": "x7ynxx7o"
}
```

| Field        | Means                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------- |
| `resume`     | The document as fields. This is what `/v1/render` takes back.                               |
| `provenance` | Where each field came from, and how sure we are. Show it: it is what makes review possible. |
| `method`     | `llm` third-party, `local` our hardware, `rules` the deterministic floor.                   |
| `scanned`    | `true` when the document was read by OCR, which is when to have a person check the result.  |

**Path format.** Dotted, with numeric indices: `basics.fullName`, `work.0.company`,
`work.2.highlights.1`. Never `work[0]`. It is the same string whichever model read the document, so
you can match on a prefix without caring which path ran.

**`provenance` is the interesting one.** `confidence` below `0.7` and `inferred: true` mark the
fields worth showing a human first. A CV read with `method: "rules"` or `scanned: true` deserves the
same treatment. Presenting extraction as finished when it is not is the failure this product exists
to avoid, and the data to avoid it is in the response.

---

## `POST /v1/render`

Structured fields in, a PDF out.

**Request:** `application/json`, the `resume` object exactly as `/v1/cv` returned it — corrected by
your user if they corrected it.

| Query         | Means                                                          |
| ------------- | -------------------------------------------------------------- |
| `template`    | The layout. Omit for the default.                              |
| `theme`       | The voice: type, ink, spacing. Omit for the default.           |
| `bodyFont`    | Override the body typeface. Paid.                              |
| `headingFont` | Override the heading typeface. Paid.                           |
| `accent`      | `#rrggbb`. Paid, and refused if it is unreadable on the paper. |
| `paper`       | `#rrggbb`. Paid.                                               |

```bash
curl -X POST "https://hunterready.eduardoinerarte.dk/v1/render?template=modern-intl&theme=modern" \
  -H "Authorization: Bearer $HR_KEY" \
  -H "Content-Type: application/json" \
  --data @resume.json \
  -o cv.pdf
```

**Response `200`:** `application/pdf`.

Every layout is rendered, read back with an independent parser, and checked field by field in reading
order on every build. A design that loses a field does not ship. That check is the product.

---

## The rest of the surface

Everything below takes JSON, needs the same key, and reads the same `X-HunterReady-Consent` header.
They all operate on a `resume` object — the one `/v1/cv` gave you, corrected by your user.

| Endpoint                 | Body                                          | Returns                                                               |
| ------------------------ | --------------------------------------------- | --------------------------------------------------------------------- |
| `POST /v1/rewrite`       | `resume`, optional `only`, optional `answers` | `rewrites[]`: the original line, a rationale, and a suggestion        |
| `POST /v1/target`        | `resume`, `advert`                            | `requirements` split into what the advert asks for, plus `invented[]` |
| `POST /v1/cover-letter`  | `resume`, `advert`, optional `requirements`   | A draft letter                                                        |
| `POST /v1/translate`     | `resume`, `target` (`en` `es` `da`)           | The whole document in that language                                   |
| `POST /v1/render-letter` | a letter                                      | `application/pdf`                                                     |
| `GET /v1/capabilities`   | —                                             | What this key may do, before it tries                                 |

**`invented[]` from `/v1/target` is the one to read.** It lists claims the model produced that are not
in the CV, and they are refused rather than returned as suggestions. Nothing this API returns will
add a number, an employer, a date or an outcome that the document did not already contain. That is
enforced in code, not in a prompt.

**`only` on `/v1/rewrite`** takes `{workIndex, highlightIndex}` pairs. Send one job per request if a
person is watching, because a whole CV is a lot of model calls in one wait.

### `GET /v1/capabilities`

Ask before you assume. A machine cannot read a consent gate or see a locked design, so this answers
the three questions a client would otherwise discover through a `402` in the middle of a user's flow:

```json
{
  "providers": [{ "id": "minimax", "name": "MiniMax" }],
  "paidDesigns": true,
  "encryptsAtRest": true,
  "rateLimit": { "requests": 12, "windowMinutes": 10 },
  "version": "v1"
}
```

An empty `providers` means the third-party model is not reachable for this key and every CV will be
read on our hardware whatever header you send. It tells you nothing else about the account.

### What is deliberately not here

Saved CVs, the library, and share links are **not** in `/v1`, and it is not an oversight.

Those operate on documents stored against _our_ account holder. Your key belongs to one of those
accounts, so wrapping them would let an integration read and write the CVs of the person who owns the
key — which is right if you are automating your own account, and wrong in every way if your users are
not that person. Getting that distinction wrong is how an integration reads somebody else's CV.

It needs per-key scopes and a decision about whose documents a partner is acting on. Ask, and it gets
designed rather than guessed.

---

## Errors

Every error is JSON with `error`, `message` and `requestId`. **Quote the `requestId`** when
reporting one: our logs deliberately contain no CV content, so it is the only thread back to what
happened.

| Status | `error`                                                                                            | Means                                      |
| ------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `400`  | `no_file`                                                                                          | No `file` field in the form.               |
| `401`  | `unauthorized`                                                                                     | No live key. One shape for every reason.   |
| `402`  | `design_locked` · `axes_locked`                                                                    | That design or override needs a paid plan. |
| `413`  | `too_large`                                                                                        | Over 10 MB.                                |
| `415`  | `unknown_type` · `legacy_office_unsupported` · `empty` · `rtf_unsupported` · `archive_unsupported` | We cannot read that file.                  |
| `422`  | `invalid_resume`                                                                                   | The JSON is not a valid resume.            |
| `429`  | `rate_limited`                                                                                     | Slow down. `Retry-After` is set.           |
| `502`  | `llm_failed` · `invalid_output` · `not_configured`                                                 | The model did not produce a usable answer. |
| `500`  | `render_failed`                                                                                    | That resume could not be rendered.         |

**`422` never lists which fields were wrong.** A validation issue quotes the value it rejected, and
that value is somebody's CV travelling in a response body. Compare against the schema instead.

---

## Rate limits

**12 requests per 10 minutes**, per key, on each endpoint.

Per key rather than per IP, so two integrations behind one address do not share a budget and one
cannot escape by moving hosts. `429` carries `Retry-After`.

Reading a CV is seconds on the third-party model and can be **a minute or more** on ours. Do not put
`/v1/cv` on a request a person is waiting behind; give them something to look at, or queue it.

---

## What we do with the document

- **Nothing is stored.** A CV posted to `/v1/cv` is read, answered, and dropped. There is no copy.
- **Nothing personal is logged.** Our logs carry counts, codes and durations. A test scans the source
  on every build for a CV field reaching a log call, and a second one runs a real extraction and
  checks the output for the content it fed in.
- **It leaves this machine only when you assert consent**, and only to the company you named.

The full notice is at [/privacy](https://hunterready.eduardoinerarte.dk/privacy).

---

## A worked example, start to finish

```bash
export HR_KEY=hr_live_...

# 1. Read a document. No consent header, so it never leaves our hardware.
curl -sS -X POST https://hunterready.eduardoinerarte.dk/v1/cv \
  -H "Authorization: Bearer $HR_KEY" \
  -F "file=@cv.pdf" > read.json

# 2. Look at what needs a human. These are the fields to put in front of your user.
jq '.provenance[] | select(.confidence < 0.7 or .inferred) | .path' read.json

# 3. Render whatever they corrected.
jq '.resume' read.json > resume.json
curl -sS -X POST https://hunterready.eduardoinerarte.dk/v1/render \
  -H "Authorization: Bearer $HR_KEY" \
  -H "Content-Type: application/json" \
  --data @resume.json -o cv.pdf

# 4. Prove it parses, the same way we do.
pdftotext cv.pdf - | head
```

Step 4 is not decoration. It is the entire claim this product makes, and you can check it yourself
on every file you generate.
