/**
 * The `/v1` contract as an OpenAPI 3.0 document, built from the schemas the runtime validates against.
 *
 * ## Why this exists rather than a second hand-written description
 *
 * `docs/api/README.md` is 286 lines of good prose and it is a **second** description of
 * `src/routes/v1/`. Nothing tied the two together. This repository has a specific history with that
 * shape: four features shipped as schema plus documentation with no code on either end; the routing
 * table in docs/06 named Anthropic models this deployment does not use; plan 04 carried three
 * acceptance criteria naming a field that reported something else; and `provenance` was optional in a
 * JSON Schema whose own prose asked the model to fill it.
 *
 * Every one of those was a description that was true when it was written.
 *
 * So the parts a machine can check come from the code. `Resume` and `FieldProvenance` are converted
 * with `z.toJSONSchema`, the same call `extract.ts` and the four `optimize/*` modules already use for
 * their tool contracts — which is ADR-001's argument applied one layer out: **the published contract
 * and the runtime validator cannot drift, because they are the same object.**
 *
 * ## What is still written by hand, and what stops it rotting
 *
 * Paths, methods, status codes and prose. TanStack's file router has no metadata to introspect, so
 * there is nothing to generate them from.
 *
 * `openapi.test.ts` therefore reads `src/routes/v1/` off disk and fails when a route exists that this
 * document does not describe. That is the drift that actually happens — somebody adds an endpoint —
 * and it is the one a generator would have caught. A description of a route nobody can reach, or a
 * route nobody documented, both go red.
 *
 * ## Why 3.0 and not 3.1
 *
 * `z.toJSONSchema` takes `target: 'openapi-3.0'`, which emits the dialect OpenAPI 3.0 accepts —
 * `nullable: true` rather than `type: [..., 'null']`, and no `$schema`. 3.1 is the better spec and
 * the renderers are more even-handed about 3.0; when that stops being true this is one constant.
 */
import { z } from 'zod'

import { FieldProvenance } from '@/schema/provenance'
import { Resume } from '@/schema/resume'

/** Bumped when the shape of the *document* changes, never when an endpoint does. */
const OPENAPI_VERSION = '3.0.3'

/**
 * The schemas that come from code, converted once.
 *
 * ## `io: 'input'`, and the obvious choice was the wrong one
 *
 * `'output'` is what this ought to be — an OpenAPI document mostly describes what an API *returns*,
 * which is the resolved shape with defaults applied. It was written that way first and the route
 * answered **500**:
 *
 * ```
 * Error: Transforms cannot be represented in JSON Schema
 * ```
 *
 * `LinkTarget` in `src/schema/resume.ts` ends in a `.transform()` that turns `www.example.com` into a
 * URL. Zod can describe the string going in; it cannot describe whatever the function returns, so the
 * output side of that pipe has no JSON Schema at all. That is a property of the contract, not a
 * limitation to work around: the transform exists precisely because what a person types and what the
 * document stores are different things.
 *
 * `'input'` is also the direction that matters more here. `Resume` travels **into** `/v1/render`,
 * `/v1/rewrite`, `/v1/target`, `/v1/translate` and `/v1/cover-letter`, and out of only `/v1/cv`. The
 * cost is that a defaulted field reads as optional in the response, which understates the guarantee
 * rather than overstating it — the safe direction for a document to be imprecise in.
 *
 * ⚠️ Caught by requesting the route on a real build, not by `tsc`, which was perfectly happy. ADR-005
 * again, in a new place.
 */
function schemasFromCode(): Record<string, unknown> {
  const options = {
    target: 'openapi-3.0',
    io: 'input',
    reused: 'inline',
  } as const
  return {
    Resume: z.toJSONSchema(Resume, options),
    FieldProvenance: z.toJSONSchema(FieldProvenance, options),
  }
}

/** `{ $ref: '#/components/schemas/Resume' }`, spelled once. */
function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` }
}

function json(schema: unknown) {
  return { 'application/json': { schema } }
}

/**
 * Every error in this API has the same three keys, and `requestId` is the point of it.
 *
 * Our logs deliberately contain no CV content (docs/07), so when an integration reports a failure the
 * request id is the only thread back to what happened. Declaring it here rather than per endpoint is
 * what makes it uniform.
 */
const ERROR_SCHEMA = {
  type: 'object',
  required: ['error', 'message', 'requestId'],
  properties: {
    error: { type: 'string', description: 'A stable machine-readable code.' },
    message: {
      type: 'string',
      description: 'A sentence for a person. Never quotes the document.',
    },
    requestId: {
      type: 'string',
      description:
        'Quote this when reporting a problem. It is the only thread back: our logs carry no CV content.',
    },
  },
} as const

function errorResponse(description: string) {
  return { description, content: json(ref('Error')) }
}

/** The refusals every `/v1` endpoint can produce, so no endpoint has to restate them. */
const COMMON_ERRORS = {
  '401': errorResponse(
    'No live key. One shape for every reason — missing, malformed, unknown, revoked — because distinguishing them would tell somebody holding a stolen key whether it was ever real.',
  ),
  '429': errorResponse(
    'Twelve requests per ten minutes, per key, per endpoint. `Retry-After` is set.',
  ),
}

/**
 * The consent header, as a parameter rather than prose, because it is the one thing about this API
 * that is not like other APIs (ADR-032).
 */
const CONSENT_PARAM = {
  name: 'X-HunterReady-Consent',
  in: 'header',
  required: false,
  description:
    "The company the **person whose CV this is** consented to. Send it only if you hold that record; a key is not a standing permission to send anybody's CV anywhere. Omit it and the document is read on our own hardware and does not leave. Anything unrecognised is treated as no consent.",
  schema: { type: 'string', enum: ['minimax', 'deepseek', 'local'] },
} as const

/** `/v1/render`'s query string. The last four are paid and refused without a plan. */
const RENDER_QUERY = [
  {
    name: 'template',
    in: 'query',
    description: 'The layout. Omit for the default.',
    schema: { type: 'string' },
  },
  {
    name: 'theme',
    in: 'query',
    description: 'The voice: type, ink, spacing. Omit for the default.',
    schema: { type: 'string' },
  },
  {
    name: 'bodyFont',
    in: 'query',
    description: 'Override the body typeface. Paid.',
    schema: { type: 'string' },
  },
  {
    name: 'headingFont',
    in: 'query',
    description: 'Override the heading typeface. Paid.',
    schema: { type: 'string' },
  },
  {
    name: 'accent',
    in: 'query',
    description:
      'Paid, and refused when it would be unreadable against the paper. Hex only — the renderer rejects `oklch` (ADR-003).',
    schema: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  },
  {
    name: 'paper',
    in: 'query',
    description: 'Paid. Hex only.',
    schema: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  },
] as const

/** A body that is a `resume` plus whatever else that endpoint needs. */
function resumeBody(
  extra: Record<string, unknown> = {},
  required: Array<string> = [],
) {
  return {
    required: true,
    content: json({
      type: 'object',
      required: ['resume', ...required],
      properties: { resume: ref('Resume'), ...extra },
    }),
  }
}

const PDF_RESPONSE = {
  description: 'The PDF.',
  content: {
    'application/pdf': { schema: { type: 'string', format: 'binary' } },
  },
}

export function openApiDocument(baseUrl: string): Record<string, unknown> {
  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: 'HunterReady',
      version: 'v1',
      summary:
        'Read a CV into structured fields; render structured fields into a PDF that automated screening can parse.',
      description: [
        'Two endpoints carry the product: `/v1/cv` turns a document into fields, and `/v1/render` turns fields back into a PDF. Everything else operates on the object the first one produces.',
        '',
        '**The unversioned `/api/*` routes are not a contract.** They are what the browser client talks to and they change when the interface changes. Breaking changes here get a new version prefix, never a silent edit to `v1`.',
        '',
        '**Nothing this API returns will invent anything.** Not a number, not an employer, not a date, not an outcome the document did not already contain. That is enforced in code rather than asked for in a prompt — `/v1/target` returns refused claims in `invented[]` rather than passing them off as suggestions.',
        '',
        '**Beta.** Everything here works and some of it will change.',
      ].join('\n'),
      contact: { name: 'Edd Inerarte' },
    },
    servers: [{ url: baseUrl, description: 'This deployment.' }],
    tags: [
      {
        name: 'Document',
        description: 'A file in, structured fields out — and back again.',
      },
      {
        name: 'Writing',
        description:
          'Operations on a resume object, all of which read the consent header.',
      },
      { name: 'Account', description: 'What this key may do.' },
    ],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: [
            'Every `/v1` request needs a key: `Authorization: Bearer hr_live_…`',
            '',
            '**A key is shown once.** It is stored as a hash and cannot be read back — not by support, not from a database dump. Revocation takes effect on the very next call; there is no cache to wait out.',
            '',
            'The `hr_live_` prefix makes a leaked key greppable in your logs and recognisable in a paste. Treat it like a password: an environment variable, never a repository, and never a client-side bundle. **A key in a browser is a key anybody can read.**',
          ].join('\n'),
        },
      },
      schemas: { ...schemasFromCode(), Error: ERROR_SCHEMA },
    },
    paths: {
      '/v1/cv': {
        post: {
          tags: ['Document'],
          operationId: 'readCv',
          summary: 'A document in, structured fields out',
          description: [
            'The format is detected from the bytes, not the filename, so a `.docx` renamed `.pdf` still works. Accepts `.pdf` `.docx` `.doc` `.txt` `.md` and a photograph of a printed page. Maximum 10 MB.',
            '',
            '**`provenance` is the interesting part of the response.** `confidence` below `0.7` and `inferred: true` mark the fields worth putting in front of a person first, and `scanned: true` or `method: "rules"` means the whole document deserves that treatment. Presenting extraction as finished when it is not is the failure this product exists to avoid, and the data to avoid it is in the response.',
            '',
            '⚠️ **Reading a CV is seconds on the third-party model and can be a minute or more on ours.** Do not put this on a request a person is waiting behind.',
          ].join('\n'),
          parameters: [CONSENT_PARAM],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: {
                      type: 'string',
                      format: 'binary',
                      description: 'The document.',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'The document as fields.',
              content: json({
                type: 'object',
                required: [
                  'resume',
                  'provenance',
                  'method',
                  'scanned',
                  'requestId',
                ],
                properties: {
                  resume: ref('Resume'),
                  provenance: {
                    type: 'array',
                    items: ref('FieldProvenance'),
                    description:
                      'Where each field came from. Paths are dotted with numeric indices — `work.0.company`, never `work[0].company` — and the same string whichever model read the document.',
                  },
                  method: {
                    type: 'string',
                    enum: ['llm', 'local', 'rules'],
                    description:
                      '`llm` a third-party model, `local` our own hardware, `rules` the deterministic floor. Assert consent and read back `local` and the account behind your key is not entitled to the larger model.',
                  },
                  scanned: {
                    type: 'boolean',
                    description:
                      'The text came off an image. Have a person check every field, not only the uncertain ones.',
                  },
                  requestId: { type: 'string' },
                },
              }),
            },
            '400': errorResponse('`no_file` — no `file` field in the form.'),
            '413': errorResponse('`too_large` — over 10 MB.'),
            '415': errorResponse(
              '`unknown_type` · `legacy_office_unsupported` · `empty` · `rtf_unsupported` · `archive_unsupported` — we cannot read that file.',
            ),
            '502': errorResponse(
              '`llm_failed` · `invalid_output` · `not_configured`.',
            ),
            ...COMMON_ERRORS,
          },
        },
      },
      '/v1/render': {
        post: {
          tags: ['Document'],
          operationId: 'renderResume',
          summary: 'Structured fields in, a PDF out',
          description: [
            'The `resume` object exactly as `/v1/cv` returned it — corrected by your user if they corrected it.',
            '',
            'Every layout is rendered, read back with an independent parser, and checked field by field in reading order on every build. A design that loses a field does not ship. That check is the product.',
          ].join('\n'),
          parameters: [...RENDER_QUERY],
          requestBody: {
            required: true,
            description: 'The resume object itself, not wrapped.',
            content: json(ref('Resume')),
          },
          responses: {
            '200': PDF_RESPONSE,
            '402': errorResponse(
              '`design_locked` · `axes_locked` — that design or override needs a paid plan.',
            ),
            '422': errorResponse(
              "`invalid_resume`. **It never lists which fields were wrong**: a validation issue quotes the value it rejected, and that value is somebody's CV travelling in a response body. Compare against the `Resume` schema instead.",
            ),
            '500': errorResponse('`render_failed`.'),
            ...COMMON_ERRORS,
          },
        },
      },
      '/v1/rewrite': {
        post: {
          tags: ['Writing'],
          operationId: 'rewriteBullets',
          summary: 'Suggestions for the lines under each job',
          description:
            'Send one job per request when a person is watching: a whole CV is a lot of model calls in one wait. `only` narrows it to specific lines.',
          parameters: [CONSENT_PARAM],
          requestBody: resumeBody({
            only: {
              type: 'array',
              description:
                'Restrict to these lines. Omit for the whole document.',
              items: {
                type: 'object',
                required: ['workIndex', 'highlightIndex'],
                properties: {
                  workIndex: { type: 'integer', minimum: 0 },
                  highlightIndex: { type: 'integer', minimum: 0 },
                },
              },
            },
            answers: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Answers to questions a previous pass asked, so a suggestion can use a fact the CV lacked.',
            },
          }),
          responses: {
            '200': {
              description:
                'One entry per line the pass could say something about.',
              content: json({
                type: 'object',
                required: ['rewrites'],
                properties: {
                  rewrites: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        workIndex: { type: 'integer' },
                        highlightIndex: { type: 'integer' },
                        original: { type: 'string' },
                        suggestion: { type: 'string' },
                        rationale: { type: 'string' },
                      },
                    },
                  },
                  requestId: { type: 'string' },
                },
              }),
            },
            '422': errorResponse('`invalid_resume`.'),
            '502': errorResponse('The model did not produce a usable answer.'),
            ...COMMON_ERRORS,
          },
        },
      },
      '/v1/target': {
        post: {
          tags: ['Writing'],
          operationId: 'targetAdvert',
          summary: 'Read a job advert against a CV',
          description:
            '**Read `invented[]`.** It lists claims the model produced that are not in the document — refused rather than returned as suggestions. Nothing here will add a number, an employer, a date or an outcome the CV did not already contain.',
          parameters: [CONSENT_PARAM],
          requestBody: resumeBody(
            {
              advert: {
                type: 'string',
                description:
                  'The advert text. Paste the part that lists what they are looking for.',
              },
            },
            ['advert'],
          ),
          responses: {
            '200': {
              description: 'What the advert asks for, and what was refused.',
              content: json({
                type: 'object',
                properties: {
                  source: { type: 'string', enum: ['model', 'rules'] },
                  roleTitle: { type: 'string' },
                  company: { type: 'string' },
                  requirements: {
                    type: 'object',
                    properties: {
                      hardSkills: { type: 'array', items: { type: 'string' } },
                      softSkills: { type: 'array', items: { type: 'string' } },
                      responsibilities: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      keywords: { type: 'array', items: { type: 'string' } },
                    },
                  },
                  invented: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'Claims the model produced that the CV does not support. Refused, and listed so you can see what was refused.',
                  },
                  requestId: { type: 'string' },
                },
              }),
            },
            '400': errorResponse('`advert_too_short`.'),
            '413': errorResponse(
              '`advert_too_long` — that is longer than an advert.',
            ),
            '422': errorResponse('`invalid_resume`.'),
            ...COMMON_ERRORS,
          },
        },
      },
      '/v1/cover-letter': {
        post: {
          tags: ['Writing'],
          operationId: 'draftCoverLetter',
          summary: 'A draft letter for one advert',
          parameters: [CONSENT_PARAM],
          requestBody: resumeBody(
            {
              advert: { type: 'string' },
              requirements: {
                type: 'object',
                description:
                  'The object `/v1/target` returned, to save reading the advert twice.',
              },
            },
            ['advert'],
          ),
          responses: {
            '200': {
              description: 'The draft.',
              content: json({ type: 'object' }),
            },
            '422': errorResponse('`invalid_resume`.'),
            ...COMMON_ERRORS,
          },
        },
      },
      '/v1/translate': {
        post: {
          tags: ['Writing'],
          operationId: 'translateResume',
          summary: 'The whole document in another language',
          parameters: [CONSENT_PARAM],
          requestBody: resumeBody(
            { target: { type: 'string', enum: ['en', 'es', 'da'] } },
            ['target'],
          ),
          responses: {
            '200': {
              description: 'The translated resume.',
              content: json({
                type: 'object',
                properties: {
                  resume: ref('Resume'),
                  requestId: { type: 'string' },
                },
              }),
            },
            '422': errorResponse(
              '`invalid_resume`, or a target language that is not offered.',
            ),
            ...COMMON_ERRORS,
          },
        },
      },
      '/v1/render-letter': {
        post: {
          tags: ['Writing'],
          operationId: 'renderLetter',
          summary: 'A letter in, a PDF out',
          requestBody: { required: true, content: json({ type: 'object' }) },
          responses: {
            '200': PDF_RESPONSE,
            '422': errorResponse('That letter could not be read.'),
            ...COMMON_ERRORS,
          },
        },
      },
      '/v1/capabilities': {
        get: {
          tags: ['Account'],
          operationId: 'capabilities',
          summary: 'What this key may do, before it tries',
          description:
            "A machine cannot read a consent gate or see a locked design card. Without this it discovers its limits through a `402` in the middle of a user's flow, which is the worst moment and the least informative signal. **It says nothing about the account behind the key** beyond the capabilities themselves.",
          responses: {
            '200': {
              description:
                'The three questions a client would otherwise guess at.',
              content: json({
                type: 'object',
                properties: {
                  providers: {
                    type: 'array',
                    description:
                      'Companies this key may name in the consent header. **Empty means the third-party model is unreachable for this key** and every CV is read here whatever header you send.',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                      },
                    },
                  },
                  paidDesigns: {
                    type: 'boolean',
                    description:
                      'Whether `/v1/render` will accept a paid design or a custom typeface and colour.',
                  },
                  encryptsAtRest: {
                    type: 'boolean',
                    description:
                      'Stored CV content is encrypted. Nothing posted to `/v1/cv` is stored at all.',
                  },
                  rateLimit: {
                    type: 'object',
                    properties: {
                      requests: { type: 'integer' },
                      windowMinutes: { type: 'integer' },
                    },
                  },
                  version: { type: 'string' },
                },
              }),
            },
            ...COMMON_ERRORS,
          },
        },
      },
    },
  }
}
