/**
 * Site Thumbnail Generation Utility
 * Captures screenshot of published site and uploads to API
 */

import { captureIframeScreenshot, waitForResources } from './screenshot';

export interface ThumbnailCaptureOptions {
  captureWidth?: number;
  captureHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
  quality?: number;
  timeout?: number; // ms to wait for site to load
}

const DEFAULT_OPTIONS: Required<ThumbnailCaptureOptions> = {
  captureWidth: 1280,
  captureHeight: 720,
  outputWidth: 640,
  outputHeight: 360,
  quality: 0.8,
  timeout: 15000, // 15s to allow for resource waiting + render + capture + upload
};

/**
 * Capture a thumbnail of a published site and upload it via API
 * @param siteId - The site ID
 * @param siteUrl - Full URL to the published site (e.g., http://localhost:3000/sites/xxx)
 * @param options - Capture options
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export async function captureSiteThumbnail(
  siteId: string,
  siteUrl: string,
  options: ThumbnailCaptureOptions = {}
): Promise<boolean> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve) => {
    // Create hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = `${opts.captureWidth}px`;
    iframe.style.height = `${opts.captureHeight}px`;
    iframe.style.border = 'none';
    iframe.src = siteUrl;

    let timeoutId: number | null = null;
    let resolved = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (iframe.parentElement) {
        document.body.removeChild(iframe);
      }
    };

    const fail = (reason: string) => {
      if (resolved) return;
      resolved = true;
      console.error(`[Site Thumbnail] Failed: ${reason}`);
      cleanup();
      resolve(false);
    };

    const succeed = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(true);
    };

    // Timeout handler
    timeoutId = window.setTimeout(() => {
      fail(`Timeout after ${opts.timeout}ms`);
    }, opts.timeout);

    // Load handler
    iframe.onload = async () => {
      try {
        // Clear the initial load timeout - iframe loaded successfully
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        // Set a new safety timeout to cover resource waiting + capture + upload
        timeoutId = window.setTimeout(() => {
          fail('Timeout during resource wait / capture / upload');
        }, 12000);

        // Wait for fonts, images, and idle before capturing
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            await waitForResources(iframeDoc, 2500, 8000);
          } else {
            await new Promise(r => setTimeout(r, 2500));
          }
        } catch {
          await new Promise(r => setTimeout(r, 2500));
        }

        const screenshot = await captureIframeScreenshot(
          iframe,
          opts.captureWidth,
          opts.captureHeight,
          opts.outputWidth,
          opts.outputHeight,
          opts.quality,
          false // Viewport-only capture for thumbnails
        );

        if (!screenshot) {
          fail('Screenshot capture returned null');
          return;
        }

        // Upload to API
        const response = await fetch(`/api/sites/${siteId}/thumbnail`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            previewImage: screenshot,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }));
          fail(`API error: ${error.error || response.statusText}`);
          return;
        }

        succeed();
      } catch (error) {
        fail(`Capture error: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    iframe.onerror = () => {
      fail('Failed to load site in iframe');
    };

    // Add to DOM
    document.body.appendChild(iframe);
  });
}
