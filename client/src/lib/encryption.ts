/**
 * Client-Side Encryption Module for AngoCloud
 * Uses Web Crypto API for AES-256-GCM encryption
 * 
 * Flow:
 * 1. User password → PBKDF2 → Encryption Key
 * 2. File + Key → AES-GCM Encrypt → Encrypted File
 * 3. Encrypted File + Key → AES-GCM Decrypt → Original File
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

export interface EncryptedData {
  iv: Uint8Array;
  data: Uint8Array;
}

export interface EncryptedFile {
  encryptedBuffer: ArrayBuffer;
  originalSize: number;
}

/**
 * Generate a random salt for key derivation
 */
export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return arrayBufferToBase64(salt.buffer);
}

/**
 * Derive an encryption key from password and salt using PBKDF2
 */
export async function deriveKey(password: string, saltBase64: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const salt = base64ToArrayBuffer(saltBase64);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Export key to a storable format (for session storage)
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(exported);
}

/**
 * Import key from stored format
 */
export async function importKey(keyBase64: string): Promise<CryptoKey> {
  const keyBuffer = base64ToArrayBuffer(keyBase64);
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive and export key for storage
 */
export async function deriveAndExportKey(password: string, saltBase64: string): Promise<string> {
  const key = await deriveKey(password, saltBase64);
  const exported = await crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(exported);
}

/**
 * Encrypt a file buffer using AES-GCM
 * Returns the encrypted data with IV prepended
 */
export async function encryptFile(file: File, key: CryptoKey): Promise<EncryptedFile> {
  const fileBuffer = await file.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  const encryptedData = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv },
    key,
    fileBuffer
  );
  
  const result = new Uint8Array(IV_LENGTH + encryptedData.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encryptedData), IV_LENGTH);
  
  return {
    encryptedBuffer: result.buffer,
    originalSize: fileBuffer.byteLength
  };
}

/**
 * Encrypt an ArrayBuffer using AES-GCM
 */
export async function encryptBuffer(buffer: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  const encryptedData = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv },
    key,
    buffer
  );
  
  const result = new Uint8Array(IV_LENGTH + encryptedData.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encryptedData), IV_LENGTH);
  
  return result.buffer;
}

/**
 * Decrypt an encrypted buffer (with IV prepended)
 */
export async function decryptBuffer(encryptedBuffer: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const encryptedData = new Uint8Array(encryptedBuffer);
  const iv = encryptedData.slice(0, IV_LENGTH);
  const data = encryptedData.slice(IV_LENGTH);
  
  return crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv },
    key,
    data
  );
}

/**
 * Decrypt a file and return as Blob
 */
export async function decryptFile(
  encryptedBuffer: ArrayBuffer, 
  key: CryptoKey, 
  mimeType: string
): Promise<Blob> {
  const decrypted = await decryptBuffer(encryptedBuffer, key);
  return new Blob([decrypted], { type: mimeType });
}

/**
 * Create a download URL from decrypted data
 */
export function createDownloadUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/**
 * Revoke a download URL to free memory
 */
export function revokeDownloadUrl(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Convert ArrayBuffer to Base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Check if Web Crypto API is available
 */
export function isEncryptionSupported(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined' &&
         typeof crypto.subtle.encrypt === 'function';
}

/**
 * Storage key for encryption key in session
 */
export const ENCRYPTION_KEY_STORAGE = 'angocloud_encryption_key';

/**
 * Store encryption key in session storage
 */
export function storeEncryptionKey(keyBase64: string): void {
  sessionStorage.setItem(ENCRYPTION_KEY_STORAGE, keyBase64);
}

/**
 * Retrieve encryption key from session storage
 */
export function getStoredEncryptionKey(): string | null {
  return sessionStorage.getItem(ENCRYPTION_KEY_STORAGE);
}

/**
 * Clear encryption key from session storage
 */
export function clearEncryptionKey(): void {
  sessionStorage.removeItem(ENCRYPTION_KEY_STORAGE);
}

/**
 * Get the active encryption key (import from storage)
 */
export async function getActiveEncryptionKey(): Promise<CryptoKey | null> {
  const keyBase64 = getStoredEncryptionKey();
  if (!keyBase64) return null;
  
  try {
    return await importKey(keyBase64);
  } catch (error) {
    console.error('Failed to import encryption key:', error);
    return null;
  }
}

// ============================================================
// CHUNKED ENCRYPTION (V2) - Streaming without memory limits
// ============================================================

/**
 * Encryption version constants
 */
export const ENCRYPTION_VERSION = {
  V1_FULL_FILE: 1,  // Original: encrypt entire file, then chunk
  V2_PER_CHUNK: 2,  // New: encrypt each chunk individually (streaming)
} as const;

/**
 * Default chunk size for encryption (5MB chunks)
 * Each chunk is encrypted independently with its own IV
 */
export const ENCRYPTION_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Chunk header size: 4 bytes for original size + 12 bytes for IV
 */
const CHUNK_HEADER_SIZE = 4 + IV_LENGTH;

/**
 * Encrypt a single chunk with its own IV
 * Format: [4 bytes: original size][12 bytes: IV][encrypted data + auth tag]
 */
export async function encryptChunk(chunk: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  const encryptedData = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv },
    key,
    chunk
  );
  
  // Create result: [4 bytes original size][12 bytes IV][encrypted data]
  const originalSize = chunk.byteLength;
  const result = new Uint8Array(CHUNK_HEADER_SIZE + encryptedData.byteLength);
  
  // Write original chunk size (4 bytes, big-endian)
  const sizeView = new DataView(result.buffer);
  sizeView.setUint32(0, originalSize, false);
  
  // Write IV
  result.set(iv, 4);
  
  // Write encrypted data
  result.set(new Uint8Array(encryptedData), CHUNK_HEADER_SIZE);
  
  return result.buffer;
}

/**
 * Decrypt a single encrypted chunk
 * Reads the header to extract original size and IV, then decrypts
 */
export async function decryptChunk(encryptedChunk: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const data = new Uint8Array(encryptedChunk);
  
  // Read original size (for verification)
  const sizeView = new DataView(encryptedChunk);
  const originalSize = sizeView.getUint32(0, false);
  
  // Extract IV
  const iv = data.slice(4, CHUNK_HEADER_SIZE);
  
  // Extract encrypted data
  const encryptedData = data.slice(CHUNK_HEADER_SIZE);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv },
    key,
    encryptedData
  );
  
  // Verify size matches
  if (decrypted.byteLength !== originalSize) {
    console.warn(`Decrypted size (${decrypted.byteLength}) doesn't match expected (${originalSize})`);
  }
  
  return decrypted;
}

/**
 * Generator that yields encrypted chunks from a file
 * Use this for memory-efficient upload of large files
 */
export async function* encryptFileChunked(
  file: File, 
  key: CryptoKey,
  chunkSize: number = ENCRYPTION_CHUNK_SIZE
): AsyncGenerator<{ chunk: ArrayBuffer; index: number; total: number; originalSize: number }> {
  const totalChunks = Math.ceil(file.size / chunkSize);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const slice = file.slice(start, end);
    const buffer = await slice.arrayBuffer();
    
    const encryptedChunk = await encryptChunk(buffer, key);
    
    yield {
      chunk: encryptedChunk,
      index: i,
      total: totalChunks,
      originalSize: buffer.byteLength
    };
  }
}

/**
 * Encrypt a single buffer chunk (for use with already-sliced data)
 * Returns the encrypted chunk with header
 */
export async function encryptBufferChunk(buffer: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  return encryptChunk(buffer, key);
}

/**
 * Check if a file uses V2 (chunked) encryption
 */
export function isChunkedEncryption(encryptionVersion: number | undefined): boolean {
  return encryptionVersion === ENCRYPTION_VERSION.V2_PER_CHUNK;
}

/**
 * GCM authentication tag size (always 16 bytes for AES-GCM)
 */
const GCM_TAG_SIZE = 16;

/**
 * Maximum size of a single V2 encrypted chunk (5MB plaintext + overhead)
 */
export const MAX_V2_CHUNK_SIZE = ENCRYPTION_CHUNK_SIZE + CHUNK_HEADER_SIZE + GCM_TAG_SIZE;

/**
 * Detect encryption version from encrypted data
 * V2 format: [4 bytes size][12 bytes IV][encrypted data + 16 bytes auth tag]
 * V1 format: [12 bytes IV][encrypted data + 16 bytes auth tag]
 * 
 * Detection heuristic:
 * - Buffer must be <= max single chunk size to be V2
 * - Read first 4 bytes as potential V2 size header
 * - If size + header (16 bytes) + auth tag (16 bytes) equals total buffer length, it's V2
 * - Otherwise assume V1
 * 
 * For multi-chunk combined buffers, always returns V1 (they should use per-chunk decryption)
 */
export function detectEncryptionVersion(encryptedBuffer: ArrayBuffer): number {
  const bufferLength = encryptedBuffer.byteLength;
  
  // Minimum V2 size: header (16) + auth tag (16) + at least 1 byte of plaintext
  if (bufferLength < CHUNK_HEADER_SIZE + GCM_TAG_SIZE + 1) {
    return ENCRYPTION_VERSION.V1_FULL_FILE;
  }
  
  // V2 chunks are limited to ENCRYPTION_CHUNK_SIZE (5MB) plaintext
  // If buffer is larger, it's either V1 full-file or combined multi-chunk (not suitable for decryptAuto)
  if (bufferLength > MAX_V2_CHUNK_SIZE) {
    return ENCRYPTION_VERSION.V1_FULL_FILE;
  }
  
  const sizeView = new DataView(encryptedBuffer);
  const potentialOriginalSize = sizeView.getUint32(0, false);
  
  // Original size must be positive and within chunk size limit
  if (potentialOriginalSize <= 0 || potentialOriginalSize > ENCRYPTION_CHUNK_SIZE) {
    return ENCRYPTION_VERSION.V1_FULL_FILE;
  }
  
  // V2 expected length: header (16) + encrypted data (originalSize + 16 for auth tag)
  const v2ExpectedLength = CHUNK_HEADER_SIZE + potentialOriginalSize + GCM_TAG_SIZE;
  
  if (v2ExpectedLength === bufferLength) {
    return ENCRYPTION_VERSION.V2_PER_CHUNK;
  }
  
  return ENCRYPTION_VERSION.V1_FULL_FILE;
}

/**
 * Auto-detect encryption version and decrypt accordingly
 * This function analyzes the buffer format and uses the correct decryption method
 * 
 * IMPORTANT: Only use this for single-buffer decryption (single files or single chunks)
 * For multi-chunk V2 files, use decryptChunk on each chunk individually
 * 
 * @param encryptedBuffer - The encrypted buffer (single file or single chunk)
 * @param key - The decryption key
 * @param versionHint - Optional hint for encryption version (from file metadata)
 */
export async function decryptAuto(
  encryptedBuffer: ArrayBuffer, 
  key: CryptoKey,
  versionHint?: number
): Promise<ArrayBuffer> {
  // If caller provides a version hint, trust it
  if (versionHint === ENCRYPTION_VERSION.V2_PER_CHUNK) {
    return await decryptChunk(encryptedBuffer, key);
  }
  
  if (versionHint === ENCRYPTION_VERSION.V1_FULL_FILE) {
    return await decryptBuffer(encryptedBuffer, key);
  }
  
  // Auto-detect based on buffer format
  const detectedVersion = detectEncryptionVersion(encryptedBuffer);
  
  if (detectedVersion === ENCRYPTION_VERSION.V2_PER_CHUNK) {
    try {
      return await decryptChunk(encryptedBuffer, key);
    } catch (e) {
      console.warn('V2 decryption failed, trying V1 as fallback:', e);
      try {
        return await decryptBuffer(encryptedBuffer, key);
      } catch (e2) {
        console.error('Both V2 and V1 decryption failed:', e2);
        throw e; // Throw original V2 error since that was the detected format
      }
    }
  }
  
  // V1 detected or fallback
  try {
    return await decryptBuffer(encryptedBuffer, key);
  } catch (e) {
    console.warn('V1 decryption failed, trying V2 as fallback:', e);
    try {
      return await decryptChunk(encryptedBuffer, key);
    } catch (e2) {
      console.error('Both V1 and V2 decryption failed:', e2);
      throw e; // Throw original V1 error since that was the detected format
    }
  }
}

/**
 * Auto-detect and decrypt a full file
 * For single-chunk files or V1 files, works directly
 * For multi-chunk V2 files, the caller should use per-chunk decryption instead
 */
export async function decryptFileAuto(
  encryptedBuffer: ArrayBuffer,
  key: CryptoKey,
  mimeType: string,
  encryptionVersion?: number
): Promise<Blob> {
  const decrypted = await decryptAuto(encryptedBuffer, key, encryptionVersion);
  return new Blob([decrypted], { type: mimeType });
}

/**
 * Streaming decryption helper that processes chunks one at a time
 * Use this for memory-efficient download of large encrypted files
 */
export async function* decryptChunksStreaming(
  chunks: AsyncIterable<ArrayBuffer>,
  key: CryptoKey
): AsyncGenerator<ArrayBuffer> {
  for await (const encryptedChunk of chunks) {
    const decrypted = await decryptChunk(encryptedChunk, key);
    yield decrypted;
  }
}

/**
 * Create a Blob from streaming decrypted chunks
 * Memory-efficient: only holds current chunk in memory
 */
export async function createBlobFromDecryptedStream(
  chunks: AsyncIterable<ArrayBuffer>,
  key: CryptoKey,
  mimeType: string
): Promise<Blob> {
  const parts: ArrayBuffer[] = [];
  
  for await (const chunk of decryptChunksStreaming(chunks, key)) {
    parts.push(chunk);
  }
  
  return new Blob(parts, { type: mimeType });
}

/**
 * Stream decrypted content directly to a WritableStream
 * Best option for browsers that support File System Access API (Chrome/Edge)
 */
export async function streamDecryptToWriter(
  chunks: AsyncIterable<ArrayBuffer>,
  key: CryptoKey,
  writer: WritableStreamDefaultWriter<Uint8Array>
): Promise<void> {
  try {
    for await (const chunk of decryptChunksStreaming(chunks, key)) {
      await writer.write(new Uint8Array(chunk));
    }
  } finally {
    await writer.close();
  }
}
