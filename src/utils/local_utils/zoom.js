// Exported as a function
export const isTauri = () => typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
// --- Zoom Management (Tauri Only) ---

let currentZoom = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

let tauriWebview = null;

/**
 * Lazy-loads and caches the Tauri Webview instance
 * @returns {Promise<Object|null>}
 */
async function getTauriWebview() {
  if (tauriWebview) return tauriWebview;
  if (!isTauri()) return null;

  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    tauriWebview = getCurrentWebview();
    return tauriWebview;
  } catch (err) {
    console.error("Failed to initialize Tauri webview instance:", err);
    return null;
  }
}

/**
 * Sets webview zoom factor within min/max bounds
 * @param {number} value 
 */
export async function setZoom(value) {
  const webview = await getTauriWebview();
  if (!webview) return; // Zoom is disabled in Web mode

  // Clamp zoom value between MIN_ZOOM and MAX_ZOOM
  currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

  try {
    await webview.setZoom(currentZoom);
    console.log(`Tauri zoom level set to: ${currentZoom.toFixed(1)}`);
  } catch (err) {
    console.error("Failed to set webview zoom level:", err);
  }
}

export async function zoomIn() {
  await setZoom(currentZoom + ZOOM_STEP);
}

export async function zoomOut() {
  await setZoom(currentZoom - ZOOM_STEP);
}

export async function resetZoom() {
  await setZoom(1.0);
}

/**
 * Registers keyboard shortcuts for zoom (Cmd/Ctrl + '+', '-', '0') in Tauri
 */
export function initZoom() {
  if (!isTauri()) return;

  document.addEventListener("keydown", async (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier) return;

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      await zoomIn();
    } else if (event.key === "-") {
      event.preventDefault();
      await zoomOut();
    } else if (event.key === "0") {
      event.preventDefault();
      await resetZoom();
    }
  });
}

/**
 * Opens an external URL in the default system browser (Tauri) or a new tab (Web)
 * @param {string} url 
 */

export async function openExternalUrl(url) {
  if (!url) return;

  if (isTauri()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      console.log("Opened link in system browser:", url);
    } catch (err) {
      console.error("Failed to open external link (Tauri):", err);
    }
  } else {
    // Web mode
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Global handler to capture clicks on external links
 */
/**
 * Intercepts clicks on external links before the webview navigates
 */
/**
 * Intercepts clicks on external links before the webview navigates
 */
export function initExternalLinkHandler() {
  console.log("Initializing external link handler...");

  window.addEventListener(
    "click",
    (event) => {
      // Retrouve l'élément <a> même au travers du Shadow DOM
      const path = event.composedPath ? event.composedPath() : [];
      const link = path.find((el) => el && el.tagName === "A") || event.target.closest?.("a");

      if (link) {
        const rawHref = link.getAttribute("href");

        // Ignore les ancres internes ou fonctions javascript
        if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) {
          return;
        }

        // Détecte les vrais liens externes (http, https, mailto, etc.)
        const isExternal = /^(https?:|mailto:|tel:|\/\/)/i.test(rawHref);

        if (isExternal) {
          // Bloque la navigation WebKit immédiatement
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          const fullUrl = link.href || rawHref;
          console.log("Opening external link:", fullUrl);
          openExternalUrl(fullUrl);
        }
      }
    },
    { capture: true } // Capture globale au niveau window
  );
}