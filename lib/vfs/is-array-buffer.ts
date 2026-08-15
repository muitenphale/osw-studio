/**
 * Whether a value is an ArrayBuffer, including one carrying another realm's constructor.
 *
 * IndexedDB hands back structured clones, and a clone can carry a constructor from another realm,
 * so `value instanceof ArrayBuffer` is false for something that unmistakably is one. Code deciding
 * "is this binary content?" with `instanceof` therefore treats an image as ordinary data and
 * `JSON.stringify` writes it out as `{}`, which the server stores as an empty file with no error.
 *
 * `backup-service.ts`, `binary-encoding.ts` and `sqlite-adapter.ts` each carry their own copy of
 * this check, for the same reason and with the same history. This is the one the sync path uses.
 */
export function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}
