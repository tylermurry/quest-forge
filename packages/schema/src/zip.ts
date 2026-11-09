// A minimal zip reader and writer for `.quest` files (D153). No dependencies (the
// engine ships nothing but the schema, D30): entries are stored or raw-deflated
// through the platform's CompressionStream, which browsers and Node both have.

export interface ZipEntry {
  /** Path inside the archive, `/` separated. */
  name: string;
  data: Uint8Array;
  /** Deflate it (text); otherwise stored as is (images and audio are already compressed). */
  compress?: boolean;
}

export class ZipError extends Error {}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function through(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const utf8 = new TextEncoder();
// A fixed date (1980-01-01) so the same project always builds the same bytes.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const UTF8_FLAG = 0x0800;

/** Builds a zip archive. Entry order is kept. */
export async function writeZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const names = new Set<string>();
  for (const e of entries) {
    if (names.has(e.name)) throw new ZipError(`"${e.name}" is in the archive twice`);
    names.add(e.name);
    const name = utf8.encode(e.name);
    const method = e.compress ? 8 : 0;
    const body = e.compress ? await through(e.data, new CompressionStream("deflate-raw")) : e.data;
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, UTF8_FLAG, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const head = new Uint8Array(46 + name.length);
    const cv = new DataView(head.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    head.set(name, 46);
    chunks.push(local, body);
    central.push(head);
    offset += local.length + body.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Reads a zip archive (stored or deflated entries) into name → bytes. Throws ZipError if it isn't one. */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError("isn't a zip archive");
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new ZipError("is damaged (bad directory)");
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw new ZipError(`is damaged (bad entry "${name}")`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const body = bytes.subarray(start, start + size);
    if (body.length !== size) throw new ZipError(`is damaged ("${name}" is cut short)`);
    let data: Uint8Array;
    if (method === 0) data = body.slice();
    else if (method === 8) data = await through(body, new DecompressionStream("deflate-raw"));
    else throw new ZipError(`uses an unsupported compression for "${name}"`);
    if (crc32(data) !== crc) throw new ZipError(`is damaged ("${name}" doesn't match its checksum)`);
    out.set(name, data);
  }
  return out;
}
