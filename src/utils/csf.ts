/**
 * Utility for parsing and compiling Red Alert 2 CSF (string table) files.
 * Supports binary .csf format, encryption/decryption, and standard language sets.
 */

export interface CsfLabel {
  id: string; // Unique UI identifier
  name: string; // The label key, e.g. "TXT:PLAY"
  value: string; // The translated string value
  extraValue?: string; // Optional extra string (e.g., in Yuri's Revenge)
}

export interface CsfFile {
  version: number;
  language: number;
  labels: CsfLabel[];
}

export const LANGUAGES: { [key: number]: string } = {
  0: "US (English)",
  1: "UK (English)",
  2: "German",
  3: "French",
  4: "Spanish",
  5: "Italian",
  6: "Japanese",
  7: "Jabberwockie",
  8: "Korean",
  9: "Chinese"
};

export const LANGUAGE_LIST = Object.entries(LANGUAGES).map(([key, val]) => ({
  id: parseInt(key),
  name: val
}));

// Decode UTF-16 Little Endian bytes to Javascript string
function decodeUTF16LE(bytes: Uint8Array): string {
  const chars: string[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const code = bytes[i] | (bytes[i + 1] << 8);
      chars.push(String.fromCharCode(code));
    }
  }
  return chars.join("");
}

// Encode Javascript string to UTF-16 Little Endian bytes
function encodeUTF16LE(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes[i * 2] = code & 0xFF;
    bytes[i * 2 + 1] = (code >> 8) & 0xFF;
  }
  return bytes;
}

class BufferReader {
  private view: DataView;
  private bytes: Uint8Array;
  public offset: number = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
  }

  readUint32(): number {
    if (this.offset + 4 > this.bytes.length) {
      throw new Error("Unexpected end of file while reading Uint32");
    }
    const val = this.view.getUint32(this.offset, true); // Little-endian
    this.offset += 4;
    return val;
  }

  readBytes(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) {
      throw new Error(`Unexpected end of file while reading ${length} bytes`);
    }
    const val = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return val;
  }

  readStringASCII(length: number): string {
    const bytes = this.readBytes(length);
    let str = "";
    for (let i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    return str;
  }

  hasMore(): boolean {
    return this.offset < this.bytes.length;
  }
}

class BufferWriter {
  private chunks: Uint8Array[] = [];
  private totalLength: number = 0;

  writeBytes(bytes: Uint8Array) {
    this.chunks.push(bytes);
    this.totalLength += bytes.length;
  }

  writeUint32(val: number) {
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint32(0, val, true); // Little endian
    this.writeBytes(new Uint8Array(buf));
  }

  writeStringASCII(str: string) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i) & 0xFF;
    }
    this.writeBytes(bytes);
  }

  toUint8Array(): Uint8Array {
    const result = new Uint8Array(this.totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

/**
 * Parses an ArrayBuffer containing a CSF file and returns a CsfFile object.
 */
export function parseCsf(buffer: ArrayBuffer): CsfFile {
  const reader = new BufferReader(buffer);

  // 1. Read Header (24 bytes)
  const magic = reader.readStringASCII(4);
  if (magic !== " FSC") {
    throw new Error(`Invalid CSF magic identifier. Expected " FSC", got "${magic}"`);
  }

  const version = reader.readUint32();
  const numLabels = reader.readUint32();
  const numStrings = reader.readUint32();
  const unused = reader.readUint32();
  const language = reader.readUint32();

  const labels: CsfLabel[] = [];

  // 2. Read Labels
  for (let i = 0; i < numLabels; i++) {
    if (!reader.hasMore()) {
      break; // Safe breakout if truncated
    }

    const lblMagic = reader.readStringASCII(4);
    if (lblMagic !== " LBL") {
      throw new Error(`Invalid label magic at label index ${i}. Expected " LBL", got "${lblMagic}"`);
    }

    const numStringPairs = reader.readUint32();
    const nameLength = reader.readUint32();
    const name = reader.readStringASCII(nameLength);

    let valueStr = "";
    let extraValueStr = "";

    // Read string pairs for this label (usually 1)
    for (let j = 0; j < numStringPairs; j++) {
      if (!reader.hasMore()) break;

      const strMagic = reader.readStringASCII(4);
      if (strMagic === " RTS") {
        const valueLength = reader.readUint32(); // number of characters (2 bytes each)
        const encryptedBytes = reader.readBytes(valueLength * 2);

        // Decrypt (XOR each byte with 0xFF)
        const decryptedBytes = new Uint8Array(encryptedBytes.length);
        for (let k = 0; k < encryptedBytes.length; k++) {
          decryptedBytes[k] = encryptedBytes[k] ^ 0xFF;
        }

        const decoded = decodeUTF16LE(decryptedBytes);
        if (j === 0) {
          valueStr = decoded;
        }
      } else if (strMagic === "WRTS") {
        const valueLength = reader.readUint32();
        const encryptedBytes = reader.readBytes(valueLength * 2);

        // Decrypt
        const decryptedBytes = new Uint8Array(encryptedBytes.length);
        for (let k = 0; k < encryptedBytes.length; k++) {
          decryptedBytes[k] = encryptedBytes[k] ^ 0xFF;
        }

        const decoded = decodeUTF16LE(decryptedBytes);

        const extraLength = reader.readUint32();
        const extraBytes = reader.readStringASCII(extraLength);

        if (j === 0) {
          valueStr = decoded;
          extraValueStr = extraBytes;
        }
      } else {
        throw new Error(`Invalid string magic under label "${name}". Expected " RTS" or "WRTS", got "${strMagic}"`);
      }
    }

    labels.push({
      id: `${name}_${i}_${Math.random().toString(36).substring(2, 9)}`,
      name,
      value: valueStr,
      extraValue: extraValueStr
    });
  }

  return {
    version,
    language,
    labels
  };
}

/**
 * Compiles a CsfFile object to a Uint8Array representing a CSF binary file.
 */
export function compileCsf(csf: CsfFile): Uint8Array {
  const writer = new BufferWriter();

  // 1. Write Header
  writer.writeStringASCII(" FSC");
  writer.writeUint32(csf.version);
  writer.writeUint32(csf.labels.length);
  writer.writeUint32(csf.labels.length); // Total string pairs is equal to number of labels
  writer.writeUint32(0); // Unused / Reserved
  writer.writeUint32(csf.language);

  // 2. Write Labels
  for (const label of csf.labels) {
    writer.writeStringASCII(" LBL");
    writer.writeUint32(1); // One string pair

    writer.writeUint32(label.name.length);
    writer.writeStringASCII(label.name);

    const hasExtra = typeof label.extraValue === "string" && label.extraValue.trim().length > 0;
    const utf16Bytes = encodeUTF16LE(label.value);

    // Encrypt by inverting bits
    const encryptedBytes = new Uint8Array(utf16Bytes.length);
    for (let i = 0; i < utf16Bytes.length; i++) {
      encryptedBytes[i] = utf16Bytes[i] ^ 0xFF;
    }

    if (hasExtra) {
      writer.writeStringASCII("WRTS");
      writer.writeUint32(label.value.length);
      writer.writeBytes(encryptedBytes);

      const extra = label.extraValue || "";
      writer.writeUint32(extra.length);
      writer.writeStringASCII(extra);
    } else {
      writer.writeStringASCII(" RTS");
      writer.writeUint32(label.value.length);
      writer.writeBytes(encryptedBytes);
    }
  }

  return writer.toUint8Array();
}
