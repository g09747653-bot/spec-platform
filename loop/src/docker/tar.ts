/**
 * A minimal tar writer, for the one thing the loop needs one for (task 155).
 *
 * The Docker Engine's `POST /build` takes its context as an uncompressed tar stream. The loop's
 * context is a single Dockerfile of a dozen lines, so the alternatives were a dependency that can
 * write every tar variant, or the eighty lines below — and a build context the loop cannot produce
 * on its own would mean the operator has to run `docker build` by hand before the first task, which
 * is a step nobody told them about at the moment the loop is supposed to be autonomous.
 *
 * The format written is ustar: a 512-byte header per entry, the content padded to 512, and two
 * empty blocks at the end. Numeric fields are octal, NUL-terminated, which is what every tar reader
 * has accepted for forty years.
 */

const BLOCK = 512;

export interface TarEntry {
  name: string;
  content: string;
  /** Octal file mode. `0o644` for data; nothing in the loop's contexts is executable. */
  mode?: number;
}

function octal(value: number, width: number): string {
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

function writeString(header: Buffer, value: string, offset: number, length: number): void {
  header.write(value.slice(0, length - 1), offset, length - 1, 'utf8');
}

function headerFor(entry: TarEntry, size: number): Buffer {
  const header = Buffer.alloc(BLOCK);

  writeString(header, entry.name, 0, 100);
  header.write(octal(entry.mode ?? 0o644, 8), 100, 8, 'ascii');
  header.write(octal(0, 8), 108, 8, 'ascii'); // uid
  header.write(octal(0, 8), 116, 8, 'ascii'); // gid
  header.write(octal(size, 12), 124, 12, 'ascii');
  /*
   * A fixed modification time, deliberately. The Dockerfile's bytes decide the image; a fresh
   * `Date` here would make two builds of identical content differ, which would defeat the layer
   * cache and make «the image is already built» impossible to answer.
   */
  header.write(octal(0, 12), 136, 12, 'ascii');
  header.write('        ', 148, 8, 'ascii'); // checksum placeholder: spaces, per the format
  header.write('0', 156, 1, 'ascii'); // type: regular file
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');

  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(octal(checksum, 8), 148, 8, 'ascii');

  return header;
}

/** The entries as one uncompressed tar archive. */
export function tar(entries: readonly TarEntry[]): Buffer {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    const content = Buffer.from(entry.content, 'utf8');
    blocks.push(headerFor(entry, content.length));
    blocks.push(content);

    const padding = (BLOCK - (content.length % BLOCK)) % BLOCK;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }

  // Two empty blocks close the archive.
  blocks.push(Buffer.alloc(BLOCK * 2));

  return Buffer.concat(blocks);
}
