/**
 * Legacy binary `.doc` (OLE2) → DOCX → the docx adapter.
 *
 * There is no usable pure-JS parser for the OLE2/Word 97 format, so we convert with LibreOffice
 * headless (ADR-008). Edd's instruction is explicit and correct: **this dependency lives in the
 * Docker image, never on a developer's machine**, so behaviour is identical locally and on the
 * VPS. The image installs `libreoffice-core` + `libreoffice-writer`; see the Dockerfile.
 *
 * Why bother: a large share of the general working population — our actual audience — has their
 * CV as a `.doc` on an old laptop. Rejecting it is rejecting them.
 *
 * Safety notes, because this hands an untrusted file to a large C++ application:
 *   • hard timeout, then the process is killed
 *   • a private per-request profile dir, so concurrent conversions cannot collide
 *   • everything removed in a `finally`, success or failure
 *   • no shell: `spawn` with an argument array
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RawDocument } from '../types'
import { extractDocx } from './docx'

const TIMEOUT_MS = 20_000

/** Overridable so the container can pin a path; `soffice` is on PATH in our image. */
const SOFFICE = process.env.SOFFICE_BIN ?? 'soffice'

export class DocConversionError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message)
    this.name = 'DocConversionError'
  }
}

function runSoffice(
  args: Array<string>,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(SOFFICE, args, { stdio: 'pipe', env })
    let output = ''
    let settled = false

    const timer = setTimeout(() => {
      settled = true
      child.kill('SIGKILL')
      reject(
        new DocConversionError(
          `soffice timed out after ${TIMEOUT_MS}ms`,
          'That .doc file took too long to open. Saving it as .docx or PDF in Word will work.',
        ),
      )
    }, TIMEOUT_MS)

    child.stdout.on('data', (c: Buffer) => (output += c.toString()))
    child.stderr.on('data', (c: Buffer) => (output += c.toString()))

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(
        new DocConversionError(
          `soffice not runnable: ${error.message}`,
          // This is an operator error, not the user's: the image is supposed to ship LibreOffice.
          'We cannot read old .doc files right now. Please save yours as .docx or PDF and try again.',
        ),
      )
    })

    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new DocConversionError(
          `soffice exited ${code}: ${output}`,
          'We could not open that .doc file. Saving it as .docx or PDF in Word usually fixes it.',
        ),
      )
    })
  })
}

export async function extractDoc(bytes: Uint8Array): Promise<RawDocument> {
  const workDir = await mkdtemp(join(tmpdir(), 'hr-doc-'))
  const profileDir = join(workDir, 'profile')
  const input = join(workDir, 'input.doc')

  try {
    await writeFile(input, bytes)

    await runSoffice(
      [
        '--headless',
        '--norestore',
        '--nolockcheck',
        // A private profile per request. Without it, concurrent conversions fight over
        // ~/.config/libreoffice and one of them silently produces nothing.
        `-env:UserInstallation=file://${profileDir}`,
        '--convert-to',
        'docx:MS Word 2007 XML',
        '--outdir',
        workDir,
        input,
      ],
      { ...process.env, HOME: workDir },
    )

    const converted = await readFile(join(workDir, 'input.docx')).catch(() => {
      throw new DocConversionError(
        'soffice reported success but produced no .docx',
        'We could not read that .doc file. Saving it as .docx or PDF in Word usually fixes it.',
      )
    })

    const result = await extractDocx(converted)

    return {
      ...result,
      format: 'doc',
      warnings: [
        ...result.warnings,
        // Honest: conversion is lossy, and the user should look twice rather than trust us.
        'This is an older .doc file, so we converted it first. Formatting details can shift — please check the dates and job titles.',
      ],
    }
  } finally {
    // Always, on every path. LibreOffice leaves a profile directory behind otherwise.
    await rm(workDir, { recursive: true, force: true })
  }
}
