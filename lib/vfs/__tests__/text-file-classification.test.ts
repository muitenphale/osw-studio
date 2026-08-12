import { describe, it, expect } from 'vitest';
import { isTextExtension } from '@/lib/vfs/types';

/**
 * Whether a path is text decides how an uploaded file is read: the File Explorer picks between
 * `file.text()` and `file.arrayBuffer()` from this, and the archive manifest uses it to decide
 * whether a download carries the file as text or base64. Getting it wrong stored a text file as
 * bytes, after which `cat` refused it and the editor called it unsupported.
 *
 * The extension list itself is data and does not need asserting member by member. What is worth
 * holding is the two branches around it.
 */

describe('classifying a path as text', () => {
  it('reads a text format that has no runtime here as text', () => {
    // The motivating case: no PHP runtime does not mean the file is not text. It is edited here
    // and run wherever it is taken.
    expect(isTextExtension('index.php')).toBe(true);
  });

  it('recognises a text file that carries no extension', () => {
    // `'Dockerfile'.split('.').pop()` returns the whole filename, so these fell through to bytes
    // until TEXT_FILENAMES matched them by name.
    expect(isTextExtension('Dockerfile')).toBe(true);
    expect(isTextExtension('src/Makefile')).toBe(true);
  });

  it('still treats an unenumerated extension as bytes', () => {
    // The load-bearing default. Reading unknown bytes as text destroys them; treating text as
    // bytes only costs the editor, so the list growing must not turn this into a guess.
    expect(isTextExtension('model.glb')).toBe(false);
  });

  it('keeps genuinely binary formats binary', () => {
    expect(isTextExtension('logo.png')).toBe(false);
    expect(isTextExtension('font.woff2')).toBe(false);
  });
});
