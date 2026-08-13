# 07 — Privacy and Compliance

A CV is a dense packet of personal data: full name, home address, phone, email,
employment history, education, sometimes photo, date of birth, nationality, marital
status and gender (still common in DE/ES/EE CV conventions). Under GDPR this is
personal data end to end, and photo + nationality edge toward special categories.

Operating from the EU, this is a requirement to design for, not a page to write later.

## Principle: process, do not keep

**v0.1 stores nothing.** The file is parsed in memory, the structured result is
returned to the browser, the buffer is dropped. No database, no S3, no CV content
in logs. Temp files (only the LibreOffice `.doc` path needs one) are written to a
per-request scratch dir and removed in a `finally` block.

This is both the cheapest compliance posture and a genuine selling point:
_"we never store your CV"_ is a claim competitors cannot make.

## The LLM boundary

Extraction sends CV text to a third-party model provider. That is a transfer of
personal data to a processor and it needs to be handled openly:

- **Explicit consent before the first call**, naming the provider — not buried in
  a ToS checkbox. One clear sentence on the upload screen.
- **Zero-retention API terms.** Confirm the Anthropic API commercial terms cover
  no-training-on-inputs and configure zero-retention where available. Record the
  outcome in [09-decisions.md](09-decisions.md).
- **Data minimization:** strip what the model does not need. Phone and street
  address contribute nothing to extraction quality — extract them with regex
  locally and redact them from the LLM payload. Cheap, measurable, and it shrinks
  the transfer to the minimum.
- Document the provider in a privacy notice with the legal basis (consent).

## When persistence arrives (v0.5)

Ships in the same release, no exceptions:

1. Encryption at rest; CV blobs separate from account records.
2. Default retention 90 days of inactivity, then hard delete. Configurable down.
3. Self-service export (JSON + PDF) and self-service delete-everything — GDPR
   Articles 15 and 17 satisfied by a button, not a support email.
4. Deletion is real: purge from backups within the documented window, and say what
   that window is.
5. An audit log of access to CV records — metadata only, never content.

## Not in scope, deliberately

- No analytics on CV content. No aggregate "skills trends" dataset. The moment CV
  content becomes a data asset, this becomes a different company with a different
  risk profile.
- No selling, sharing or enriching candidate data. Ever.
- No third-party trackers on pages that handle CV data. Self-hosted, cookie-free
  analytics (Plausible/Umami) or nothing.

## Security basics for v0.1

- File type validated by magic bytes, not extension. 10 MB / 20 page hard caps.
- PDF parsing runs on untrusted input: pin `unpdf`/`pdfjs`, keep them patched, and
  treat a parser crash as an expected event with a clean error path.
- No SSRF surface: the renderer must not fetch remote images or fonts at request
  time. Fonts are bundled; `PdfImage` sources are limited to user uploads.
- Rate limit `/api/ingest` by IP. LLM calls on unauthenticated endpoints are a
  direct cost-abuse vector.
- Signed, short-TTL session blobs if the parsed resume must round-trip via the server.

## Copy that must exist before launch

- Privacy notice: what is processed, by whom, on what basis, for how long.
- The one-sentence consent line on the upload screen.
- A visible "we do not store your CV" statement on the landing page — which stays
  true only as long as v0.1's stateless design holds. If that changes, the copy
  changes in the same PR.
