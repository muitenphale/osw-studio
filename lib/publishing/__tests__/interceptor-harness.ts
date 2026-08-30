/**
 * Runs the edge-function interceptor exactly as a published page runs it.
 *
 * The predicate lives inside a minified script string rather than in module scope, so a test that
 * re-declared it would be asserting against a copy and would keep passing after the shipped script
 * changed. This evaluates the emitted text instead, and asks the replaced `window.fetch` where it
 * sends a URL — the same question the browser asks.
 */

const okResponse = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });

/** The interceptor is the one injected script that routes to the edge-function endpoint. */
export function extractInterceptorScript(html: string): string {
  const blocks = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
  const found = blocks.find(block => block.includes('/api/deployments/'));
  if (!found) throw new Error('no edge-function interceptor in this HTML');
  return found.replace(/^<script>/, '').replace(/<\/script>$/, '');
}

/** Source text of a `function name(...) { ... }` declaration, located by brace matching. */
function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`no function ${name} in this source`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

interface InterceptedPage {
  /** URL the patched `window.fetch` actually requests; unchanged if the interceptor passed it by. */
  route(url: string): string;
  /** The widget's own `request()`, wired to the same patched fetch the browser would hand it. */
  widgetRequest(path: string, options?: Record<string, unknown>): string;
}

/**
 * Evaluate a published page's injected scripts against stub globals.
 *
 * `widgetRequest` lifts the widget's real `request` function and the `API` value it was built with
 * out of the emitted script, so the assertion covers the composition of the two injections rather
 * than a URL the test built for itself.
 */
export function interceptPage(html: string, origin = 'https://studio.example.com'): InterceptedPage {
  const requested: string[] = [];
  const window = {
    location: { origin, pathname: '/index.html' },
    fetch: (input: string | { url: string }) => {
      requested.push(typeof input === 'string' ? input : input.url);
      return okResponse();
    },
    XMLHttpRequest: function XHR(this: Record<string, unknown>) {
      this.open = () => {};
      return this;
    },
  };
  const document = { addEventListener: () => {} };

  new Function('window', 'document', 'HTMLFormElement', 'FormData', 'CustomEvent', extractInterceptorScript(html))(
    window,
    document,
    class {},
    class {},
    class {}
  );

  const lastRequest = () => {
    if (requested.length !== 1) throw new Error(`expected one request, saw ${requested.length}`);
    return requested[0];
  };

  return {
    route(url) {
      requested.length = 0;
      window.fetch(url);
      return lastRequest();
    },
    widgetRequest(path, options) {
      const api = html.match(/var API = ("(?:[^"\\]|\\.)*");/);
      if (!api) throw new Error('no review widget API base in this HTML');
      const request = new Function(
        'window',
        'fetch',
        `var API = ${api[1]}; ${extractFunction(html, 'request')} return request;`
      )(window, window.fetch);

      requested.length = 0;
      request(path, options);
      return lastRequest();
    },
  };
}
