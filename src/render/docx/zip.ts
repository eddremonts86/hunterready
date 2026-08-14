/**
 * A minimal ZIP writer — enough to build a `.docx`, and nothing more.
 *
 * ## Why not a library
 *
 * A `.docx` is a ZIP of a handful of XML parts, and the reason to hand-write both halves is the
 * product's central guarantee. The ATS ruleset (docs/05-pdf-rendering.md) turns on what is *not* in the
 * document: no layout tables, no text boxes, no header region, one reading order. A document library
 * helps by emitting structure — and a helpful `<w:tbl>` around an experience block would break the
 * guarantee invisibly, in a file nobody reads by hand.
 *
 * This project has already made that trade once, writing a PDF content stream by hand for the
 * interleaved fixture rather than trusting a generator to produce the layout it needed. The round-trip
 * test is what makes it safe either way: whatever this emits is read back by an independent parser and
 * checked field by field.
 *
 * ## What it implements
 *
 * Store and deflate, no encryption, no ZIP64, no directory entries, UTF-8 names only. That is the whole
 * of what a `.docx` needs. Deliberately *not* general: a general ZIP writer here would be a second
 * library to maintain, in a file whose only consumer writes eight small XML parts.
 *
 * DOS timestamps are fixed rather than taken from the clock — see `DOS_TIME`.
 */
import { deflateRawSync } from 'node:zlib'

export interface ZipEntry {
  path: string
  data: string | Uint8Array
}

/**
 * A fixed 1980-01-01 timestamp in every entry.
 *
 * Two reasons, and the second is the one that matters. A ZIP's DOS timestamp field cannot represent a
 * timezone, so "now" is ambiguous anyway — and more importantly, rendering the same CV twice must
 * produce byte-identical output. A clock in here would make the round-trip test unable to distinguish
 * "the document changed" from "a second passed", and would defeat any future content-addressed cache.
 */
const DOS_TIME = 0
const DOS_DATE = 0x0021 // 1980-01-01

/** CRC-32, table built once. Required by the format; there is no way to omit it. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index++) {
    let value = index
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function bytesOf(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data
}

/** Little-endian writers. The format is little-endian throughout. */
function u16(value: number): Array<number> {
  return [value & 0xff, (value >>> 8) & 0xff]
}

function u32(value: number): Array<number> {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]
}

/**
 * Build the archive.
 *
 * Each entry is deflated unless that makes it bigger, which happens with the very short XML parts —
 * `.rels` is under 300 bytes and deflate adds a header to it. Storing those instead keeps the file
 * smaller and, more usefully, keeps them readable with `unzip -p` when something needs debugging by eye.
 */
export function zipSync(entries: Array<ZipEntry>): Uint8Array {
  const local: Array<number> = []
  const central: Array<number> = []
  let offset = 0

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.path)
    const raw = bytesOf(entry.data)
    const crc = crc32(raw)

    const deflated = deflateRawSync(raw)
    const useDeflate = deflated.length < raw.length
    const stored = useDeflate ? new Uint8Array(deflated) : raw
    const method = useDeflate ? 8 : 0

    const header = [
      ...u32(0x04034b50), // local file header signature
      ...u16(20), // version needed: 2.0
      ...u16(0x0800), // flags: bit 11, names are UTF-8
      ...u16(method),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(stored.length),
      ...u32(raw.length),
      ...u16(name.length),
      ...u16(0), // no extra field
    ]

    local.push(...header, ...name, ...stored)

    central.push(
      ...u32(0x02014b50), // central directory header signature
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0x0800),
      ...u16(method),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(stored.length),
      ...u32(raw.length),
      ...u16(name.length),
      ...u16(0), // extra
      ...u16(0), // comment
      ...u16(0), // disk number
      ...u16(0), // internal attributes
      ...u32(0), // external attributes
      ...u32(offset),
      ...name,
    )

    offset += header.length + name.length + stored.length
  }

  const end = [
    ...u32(0x06054b50), // end of central directory
    ...u16(0), // this disk
    ...u16(0), // disk with central directory
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(central.length),
    ...u32(offset),
    ...u16(0), // comment length
  ]

  return new Uint8Array([...local, ...central, ...end])
}
