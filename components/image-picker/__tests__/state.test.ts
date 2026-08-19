import { describe, it, expect } from 'vitest';
import {
  imageConfirmationMessage,
  imageRefusal,
  imageRefusalMessage,
  imageRefusalOffersAgent,
  imageRefusalTitle,
  isImagePath,
  projectImages,
  uploadDirectory,
} from '../state';

describe('isImagePath', () => {
  it('accepts the formats a browser renders in an <img>', () => {
    for (const path of ['/a.png', '/a.JPG', '/a.jpeg', '/a.gif', '/a.webp', '/a.ico', '/a.bmp', '/a.avif']) {
      expect(isImagePath(path), path).toBe(true);
    }
  });

  it('accepts svg, which the file type table calls text', () => {
    // `getFileTypeFromPath('/logo.svg')` is `'text'` — correctly, it is a text format — but an
    // `<img src="/logo.svg">` is the ordinary way one is used, and a picker that hid it would hide
    // the file the page is already pointing at.
    expect(isImagePath('/logo.svg')).toBe(true);
  });

  it('rejects everything else, including an extensionless dotfile', () => {
    for (const path of ['/index.html', '/style.css', '/README', '/.gitignore', '/a.png.txt']) {
      expect(isImagePath(path), path).toBe(false);
    }
  });
});

describe('projectImages', () => {
  it('keeps only image files, sorted by path', () => {
    expect(projectImages([
      { path: '/z.png' },
      { path: '/index.html' },
      { path: '/images/a.jpg' },
      { path: '/images', type: 'directory' },
    ]).map(f => f.path)).toEqual(['/images/a.jpg', '/z.png']);
  });

  it('drops hidden folders', () => {
    // `/.skills/…` and `/.server/…` never ship, so they are never a src worth offering.
    expect(projectImages([
      { path: '/.skills/icon.png' },
      { path: '/.server/logo.svg' },
      { path: '/real.png' },
    ]).map(f => f.path)).toEqual(['/real.png']);
  });
});

describe('uploadDirectory', () => {
  it('follows where the project already keeps its images', () => {
    expect(uploadDirectory(['/assets/a.png', '/assets/b.png', '/images/c.png'])).toBe('/assets');
  });

  it('breaks a tie by path order, so the answer is stable', () => {
    expect(uploadDirectory(['/images/c.png', '/assets/a.png'])).toBe('/assets');
    expect(uploadDirectory(['/assets/a.png', '/images/c.png'])).toBe('/assets');
  });

  it('handles images at the root', () => {
    expect(uploadDirectory(['/a.png', '/b.png'])).toBe('/');
  });

  it('falls back to /images when the project has none', () => {
    expect(uploadDirectory([])).toBe('/images');
  });
});

describe('imageRefusal', () => {
  it('is nothing to show for a success or for the confirmation', () => {
    expect(imageRefusal({ ok: true, filesWritten: ['/index.html'] })).toBeNull();
    // The confirmation is a different panel with a different button; collapsing the two into one
    // would offer 'Ask the agent' where the answer is 'yes, all three'.
    expect(imageRefusal({ ok: false, reason: 'needs-confirmation', instances: 3 })).toBeNull();
  });

  it('carries the reason and the file through', () => {
    expect(imageRefusal({ ok: false, reason: 'expression-src', file: '/index.html' }))
      .toEqual({ reason: 'expression-src', file: '/index.html' });
  });

  it('lands an unrecognised reason on unresolvable', () => {
    // `ApplyResult['reason']` is shared with the style path, which can refuse in ways this surface
    // has no sentence for. Showing 'undefined' to the user is the failure this prevents.
    expect(imageRefusal({ ok: false, reason: 'ambiguous-stylesheet' })).toEqual({ reason: 'unresolvable', file: undefined });
    expect(imageRefusal({ ok: false })).toEqual({ reason: 'unresolvable', file: undefined });
  });
});

describe('the refusal copy', () => {
  const reasons = ['unresolvable', 'generating', 'stale-index', 'missing-file', 'no-src', 'expression-src'] as const;

  it('says something specific for every reason', () => {
    const titles = reasons.map(reason => imageRefusalTitle({ reason }));
    const messages = reasons.map(reason => imageRefusalMessage({ reason }));
    expect(new Set(titles).size).toBe(reasons.length);
    expect(new Set(messages).size).toBe(reasons.length);
    // Not a length threshold: a 41-character stub passes that and says nothing. The claim is that
    // the message explains something the heading did not, so it must not merely repeat it.
    for (const [i, message] of messages.entries()) {
      expect(message).not.toBe(titles[i]);
      expect(message.trim()).not.toBe('');
    }
  });

  it('names the file where it has one', () => {
    expect(imageRefusalMessage({ reason: 'stale-index', file: '/index.html' })).toContain('/index.html');
    expect(imageRefusalMessage({ reason: 'missing-file', file: '/gone.hbs' })).toContain('/gone.hbs');
    // And reads as a sentence without one.
    expect(imageRefusalMessage({ reason: 'stale-index' })).not.toContain('undefined');
    expect(imageRefusalMessage({ reason: 'missing-file' })).not.toContain('undefined');
  });

  it('does not offer the agent where waiting or refreshing is the answer', () => {
    expect(imageRefusalOffersAgent({ reason: 'generating' })).toBe(false);
    expect(imageRefusalOffersAgent({ reason: 'stale-index' })).toBe(false);
    expect(imageRefusalOffersAgent({ reason: 'expression-src' })).toBe(true);
    expect(imageRefusalOffersAgent({ reason: 'no-src' })).toBe(true);
    expect(imageRefusalOffersAgent({ reason: 'unresolvable' })).toBe(true);
    expect(imageRefusalOffersAgent({ reason: 'missing-file' })).toBe(true);
  });
});

describe('imageConfirmationMessage', () => {
  it('says how many it will change', () => {
    expect(imageConfirmationMessage(3, '/index.html'))
      .toBe('This image from /index.html is rendered 3 times. Replacing it replaces all 3.');
  });

  it('does not claim a count it does not have', () => {
    // `instances` can arrive as 0 from a result that named no number; 'rendered 0 times' would be
    // both false and alarming.
    expect(imageConfirmationMessage(0)).toBe('This image is shared. Replacing it replaces every place it renders.');
  });
});
