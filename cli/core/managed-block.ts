// ABOUTME: Parses and updates one explicitly marked managed block without decoding unrelated user bytes.
// ABOUTME: Fails closed on ambiguous markers and preserves all bytes outside the recognized block.

export interface ManagedBlockMarkers {
  start: string;
  end: string;
}

interface ManagedBlockMetadata {
  original: Uint8Array;
  newline: "\n" | "\r\n";
  hasFinalNewline: boolean;
}

export type ManagedBlockParseResult =
  | (ManagedBlockMetadata & { state: "absent" })
  | (ManagedBlockMetadata & {
      state: "present";
      before: Uint8Array;
      block: Uint8Array;
      after: Uint8Array;
    })
  | (ManagedBlockMetadata & {
      state: "malformed";
      code:
        | "START_WITHOUT_END"
        | "END_WITHOUT_START"
        | "DUPLICATE_MARKER"
        | "REVERSED_MARKERS";
    });

function indices(haystack: Uint8Array, needle: Uint8Array): number[] {
  const found: number[] = [];
  if (needle.byteLength === 0) return found;
  outer: for (let offset = 0; offset <= haystack.byteLength - needle.byteLength; offset += 1) {
    for (let index = 0; index < needle.byteLength; index += 1) {
      if (haystack[offset + index] !== needle[index]) continue outer;
    }
    found.push(offset);
  }
  return found;
}

function metadata(bytes: Uint8Array): ManagedBlockMetadata {
  const newline = indices(bytes, new Uint8Array([13, 10])).length > 0 ? "\r\n" : "\n";
  const hasFinalNewline =
    bytes.byteLength > 0 &&
    (bytes[bytes.byteLength - 1] === 10 || bytes[bytes.byteLength - 1] === 13);
  return { original: bytes.slice(), newline, hasFinalNewline };
}

export function parseManagedBlock(
  bytes: Uint8Array,
  markers: ManagedBlockMarkers,
): ManagedBlockParseResult {
  const details = metadata(bytes);
  const encoder = new TextEncoder();
  const startBytes = encoder.encode(markers.start);
  const endBytes = encoder.encode(markers.end);
  const starts = indices(bytes, startBytes);
  const ends = indices(bytes, endBytes);

  if (starts.length === 0 && ends.length === 0) return { ...details, state: "absent" };
  if (starts.length === 0) return { ...details, state: "malformed", code: "END_WITHOUT_START" };
  if (ends.length === 0) return { ...details, state: "malformed", code: "START_WITHOUT_END" };
  if (starts.length !== 1 || ends.length !== 1) {
    return { ...details, state: "malformed", code: "DUPLICATE_MARKER" };
  }
  const start = starts[0]!;
  const endMarker = ends[0]!;
  if (endMarker < start + startBytes.byteLength) {
    return { ...details, state: "malformed", code: "REVERSED_MARKERS" };
  }
  let end = endMarker + endBytes.byteLength;
  if (bytes[end] === 13 && bytes[end + 1] === 10) end += 2;
  else if (bytes[end] === 10) end += 1;

  return {
    ...details,
    state: "present",
    before: bytes.slice(0, start),
    block: bytes.slice(start, end),
    after: bytes.slice(end),
  };
}

export function renderManagedBlock(
  body: string,
  markers: ManagedBlockMarkers,
  newline: "\n" | "\r\n",
): Uint8Array {
  const terminatedBody = body.endsWith("\n") || body.endsWith("\r") ? body : `${body}${newline}`;
  return new TextEncoder().encode(
    `${markers.start}${newline}${terminatedBody}${markers.end}${newline}`,
  );
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export function upsertManagedBlock(
  bytes: Uint8Array,
  body: string,
  markers: ManagedBlockMarkers,
): Uint8Array {
  const parsed = parseManagedBlock(bytes, markers);
  if (parsed.state === "malformed") {
    throw new Error(`Managed block is malformed: ${parsed.code}`);
  }
  const block = renderManagedBlock(body, markers, parsed.newline);
  if (parsed.state === "absent") return concatenate([block, parsed.original]);
  return concatenate([parsed.before, block, parsed.after]);
}

export function removeManagedBlock(
  bytes: Uint8Array,
  markers: ManagedBlockMarkers,
): Uint8Array {
  const parsed = parseManagedBlock(bytes, markers);
  if (parsed.state === "malformed") {
    throw new Error(`Managed block is malformed: ${parsed.code}`);
  }
  if (parsed.state === "absent") return parsed.original;
  return concatenate([parsed.before, parsed.after]);
}
