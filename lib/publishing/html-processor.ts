import { PublishSettings } from '../vfs/types';
import { generateTrackingScript } from '../analytics/tracking-script';
import { generateConsentBanner } from './consent-banner';

export interface HtmlProcessingOptions {
  publishSettings: PublishSettings;
  projectId: string;
  baseUrl: string;
  deploymentId: string;
  hasEdgeFunctions?: boolean;
}

/**
 * Injects scripts, CDN links, SEO meta tags, analytics, and compliance banner into HTML
 *
 * Note: Under construction mode is handled separately by serving a dedicated page,
 * not by overlaying content
 */
export function processHtml(html: string, options: HtmlProcessingOptions): string {
  const { publishSettings, projectId, baseUrl, deploymentId, hasEdgeFunctions } = options;

  let processed = html;

  // 1. Inject SEO meta tags into <head>
  processed = injectSeoMetaTags(processed, publishSettings, baseUrl);

  // 2. Inject CDN links into <head>
  processed = injectCdnLinks(processed, publishSettings);

  // 3. Inject head scripts into <head>
  processed = injectHeadScripts(processed, publishSettings);

  // 4. Inject edge function interceptor into <head> (only if project has edge functions)
  if (hasEdgeFunctions) {
    processed = injectEdgeFunctionInterceptor(processed, deploymentId);
  }

  // 5. Inject body scripts before </body>
  processed = injectBodyScripts(processed, publishSettings);

  // 6. Inject analytics tracking (if enabled and builtin)
  processed = injectAnalytics(processed, deploymentId, publishSettings);

  // 7. Inject compliance banner (if enabled)
  processed = injectComplianceBanner(processed, deploymentId, publishSettings);

  return processed;
}

/**
 * Injects SEO meta tags into <head>
 */
function injectSeoMetaTags(html: string, settings: PublishSettings, baseUrl: string): string {
  const { seo } = settings;
  if (!seo || Object.keys(seo).length === 0) {
    return html;
  }

  const metaTags: string[] = [];

  // Basic meta tags
  if (seo.title) {
    metaTags.push(`<title>${escapeHtml(seo.title)}</title>`);
    metaTags.push(`<meta property="og:title" content="${escapeHtml(seo.title)}">`);
    metaTags.push(`<meta name="twitter:title" content="${escapeHtml(seo.title)}">`);
  }

  if (seo.description) {
    metaTags.push(`<meta name="description" content="${escapeHtml(seo.description)}">`);
    metaTags.push(`<meta property="og:description" content="${escapeHtml(seo.description)}">`);
    metaTags.push(`<meta name="twitter:description" content="${escapeHtml(seo.description)}">`);
  }

  if (seo.keywords && seo.keywords.length > 0) {
    metaTags.push(`<meta name="keywords" content="${escapeHtml(seo.keywords.join(', '))}">`);
  }

  // Open Graph
  if (seo.ogImage) {
    metaTags.push(`<meta property="og:image" content="${escapeHtml(seo.ogImage)}">`);
    metaTags.push(`<meta name="twitter:image" content="${escapeHtml(seo.ogImage)}">`);
  }

  metaTags.push(`<meta property="og:url" content="${escapeHtml(baseUrl)}">`);
  metaTags.push(`<meta property="og:type" content="website">`);

  // Twitter Card
  metaTags.push(`<meta name="twitter:card" content="summary_large_image">`);

  // Canonical URL
  if (seo.canonical) {
    metaTags.push(`<link rel="canonical" href="${escapeHtml(seo.canonical)}">`);
  }

  // Robots directives
  const robotsDirectives: string[] = [];
  if (seo.noIndex) robotsDirectives.push('noindex');
  if (seo.noFollow) robotsDirectives.push('nofollow');
  if (robotsDirectives.length > 0) {
    metaTags.push(`<meta name="robots" content="${robotsDirectives.join(', ')}">`);
  }

  // Inject into <head>
  return injectIntoHead(html, metaTags.join('\n    '));
}

/**
 * Injects CDN links (CSS and JS) into <head>
 */
function injectCdnLinks(html: string, settings: PublishSettings): string {
  const enabledCdnLinks = settings.cdnLinks.filter(cdn => cdn.enabled);
  if (enabledCdnLinks.length === 0) {
    return html;
  }

  const links: string[] = [];

  for (const cdn of enabledCdnLinks) {
    if (cdn.type === 'css') {
      links.push(`<link rel="stylesheet" href="${escapeHtml(cdn.url)}" ${cdn.integrity ? `integrity="${escapeHtml(cdn.integrity)}"` : ''} crossorigin="anonymous">`);
    } else if (cdn.type === 'js') {
      links.push(`<script src="${escapeHtml(cdn.url)}" ${cdn.integrity ? `integrity="${escapeHtml(cdn.integrity)}"` : ''} crossorigin="anonymous"></script>`);
    }
  }

  return injectIntoHead(html, links.join('\n    '));
}

/**
 * Injects head scripts into <head>
 */
function injectHeadScripts(html: string, settings: PublishSettings): string {
  const enabledHeadScripts = settings.headScripts.filter(script => script.enabled);
  if (enabledHeadScripts.length === 0) {
    return html;
  }

  const scripts: string[] = [];

  for (const script of enabledHeadScripts) {
    if (script.type === 'inline') {
      scripts.push(`<script>\n${script.content}\n</script>`);
    } else if (script.type === 'external') {
      scripts.push(`<script src="${escapeHtml(script.src!)}" ${script.async ? 'async' : ''} ${script.defer ? 'defer' : ''}></script>`);
    }
  }

  return injectIntoHead(html, scripts.join('\n    '));
}

/**
 * Injects body scripts before </body>
 */
function injectBodyScripts(html: string, settings: PublishSettings): string {
  const enabledBodyScripts = settings.bodyScripts.filter(script => script.enabled);
  if (enabledBodyScripts.length === 0) {
    return html;
  }

  const scripts: string[] = [];

  for (const script of enabledBodyScripts) {
    if (script.type === 'inline') {
      scripts.push(`<script>\n${script.content}\n</script>`);
    } else if (script.type === 'external') {
      scripts.push(`<script src="${escapeHtml(script.src!)}" ${script.async ? 'async' : ''} ${script.defer ? 'defer' : ''}></script>`);
    }
  }

  const bodyCloseTag = '</body>';
  const bodyCloseIndex = html.lastIndexOf(bodyCloseTag);

  if (bodyCloseIndex === -1) {
    // No </body> tag, append at the end
    return html + '\n' + scripts.join('\n') + '\n';
  }

  return (
    html.slice(0, bodyCloseIndex) +
    '    ' + scripts.join('\n    ') + '\n' +
    html.slice(bodyCloseIndex)
  );
}

/**
 * Helper to inject content into <head>
 */
function injectIntoHead(html: string, content: string): string {
  const headCloseTag = '</head>';
  const headCloseIndex = html.indexOf(headCloseTag);

  if (headCloseIndex === -1) {
    // No </head> tag, try to inject after <head> or at the beginning
    const headOpenTag = '<head>';
    const headOpenIndex = html.indexOf(headOpenTag);
    if (headOpenIndex !== -1) {
      return (
        html.slice(0, headOpenIndex + headOpenTag.length) +
        '\n    ' + content + '\n' +
        html.slice(headOpenIndex + headOpenTag.length)
      );
    }
    // No <head> at all, prepend
    return content + '\n' + html;
  }

  return (
    html.slice(0, headCloseIndex) +
    '    ' + content + '\n' +
    html.slice(headCloseIndex)
  );
}

/**
 * Inject analytics tracking script (if enabled and provider is builtin)
 */
function injectAnalytics(html: string, deploymentId: string, settings: PublishSettings): string {
  if (!settings.analytics.enabled || settings.analytics.provider !== 'builtin') {
    return html;
  }

  // Get analytics config with token and features
  const { analytics } = settings;
  const trackingOptions = {
    deploymentId: deploymentId,
    token: analytics.token,
    features: {
      basicTracking: analytics.features?.basicTracking !== false, // Default to true
      heatmaps: analytics.features?.heatmaps === true,
      sessionRecording: analytics.features?.sessionRecording === true,
      performanceMetrics: analytics.features?.performanceMetrics === true,
      engagementTracking: analytics.features?.engagementTracking === true,
      customEvents: analytics.features?.customEvents === true,
    },
  };

  // If compliance is enabled and blocks analytics, wrap in consent check
  if (settings.compliance.enabled && settings.compliance.blockAnalytics) {
    const wrappedScript = `
<script>
if (!window.oswAnalyticsBlocked) {
  ${generateTrackingScript(trackingOptions).replace(/<\/?script>/g, '')}
}
</script>
    `.trim();

    return injectBeforeBodyClose(html, wrappedScript);
  }

  // Otherwise, inject directly
  const trackingScript = generateTrackingScript(trackingOptions);
  return injectBeforeBodyClose(html, trackingScript);
}

/**
 * Inject compliance/consent banner (if enabled)
 */
function injectComplianceBanner(html: string, deploymentId: string, settings: PublishSettings): string {
  if (!settings.compliance.enabled) {
    return html;
  }

  const banner = generateConsentBanner({
    deploymentId,
    compliance: settings.compliance,
  });

  return injectBeforeBodyClose(html, banner);
}

/**
 * Helper to inject content before </body>
 */
function injectBeforeBodyClose(html: string, content: string): string {
  const bodyCloseTag = '</body>';
  const bodyCloseIndex = html.lastIndexOf(bodyCloseTag);

  if (bodyCloseIndex === -1) {
    // No </body> tag, append at the end
    return html + '\n' + content + '\n';
  }

  return (
    html.slice(0, bodyCloseIndex) +
    content + '\n' +
    html.slice(bodyCloseIndex)
  );
}

/**
 * Inject edge function interceptor script into <head>
 * Routes fetch/form requests to edge function API endpoints
 */
function injectEdgeFunctionInterceptor(html: string, deploymentId: string): string {
  if (!deploymentId) {
    return html;
  }

  // Minified interceptor script for production
  const interceptorScript = `<script>
(function(){var s="${deploymentId}";function e(u){if(!u||typeof u!=="string")return false;if(u.startsWith("http://")||u.startsWith("https://")||u.startsWith("blob:")||u.startsWith("data:")||u.startsWith("//")||u.startsWith("#"))return false;if(u.startsWith("/api/"))return false;var p=u.split("?")[0].split("#")[0];var l=p.split("/").pop()||"";if(l.includes("."))return false;return true}function a(u){var p=u;if(!p.startsWith("/"))p="/"+p;return"/api/deployments/"+s+"/functions"+p}var f=window.fetch;window.fetch=function(i,o){var u=typeof i==="string"?i:i.url;if(e(u))return f(a(u),o);return f(i,o)};var X=window.XMLHttpRequest;window.XMLHttpRequest=function(){var x=new X();var op=x.open;x.open=function(m,u){if(e(u))return op.call(this,m,a(u));return op.apply(this,arguments)};return x};document.addEventListener("submit",function(ev){var fm=ev.target;if(!(fm instanceof HTMLFormElement))return;var ac=fm.getAttribute("action")||"";if(!e(ac))return;ev.preventDefault();var m=(fm.method||"POST").toUpperCase();var fd=new FormData(fm);var d={};fd.forEach(function(v,k){d[k]=v});fetch(a(ac),{method:m,headers:{"Content-Type":"application/json"},body:m!=="GET"?JSON.stringify(d):undefined}).then(function(r){return r.json().catch(function(){return r.text()})}).then(function(r){var ev=new CustomEvent("edge-function-response",{detail:{action:ac,result:r}});fm.dispatchEvent(ev);document.dispatchEvent(ev)}).catch(function(err){console.error("[Edge Function]",err);var ev=new CustomEvent("edge-function-error",{detail:{action:ac,error:err.message}});fm.dispatchEvent(ev);document.dispatchEvent(ev)})},true)})();
</script>`;

  return injectIntoHead(html, interceptorScript);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
