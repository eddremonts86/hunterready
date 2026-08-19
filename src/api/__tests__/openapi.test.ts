/**
 * The published contract, and the one kind of drift a generator would have caught.
 *
 * `src/api/openapi.ts` takes `Resume` and `FieldProvenance` from the Zod schemas, so those cannot
 * disagree with the runtime. **Paths, methods and status codes are written by hand**, because
 * TanStack's file router has no metadata to introspect — and hand-written route lists are exactly
 * what this repository keeps getting wrong. Four features shipped as documentation with no code; a
 * routing table naming models this deployment does not use; three acceptance criteria naming a field
 * that reported something else.
 *
 * So the list is checked against the directory. Adding `src/routes/v1/thing.tsx` without describing
 * it goes red, and describing a route nobody can reach goes red too.
 */
import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { openApiDocument } from '../openapi'

const BASE = 'https://hunterready.example'
const doc = openApiDocument(BASE) as {
  openapi: string
  info: Record<string, unknown>
  servers: Array<{ url: string }>
  security: Array<Record<string, unknown>>
  components: {
    schemas: Record<string, unknown>
    securitySchemes: Record<string, unknown>
  }
  paths: Record<
    string,
    Record<string, { operationId?: string; responses: Record<string, unknown> }>
  >
}

/**
 * The routes on disk, as URLs.
 *
 * `openapi[.]json` is the document itself and describes the others, not itself — a self-reference
 * that adds nothing a reader could act on.
 */
function routesOnDisk(): Array<string> {
  return readdirSync('src/routes/v1')
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => name.replace(/\.tsx$/, ''))
    .filter((name) => name !== 'openapi[.]json')
    .map((name) => `/v1/${name}`)
    .sort()
}

describe('every /v1 route is described', () => {
  it('describes exactly the routes that exist, no more and no fewer', () => {
    const described = Object.keys(doc.paths).sort()
    /*
      Both directions in one assertion on purpose. A missing route is a partner reading a contract
      that understates the API; an extra one is a partner writing an integration against an endpoint
      that answers 404. The second is worse and it is the one a "did I document it?" check misses.
    */
    expect(described).toEqual(routesOnDisk())
  })

  it('gives every operation an id, so a generated client has names', () => {
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(
          operation.operationId,
          `${method.toUpperCase()} ${path}`,
        ).toMatch(/^[a-z][A-Za-z]+$/)
      }
    }
  })

  it('says what every operation returns when the key is wrong or the bucket is empty', () => {
    /*
      401 and 429 apply to every endpoint — `enterV1` is one door and it can refuse for either
      reason. A contract that omits them describes a happy path.
    */
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        const where = `${method.toUpperCase()} ${path}`
        expect(Object.keys(operation.responses), where).toContain('401')
        expect(Object.keys(operation.responses), where).toContain('429')
        expect(Object.keys(operation.responses), where).toContain('200')
      }
    }
  })
})

describe('the document itself', () => {
  it('is OpenAPI 3.0 with the server it was served from', () => {
    expect(doc.openapi).toMatch(/^3\.0\./)
    expect(doc.servers[0]?.url).toBe(BASE)
  })

  it('requires the bearer key globally rather than per endpoint', () => {
    // One door, said once. A per-endpoint list is a place to forget one.
    expect(doc.security).toEqual([{ bearerAuth: [] }])
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })
  })

  it('carries the Resume shape from the schema rather than a copy of it', () => {
    const resume = doc.components.schemas.Resume as {
      type?: string
      properties?: Record<string, unknown>
    }
    expect(resume.type).toBe('object')
    /*
      Named fields rather than a snapshot. A snapshot of a 7 KB schema fails on every legitimate
      change and teaches people to re-record it, which is the opposite of a guard. These four exist
      because `src/schema/resume.ts` is the contract (CLAUDE.md) and their disappearance would be a
      breaking change somebody has to notice.
    */
    for (const field of ['basics', 'work', 'education', 'skills']) {
      expect(Object.keys(resume.properties ?? {}), field).toContain(field)
    }
  })

  it('is JSON, all the way down', () => {
    /*
      `z.toJSONSchema` can emit values a `JSON.stringify` round-trip changes, and the route serves
      this through `Response.json`. Asserting the round-trip is identical is cheaper than finding out
      from a renderer that silently dropped a branch.
    */
    const round = JSON.parse(JSON.stringify(doc)) as unknown
    expect(round).toEqual(doc)
  })

  it('names the consent header wherever a CV can leave', () => {
    /*
      ADR-032's whole point: a machine cannot consent for a person. Every endpoint that reads a CV
      has to show the header that carries somebody's answer, or an integration will never learn it
      exists and every document will quietly stay local.
    */
    for (const path of [
      '/v1/cv',
      '/v1/rewrite',
      '/v1/target',
      '/v1/translate',
      '/v1/cover-letter',
    ]) {
      const parameters = (
        doc.paths[path]?.post as unknown as {
          parameters?: Array<{ name: string }>
        }
      )?.parameters
      expect(
        (parameters ?? []).map((p) => p.name),
        `${path} does not mention the consent header`,
      ).toContain('X-HunterReady-Consent')
    }
  })
})
