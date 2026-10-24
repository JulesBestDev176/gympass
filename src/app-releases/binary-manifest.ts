const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;

/** Bound the *expanded* parser allocations, not just the compressed/uncompressed ZIP entry.
 * In particular, repeated string offsets would otherwise decode the same large string
 * thousands of times. Reject layouts the downstream parser does not interpret safely.
 */
export function validateBinaryManifest(data: Buffer): void {
  const invalid = (reason: string): never => { throw new Error(reason); };
  if (data.length < 8 || data.length > MAX_MANIFEST_BYTES || data.readUInt16LE(0) !== 3 || data.readUInt16LE(2) !== 8 || data.readUInt32LE(4) !== data.length) invalid('Invalid binary manifest');
  let pools = 0, strings = 0, expandedBytes = 0, nodes = 0, attributes = 0, chunks = 0, roots = 0;
  const stack: Array<[number, number]> = [];
  for (let offset = 8; offset < data.length;) {
    if (++chunks > 65536 || offset + 8 > data.length) invalid('Invalid XML chunks');
    const type = data.readUInt16LE(offset), header = data.readUInt16LE(offset + 2), size = data.readUInt32LE(offset + 4), end = offset + size;
    if (header < 8 || size < header || end > data.length) invalid('Invalid XML chunk');
    if (type === 1) {
      if (++pools !== 1 || header !== 28 || size < 28 || nodes) invalid('Invalid string pool');
      strings = data.readUInt32LE(offset + 8);
      const styles = data.readUInt32LE(offset + 12), flags = data.readUInt32LE(offset + 16);
      const stringStart = data.readUInt32LE(offset + 20), styleStart = data.readUInt32LE(offset + 24);
      const tableEnd = 28 + 4 * (strings + styles);
      if (strings > 16384 || styles > strings || tableEnd > size || stringStart < tableEnd || stringStart > size || (styles && (!styleStart || styleStart < stringStart || styleStart > size)) || (!styles && styleStart)) invalid('Invalid string pool bounds');
      const stringsEnd = offset + (styleStart || size);
      for (let index = 0; index < strings; index++) {
        const relative = data.readUInt32LE(offset + 28 + index * 4);
        let cursor = offset + stringStart + relative;
        if (cursor < offset + stringStart || cursor >= stringsEnd) invalid('String offset outside pool');
        const length8 = () => {
          if (cursor >= stringsEnd) invalid('Invalid UTF8 length');
          const first = data[cursor++];
          if (!(first & 0x80)) return first;
          if (cursor >= stringsEnd) invalid('Invalid UTF8 length');
          return ((first & 0x7f) << 8) | data[cursor++];
        };
        const length16 = () => {
          if (cursor + 2 > stringsEnd) invalid('Invalid UTF16 length');
          const first = data.readUInt16LE(cursor); cursor += 2;
          if (!(first & 0x8000)) return first;
          if (cursor + 2 > stringsEnd) invalid('Invalid UTF16 length');
          const second = data.readUInt16LE(cursor); cursor += 2;
          return (first & 0x7fff) * 65536 + second;
        };
        const utf8 = Boolean(flags & 256), units = utf8 ? length8() : length16(), bytes = utf8 ? length8() : units * 2;
        if (units > 65535 || bytes > 196605 || cursor + bytes + (utf8 ? 1 : 2) > stringsEnd) invalid('Invalid string length');
        expandedBytes += Math.max(units * 2, bytes * 2);
        if (expandedBytes > MAX_MANIFEST_BYTES) invalid('String expansion budget exceeded');
        if (utf8 ? data[cursor + bytes] !== 0 : data.readUInt16LE(cursor + bytes) !== 0) invalid('Unterminated string');
      }
      let spans = 0;
      for (let index = 0; index < styles; index++) {
        const relative = data.readUInt32LE(offset + 28 + strings * 4 + index * 4);
        if (relative === 0xffffffff) continue;
        let cursor = offset + styleStart + relative;
        if (cursor < offset + styleStart || cursor + 4 > end || relative % 4) invalid('Invalid style offset');
        while (true) {
          if (++spans > 65536 || cursor + 4 > end) invalid('Invalid style spans');
          const name = data.readUInt32LE(cursor);
          if (name === 0xffffffff) break;
          if (name >= strings || cursor + 12 > end) invalid('Invalid style span');
          cursor += 12;
        }
      }
    } else if (type === 0x180) {
      if (!pools || header !== 8 || (size - 8) % 4 || (size - 8) / 4 > strings) invalid('Invalid resource map');
    } else if (type === 0x100 || type === 0x101) {
      if (!pools || header !== 16 || size !== 24) invalid('Invalid namespace');
    } else if (type === 0x102) {
      if (!pools || header !== 16 || size < 36 || ++nodes > 32768 || stack.length >= 64) invalid('Invalid element bounds');
      const count = data.readUInt16LE(offset + 28);
      attributes += count;
      if (data.readUInt16LE(offset + 24) !== 20 || data.readUInt16LE(offset + 26) !== 20 || count > 1024 || attributes > 65536 || size !== 36 + count * 20) invalid('Invalid attribute bounds');
      for (let index = 0; index < count; index++) {
        if (data.readUInt16LE(offset + 36 + index * 20 + 12) !== 8) invalid('Invalid typed attribute');
      }
      if (!stack.length && ++roots > 1) invalid('Multiple document roots');
      stack.push([data.readUInt32LE(offset + 16), data.readUInt32LE(offset + 20)]);
    } else if (type === 0x103) {
      if (header !== 16 || size !== 24 || !stack.length) invalid('Invalid end element');
      const start = stack.pop();
      if (start[0] !== data.readUInt32LE(offset + 16) || start[1] !== data.readUInt32LE(offset + 20)) invalid('Mismatched end element');
    } else if (type === 0x104) {
      if (header !== 16 || size !== 28 || !stack.length || data.readUInt16LE(offset + 20) !== 8) invalid('Invalid CDATA');
    } else invalid('Unsupported XML chunk');
    offset = end;
  }
  if (pools !== 1 || roots !== 1 || stack.length) invalid('Incomplete document');
}
