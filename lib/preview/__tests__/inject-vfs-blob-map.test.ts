import { describe, it, expect } from 'vitest';
import { injectVfsBlobMap } from '../inject-vfs-blob-map';

const MAP = new Map([
  ['/img/logo.png', 'blob:http://localhost/aaa'],
  ['/data/posts.json', 'blob:http://localhost/bbb'],
]);

describe('injecting the blob-URL map', () => {
  it('gives the interceptor the map it resolves runtime requests through', () => {
    const out = injectVfsBlobMap('<html><head></head><body></body></html>', MAP);

    expect(out).toContain('window.__oswVfsBlobUrls');
    expect(out).toContain('/img/logo.png');
    expect(out).toContain('blob:http://localhost/aaa');
  });

  it('puts it in the head, ahead of the page\'s own scripts', () => {
    const out = injectVfsBlobMap('<html><head><script src="app.js"></script></head></html>', MAP);

    // A script that asks for an asset as it runs has to find the map already there.
    expect(out.indexOf('__oswVfsBlobUrls')).toBeLessThan(out.indexOf('app.js'));
  });

  it('still injects into a document with no head', () => {
    const out = injectVfsBlobMap('<div>fragment</div>', MAP);

    expect(out.startsWith('<script>')).toBe(true);
    expect(out).toContain('<div>fragment</div>');
  });

  it('escapes a path that would otherwise close the script tag', () => {
    const hostile = new Map([['/a</script><img onerror=alert(1)>.png', 'blob:x']]);

    const out = injectVfsBlobMap('<html><head></head></html>', hostile);

    // The literal sequence must not appear, or the injected script ends early and the rest of the
    // path is parsed as markup. A file path is content, and a project can name a file anything.
    expect(out).not.toContain('</script><img');
    expect(out).toContain('\\u003c/script');
  });

  it('produces a parseable assignment for an empty map', () => {
    const out = injectVfsBlobMap('<html><head></head></html>', new Map());

    expect(out).toContain('window.__oswVfsBlobUrls = {};');
  });
});
