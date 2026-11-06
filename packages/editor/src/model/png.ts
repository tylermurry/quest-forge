// A tiny RGBA PNG writer with no dependencies (DOM-free), for the blank project's
// placeholder art (D87). Uses uncompressed deflate blocks: bigger files, no zlib.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const x of bytes) {
    a = (a + x) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** zlib stream of stored (uncompressed) deflate blocks. */
function zlibStored(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
  const view = new DataView(out.buffer);
  out[0] = 0x78;
  out[1] = 0x01;
  let o = 2;
  for (let i = 0; i < blocks; i++) {
    const chunk = data.subarray(i * 65535, (i + 1) * 65535);
    out[o] = i === blocks - 1 ? 1 : 0;
    view.setUint16(o + 1, chunk.length, true);
    view.setUint16(o + 3, ~chunk.length & 0xffff, true);
    out.set(chunk, o + 5);
    o += 5 + chunk.length;
  }
  view.setUint32(o, adler32(data));
  return out;
}

export type RGBA = [number, number, number, number];

export class Bitmap {
  readonly data: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }
  fill(x: number, y: number, w: number, h: number, c: RGBA) {
    for (let j = Math.max(0, y); j < Math.min(this.height, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.width, x + w); i++) this.data.set(c, (j * this.width + i) * 4);
    }
  }
  png(): Uint8Array {
    const raw = new Uint8Array((this.width * 4 + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      raw[y * (this.width * 4 + 1)] = 0; // filter: none
      raw.set(this.data.subarray(y * this.width * 4, (y + 1) * this.width * 4), y * (this.width * 4 + 1) + 1);
    }
    const chunk = (type: string, body: Uint8Array) => {
      const out = new Uint8Array(12 + body.length);
      const view = new DataView(out.buffer);
      view.setUint32(0, body.length);
      for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
      out.set(body, 8);
      view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
      return out;
    };
    const ihdr = new Uint8Array(13);
    const v = new DataView(ihdr.buffer);
    v.setUint32(0, this.width);
    v.setUint32(4, this.height);
    ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlibStored(raw)), chunk("IEND", new Uint8Array())];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}
