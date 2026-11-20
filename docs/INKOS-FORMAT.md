# `.inkos` file format, version 1

An `.inkos` file is an encrypted, authenticated InkOS session: the VFS tree plus
UI state. Implementation: `inkos/web/js/inkos-format.js`. Tests:
`tests/unit/inkos-format.test.mjs`.

## Cryptography

- Web Crypto only. No custom primitives.
- KDF: PBKDF2-HMAC-SHA-256. Iterations are calibrated per device to about 500 ms
  and never below 600,000. The value is stored in the header.
- Salt: 16 random bytes per file.
- Cipher: AES-GCM with a 256-bit key, imported with `extractable: false`.
- Nonce: 96 bits = 8-byte random prefix (per file) + 32-bit big-endian chunk
  index. Each file has a new salt, so a new key, and indexes never repeat
  within a file, so a (key, IV) pair is never reused.
- AAD per chunk: `SHA-256(header) || u32 index || u8 final`. This binds every
  chunk to the header (iterations, salt, chunk size), to its position (no
  reordering) and marks the last chunk (no truncation).

## Layout

All integers are big-endian.

| Offset | Size | Field |
|---|---|---|
| 0 | 8 | magic `49 4E 4B 4F 53 00 0D 0A` ("INKOS\0\r\n") |
| 8 | 2 | format version = 1 |
| 10 | 1 | KDF id: 1 = PBKDF2-HMAC-SHA-256 |
| 11 | 1 | reserved, 0 |
| 12 | 4 | PBKDF2 iterations |
| 16 | 16 | salt |
| 32 | 4 | plaintext chunk size (default 1 MiB, 4 KiB to 16 MiB) |
| 36 | 8 | IV prefix |
| 44 | 4 | flags, reserved, 0 |
| 48 | … | records |

Each record is `u32 length || AES-GCM ciphertext+tag (length bytes)`.
Every record except the last decrypts to exactly `chunk size` bytes. The last
record has `final = 1` in its AAD and may be shorter, or empty. A file must end
exactly after the final record.

## Plaintext payload

The decrypted stream is:

```
u32 manifest length || manifest JSON (UTF-8) || file bytes, in manifest order
```

Manifest:

```json
{
  "v": 1,
  "createdAt": "2026-11-20T08:00:00.000Z",
  "ram": { "theme": "mocha" },
  "entries": [
    { "path": "/Home", "type": "dir" },
    { "path": "/Home/a.txt", "type": "file", "size": 3, "mime": "text/plain", "updatedAt": 0 }
  ]
}
```

`ram` holds UI state today. When the kernel keeps guest RAM, its snapshot is
added as a file entry under `/.inkos/ram/` so the payload layout does not change.

## Operations

- **Freeze**: build manifest, stream payload through `encryptStream`, keep the
  record pieces in a `Blob`, save to the VFS or export with `a[download]`
  (Safari has no `showSaveFilePicker`).
- **Wake / import**: `verifyBlob` decrypts and authenticates every chunk first,
  keeping no plaintext. Only after it passes is the payload decrypted again and
  applied. A wrong password, a flipped bit, a truncated or reordered file all
  produce the same `InkosOpenError` message, and nothing is applied.
- Files are read with `Blob.slice`, one record at a time, never whole.
- The password is never persisted or logged. A local backoff between failed
  attempts exists for UX only.

## Compatibility

Readers reject unknown versions with a clear message. Version 1 readers ignore
nothing: any new field needs a new version number. The pre-v1 `INK1` format
(single AES-GCM blob, 250k iterations) is not readable by v1.
