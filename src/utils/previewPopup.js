import { formatEntryFull } from "../markdown/bibliography";

let previewMapCache = null;
let previewMapForChunks = null;

// ---
const previewStateByEditor = new Map(); // editorId -> { mapCache, forChunks }

function getPreviewState(editorId) {
  if (!previewStateByEditor.has(editorId)) {
    previewStateByEditor.set(editorId, { mapCache: null, forChunks: null });
  }
  return previewStateByEditor.get(editorId);
}

function getPreviewMap(editorId, chunks) {
  const state = getPreviewState(editorId);
  if (state.mapCache && state.forChunks === chunks) return state.mapCache;
  state.mapCache = buildPreviewMap(chunks);
  state.forChunks = chunks;
  return state.mapCache;
}

export function invalidatePreviewMapCache(editorId) {
  const state = previewStateByEditor.get(editorId);
  if (state) {
    state.mapCache = null;
    state.forChunks = null;
  }
}

export function disposeEditorPreviewCache(editorId) {
  previewStateByEditor.delete(editorId);
}
// ---

function buildPreviewMap(chunks) {
  const previewMap = new Map();
  const parser = new DOMParser();

  for (const chunk of chunks) {
    if (typeof chunk.hash === "string") continue; // ignore chunks synthétiques (footnotes/bibliographie)
    const dom = parser.parseFromString(chunk.html, "text/html");
    dom.body.querySelectorAll("[id]").forEach((el) => {
      if (!previewMap.has(el.id)) previewMap.set(el.id, el.outerHTML);
    });
  }

  return previewMap;
}


function resolvePreviewHtml(id, text) {
  const editorId = text.options.id.value;
  
  if (id.startsWith("fn:")) {
    const label = id.slice(3);
    const info = text.footnoteMap?.get(label);
    const html = text.md?.value ? text.md.value.renderInline(info.content, {}) : info.content;
    return `<div class="preview-footnote">${html}</div>`;
    //return info ? `<div class="preview-footnote">${info.content}</div>` : null;
  }
  if (id.startsWith("cite:")) {
    const label = id.slice(5);
    const info = text.citeMap?.get(label);
    if (!info?.entry) return null;
    const formattedMd = formatEntryFull(info.entry, text.citationTemplate);
    const html = text.md?.value ? text.md.value.renderInline(formattedMd, {}) : formattedMd;
    return `<div class="preview-citation">${html}</div>`;
  }
  const html = getPreviewMap(editorId, text.chunks).get(id);
  return html ? `<div class="preview-generic">${html}</div>` : null;
}

let popupEl = null;
let showTimeout = null;
let hideTimeout = null;

function ensurePopupEl(root) {
  if (popupEl && popupEl.isConnected) return popupEl;
  popupEl = document.createElement("div");
  popupEl.className = "myst-preview-popup";
  popupEl.style.display = "none";
  root.appendChild(popupEl);
  return popupEl;
}

function positionPopup(popup, targetRect, root) {
  const rootRect = root.host ? root.host.getBoundingClientRect() : { top: 0, left: 0 };
  popup.style.display = "block";
  const popupRect = popup.getBoundingClientRect();

  let top = targetRect.bottom - rootRect.top + 8;
  let left = targetRect.left - rootRect.left;

  const maxLeft = (root.host?.clientWidth ?? window.innerWidth) - popupRect.width - 8;
  if (left > maxLeft) left = Math.max(8, maxLeft);

  const maxTop = (root.host?.clientHeight ?? window.innerHeight) - popupRect.height - 8;
  if (top > maxTop) top = targetRect.top - rootRect.top - popupRect.height - 8;

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
}

export function setupPreviewPopups(root, text) {
  const showDelay = 250;
  const hideDelay = 150;

  root.addEventListener("mouseover", (ev) => {
    const target = ev.target.closest?.("[data-preview]");
    if (!target) return;

    clearTimeout(hideTimeout);
    clearTimeout(showTimeout);

    showTimeout = setTimeout(() => {
      const id = target.getAttribute("data-preview");
      const html = resolvePreviewHtml(id, text);
      if (!html) return;

      const popup = ensurePopupEl(root);
      popup.innerHTML = html;
      positionPopup(popup, target.getBoundingClientRect(), root);
    }, showDelay);
  });

  root.addEventListener("mouseout", (ev) => {
    const target = ev.target.closest?.("[data-preview]");
    if (!target) return;
    // Ignore si on passe juste vers la popup elle-même ou un enfant du même lien.
    if (ev.relatedTarget && (popupEl?.contains(ev.relatedTarget) || target.contains(ev.relatedTarget))) return;

    clearTimeout(showTimeout);
    hideTimeout = setTimeout(() => {
      if (popupEl) popupEl.style.display = "none";
    }, hideDelay);
  });

  if (popupEl) {
    popupEl.addEventListener("mouseenter", () => clearTimeout(hideTimeout));
    popupEl.addEventListener("mouseleave", () => {
      hideTimeout = setTimeout(() => {
        if (popupEl) popupEl.style.display = "none";
      }, hideDelay);
    });
  }
}