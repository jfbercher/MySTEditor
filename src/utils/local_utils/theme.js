// Manages the application of themes (Light / Dark) 
// in the global document as well as in the Shadow DOM of editor instances.

import { get, set } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm';
import { darkTheme, lightTheme } from "../../MystEditor.jsx";

export let mystEditorTheme = "lightTheme";

export function getThemeStylesheet(theme) {
  return theme === "lightTheme" ? lightTheme : darkTheme;
}

export function findInShadow(selector, root = document) {
  const el = root.querySelector(selector);
  if (el) return el;
  const allElements = root.querySelectorAll("*");
  for (const node of allElements) {
    if (node.shadowRoot) {
      const found = findInShadow(selector, node.shadowRoot);
      if (found) return found;
    }
  }
  return null;
}

export function makeStyleSheet(cssText) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(cssText);
  return sheet;
}


export function applyEditorTheme(editorId, theme) {
  const stylesheet = getThemeStylesheet(theme);

  // Mettre à jour la page globale
  const docSheets = [...document.adoptedStyleSheets];
  const docThemeIndex = docSheets.findIndex((sheet) => sheet === lightTheme || sheet === darkTheme);
  if (docThemeIndex >= 0) {
    docSheets[docThemeIndex] = stylesheet;
  } else {
    docSheets.push(stylesheet);
  }
  document.adoptedStyleSheets = docSheets;

  // Mettre à jour le Shadow DOM de l'éditeur ciblé
  const shadowRoot = document.getElementById(editorId)?.shadowRoot;
  if (!shadowRoot) return;

  const sheets = [...shadowRoot.adoptedStyleSheets];
  const themeIndex = sheets.findIndex((sheet) => sheet === lightTheme || sheet === darkTheme);
  if (themeIndex >= 0) {
    sheets[themeIndex] = stylesheet;
  } else {
    sheets.push(stylesheet);
  }
  shadowRoot.adoptedStyleSheets = sheets;
}

export function applyThemeToAllTabs(getAllEditorIds) {
  for (const id of getAllEditorIds()) {
    applyEditorTheme(id, mystEditorTheme);
  }
}

export async function toggleEditorTheme(getAllEditorIds) {
  mystEditorTheme = mystEditorTheme === "lightTheme" ? "darkTheme" : "lightTheme";
  await set("mystEditorTheme", mystEditorTheme);
  applyThemeToAllTabs(getAllEditorIds);
}

export async function applyThemeAtStartup(editorId) {
  const savedTheme = await get("mystEditorTheme");
  mystEditorTheme = savedTheme === "darkTheme" ? "darkTheme" : "lightTheme";
  applyEditorTheme(editorId, mystEditorTheme);
}

export function applyCodeMirrorTheme(editorId) {
  const shadowRoot = document.getElementById(editorId)?.shadowRoot;
  const cmContent = shadowRoot?.querySelector('.cm-content[contenteditable="true"]');
  if (!cmContent) return;
  const targetShadowRoot = cmContent.getRootNode();
  if (!(targetShadowRoot instanceof ShadowRoot)) return;
  if (targetShadowRoot.querySelector("#custom-cm-theme")) return;

  const styleEl = document.createElement("style");
  styleEl.id = "custom-cm-theme";
  styleEl.textContent = `
      .tok-heading { color: #0550ae !important; font-weight: 600 !important; }
      .tok-meta { color: #6e7781 !important; }
      .tok-link { color: #0969da !important; }
      .tok-url { color: #116329 !important; text-decoration: underline !important; }
      .tok-labelName { color: #8250df !important; font-weight: 600 !important; }
      .tok-keyword { color: #cf222e !important; }
      .tok-string { color: #0a3069 !important; }
      .tok-comment { color: #6e7781 !important; font-style: italic !important; }
      .tok-strong { font-weight: bold !important; }
      .tok-emphasis { font-style: italic !important; }
    `;
  targetShadowRoot.appendChild(styleEl);
}