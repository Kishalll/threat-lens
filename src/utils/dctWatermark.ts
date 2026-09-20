import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

const WATERMARK_KEY = "threatlens-dct-watermark-key-v1";
const DELTA = 50;
const REDUNDANCY = 16;
const PAYLOAD_BITS = 128;
const MAGIC_BITS = 16;
const TOTAL_EMBED_BITS = PAYLOAD_BITS + MAGIC_BITS; // 144
const TOTAL_BLOCKS_NEEDED = TOTAL_EMBED_BITS * REDUNDANCY; // 2304 blocks
const DCT_COEFF_ROW = 3;
const DCT_COEFF_COL = 4;
// Fixed magic prefix: 1010010111000011 (0xA5C3)
const MAGIC_PATTERN = [1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1];

function dct1d(input: Float64Array): Float64Array {
  const N = input.length;
  const output = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += input[n] * Math.cos((Math.PI / N) * (n + 0.5) * k);
    }
    output[k] = sum * (k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N));
  }
  return output;
}

function idct1d(input: Float64Array): Float64Array {
  const N = input.length;
  const output = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    let sum = 0;
    for (let k = 0; k < N; k++) {
      const scale = k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
      sum += scale * input[k] * Math.cos((Math.PI / N) * (n + 0.5) * k);
    }
    output[n] = sum;
  }
  return output;
}

function dct2d(block: Float64Array[]): Float64Array[] {
  const temp: Float64Array[] = new Array(8);
  for (let r = 0; r < 8; r++) {
    temp[r] = dct1d(block[r]);
  }
  const result: Float64Array[] = Array.from({ length: 8 }, () => new Float64Array(8));
  for (let c = 0; c < 8; c++) {
    const col = new Float64Array(8);
    for (let r = 0; r < 8; r++) col[r] = temp[r][c];
    const dctCol = dct1d(col);
    for (let r = 0; r < 8; r++) result[r][c] = dctCol[r];
  }
  return result;
}

function idct2d(coeffs: Float64Array[]): Float64Array[] {
  const temp: Float64Array[] = new Array(8);
  for (let r = 0; r < 8; r++) {
    temp[r] = idct1d(coeffs[r]);
  }
  const result: Float64Array[] = Array.from({ length: 8 }, () => new Float64Array(8));
  for (let c = 0; c < 8; c++) {
    const col = new Float64Array(8);
    for (let r = 0; r < 8; r++) col[r] = temp[r][c];
    const idctCol = idct1d(col);
    for (let r = 0; r < 8; r++) result[r][c] = idctCol[r];
  }
  return result;
}

function createPrng(seedString: string): () => number {
  const hash = sha256(utf8ToBytes(seedString));
  const view = new DataView(hash.buffer, hash.byteOffset, hash.byteLength);
  let s0 = view.getUint32(0, true);
  let s1 = view.getUint32(4, true);
  let s2 = view.getUint32(8, true);
  let s3 = view.getUint32(12, true);

  return function next(): number {
    const t = s3;
    let s = s0;
    s3 = s2;
    s2 = s1;
    s1 = s0;
    s ^= (s << 11) >>> 0;
    s ^= s >>> 8;
    s ^= (t ^ (t >>> 19)) >>> 0;
    s0 = s;
    return (s >>> 0) / 4294967296;
  };
}

function extractLumaBlock(rgba: Uint8Array, width: number, blockX: number, blockY: number): Float64Array[] {
  const block = Array.from({ length: 8 }, () => new Float64Array(8));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const px = blockX * 8 + c;
      const py = blockY * 8 + r;
      const idx = (py * width + px) * 4;
      const R = rgba[idx] ?? 0;
      const G = rgba[idx + 1] ?? 0;
      const B = rgba[idx + 2] ?? 0;
      block[r][c] = 0.299 * R + 0.587 * G + 0.114 * B;
    }
  }
  return block;
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function writeLumaBlock(
  rgba: Uint8Array,
  width: number,
  blockX: number,
  blockY: number,
  origBlock: Float64Array[],
  newBlock: Float64Array[]
): void {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const px = blockX * 8 + c;
      const py = blockY * 8 + r;
      const idx = (py * width + px) * 4;
      const diff = newBlock[r][c] - origBlock[r][c];

      rgba[idx] = clampByte((rgba[idx] ?? 0) + diff);
      rgba[idx + 1] = clampByte((rgba[idx + 1] ?? 0) + diff);
      rgba[idx + 2] = clampByte((rgba[idx + 2] ?? 0) + diff);
    }
  }
}

interface BlockCoord {
  bx: number;
  by: number;
}

function selectBlocks(blocksW: number, blocksH: number, count: number, key: string): BlockCoord[] {
  const totalBlocks = blocksW * blocksH;
  const rng = createPrng(key);
  const indices = Array.from({ length: totalBlocks }, (_, i) => i);

  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = indices[i];
    indices[i] = indices[j];
    indices[j] = temp;
  }

  return indices.slice(0, count).map((idx) => ({
    bx: idx % blocksW,
    by: Math.floor(idx / blocksW),
  }));
}

function embedBit(coeff: number, bit: number, delta: number): number {
  const quantized = Math.round(coeff / delta);
  const parity = ((quantized % 2) + 2) % 2;
  if (parity === bit) {
    return quantized * delta;
  }
  const lower = (quantized - 1) * delta;
  const upper = (quantized + 1) * delta;
  return Math.abs(coeff - lower) < Math.abs(coeff - upper) ? lower : upper;
}

function extractBit(coeff: number, delta: number): number {
  const quantized = Math.round(coeff / delta);
  return ((quantized % 2) + 2) % 2;
}

export function hexToBits(hex: string): number[] {
  const cleanHex = hex.trim().toLowerCase();
  const bits: number[] = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    const byte = parseInt(cleanHex.slice(i, i + 2), 16) || 0;
    for (let b = 7; b >= 0; b--) {
      bits.push((byte >> b) & 1);
    }
  }
  return bits;
}

export function bitsToHex(bits: number[]): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8 && i + b < bits.length; b++) {
      byte = (byte << 1) | bits[i + b];
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function expandWithRedundancy(bits: number[], repetitions: number): number[] {
  const expanded: number[] = [];
  for (const bit of bits) {
    for (let r = 0; r < repetitions; r++) {
      expanded.push(bit);
    }
  }
  return expanded;
}

function collapseWithMajority(expanded: number[], payloadLen: number, repetitions: number): { bits: number[]; confidence: number } {
  const bits: number[] = [];
  let totalConsensus = 0;

  for (let i = 0; i < payloadLen; i++) {
    let ones = 0;
    for (let r = 0; r < repetitions; r++) {
      ones += expanded[i * repetitions + r] ?? 0;
    }
    const chosenBit = ones > repetitions / 2 ? 1 : 0;
    bits.push(chosenBit);
    const majorityCount = chosenBit === 1 ? ones : repetitions - ones;
    totalConsensus += majorityCount / repetitions;
  }

  const confidence = totalConsensus / payloadLen;
  return { bits, confidence };
}

export function embedDctWatermark(
  rgba: Uint8Array,
  width: number,
  height: number,
  hexPayload: string
): { success: boolean; modifiedRgba: Uint8Array; error?: string } {
  const blocksW = Math.floor(width / 8);
  const blocksH = Math.floor(height / 8);
  const totalBlocks = blocksW * blocksH;

  if (totalBlocks < TOTAL_BLOCKS_NEEDED) {
    return {
      success: false,
      modifiedRgba: rgba,
      error: `Image is too small for watermark. Need ${TOTAL_BLOCKS_NEEDED} blocks, image has ${totalBlocks}.`,
    };
  }

  const payloadBits = hexToBits(hexPayload).slice(0, PAYLOAD_BITS);
  while (payloadBits.length < PAYLOAD_BITS) {
    payloadBits.push(0);
  }

  const allBits = [...MAGIC_PATTERN, ...payloadBits];
  const expandedBits = expandWithRedundancy(allBits, REDUNDANCY);
  const selectedBlocks = selectBlocks(blocksW, blocksH, TOTAL_BLOCKS_NEEDED, WATERMARK_KEY);
  const outputRgba = new Uint8Array(rgba);

  for (let i = 0; i < selectedBlocks.length; i++) {
    const { bx, by } = selectedBlocks[i];
    const bit = expandedBits[i];
    const lumaBlock = extractLumaBlock(outputRgba, width, bx, by);
    const coeffs = dct2d(lumaBlock);

    coeffs[DCT_COEFF_ROW][DCT_COEFF_COL] = embedBit(
      coeffs[DCT_COEFF_ROW][DCT_COEFF_COL],
      bit,
      DELTA
    );

    const modified = idct2d(coeffs);
    writeLumaBlock(outputRgba, width, bx, by, lumaBlock, modified);
  }

  return { success: true, modifiedRgba: outputRgba };
}

export function extractDctWatermark(
  rgba: Uint8Array,
  width: number,
  height: number
): { watermarkHex: string | null; confidence: number } {
  const blocksW = Math.floor(width / 8);
  const blocksH = Math.floor(height / 8);
  const totalBlocks = blocksW * blocksH;

  if (totalBlocks < TOTAL_BLOCKS_NEEDED) {
    return { watermarkHex: null, confidence: 0 };
  }

  const selectedBlocks = selectBlocks(blocksW, blocksH, TOTAL_BLOCKS_NEEDED, WATERMARK_KEY);
  const extractedExpanded: number[] = [];

  for (let i = 0; i < selectedBlocks.length; i++) {
    const { bx, by } = selectedBlocks[i];
    const lumaBlock = extractLumaBlock(rgba, width, bx, by);
    const coeffs = dct2d(lumaBlock);
    extractedExpanded.push(extractBit(coeffs[DCT_COEFF_ROW][DCT_COEFF_COL], DELTA));
  }

  const { bits: allBits, confidence } = collapseWithMajority(extractedExpanded, TOTAL_EMBED_BITS, REDUNDANCY);

  // Check magic prefix. If it doesn't match, this image was never watermarked.
  const extractedMagic = allBits.slice(0, MAGIC_BITS);
  let magicMatch = true;
  for (let i = 0; i < MAGIC_BITS; i++) {
    if (extractedMagic[i] !== MAGIC_PATTERN[i]) {
      magicMatch = false;
      break;
    }
  }

  if (!magicMatch) {
    return { watermarkHex: null, confidence: 0 };
  }

  const payloadBits = allBits.slice(MAGIC_BITS);
  return { watermarkHex: bitsToHex(payloadBits), confidence };
}
