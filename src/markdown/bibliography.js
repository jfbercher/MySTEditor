import { BibtexParser } from "bibtex-js-parser";
import { readTextFile } from '@tauri-apps/plugin-fs';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

//
const bibStateByEditor = new Map(); // editorId -> { entries: [], loadedPath: null }

function getBibState(editorId) {
  if (!bibStateByEditor.has(editorId)) {
    bibStateByEditor.set(editorId, { entries: [], loadedPath: null });
  }
  return bibStateByEditor.get(editorId);
}

export function getBibEntries(editorId) {
  return getBibState(editorId).entries;
}

export function disposeEditorBibliography(editorId) {
  bibStateByEditor.delete(editorId);
}

export async function ensureBibliographyLoaded(editorId, path, getDirectoryHandle, onLoaded) {
  const state = getBibState(editorId);

  // 1. Extraire le premier élément si path est un tableau (ex: ["references.bib"])
  if (Array.isArray(path)) {
    path = path[0];
  }

  // 2. Vérifier que path est présent et de type string
  if (!path || typeof path !== 'string') {
    if (state.entries.length > 0) {
      state.entries = [];
      state.loadedPath = null;
      onLoaded?.();
    }
    return;
  }

  if (path === state.loadedPath) return;
  state.loadedPath = path;

  try {
    const dirHandle = getDirectoryHandle?.();
    if (!dirHandle) {
      console.warn("Bibliography: no working directory available yet.");
      state.loadedPath = null;
      return;
    }

    let text;
    if (isTauri) {
      // Nettoyage et construction du chemin absolu pour Tauri
      const cleanRelativePath = path.replace(/^\.?\//, '').replaceAll('\\', '/');
      const absolutePath = `${dirHandle}/${cleanRelativePath}`;
      text = await readTextFile(absolutePath);
    } else {
      const fileHandle = await dirHandle.getFileHandle(path);
      const file = await fileHandle.getFile();
      text = await file.text();
    }

    text = normalizeBibtex(text);
    text = text.replace(/\\(?!\\)/g, "\\\\");
    state.entries = BibtexParser.parseToJSON(text);
    onLoaded?.();
  } catch (err) {
    console.error("Failed to load bibliography:", path, err);
    state.entries = [];
    state.loadedPath = null;
  }
}


// --- Chargement asynchrone du fichier .bib, en cache module-level (comme katexMacros) ---

let bibEntries = [];
let loadedPath = null;



export function ensureBibliographyLoadedFetch(path, onLoaded) {
  if (!path) {
    if (bibEntries.length > 0) {
      bibEntries = [];
      loadedPath = null;
      onLoaded?.();
    }
    return;
  }
  if (path === loadedPath) return;
  loadedPath = path;

  fetch(path)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
    .then((text) => {
      bibEntries = BibtexParser.parseToJSON(text);
      onLoaded?.();
    })
    .catch((err) => {
      console.error("Failed to load bibliography:", path, err);
      bibEntries = [];
      loadedPath = null;
    });
}

// --- Nettoyage / parsing des champs BibTeX ---

function cleanField(value) {
  if (!value) return "";
  return String(value)
    .replace(/[{}]/g, "")
    .replace(/\\&/g, "&")
    .trim();
}
/* bibtex-js-parser is very sensitive and requires that the last field 
of an entry ends with a comma. */
function normalizeBibtex(text) {
  return text
    .split("\n")
    .map(line => {
      if (/^\s*\w+\s*=/.test(line) && !line.trim().endsWith(",")) {
        return line + ",";
      }
      return line;
    })
    .join("\n");
}

/** "Chomsky, Noam and Herman, Edward S." -> [{family, given}, ...] */
function parseAuthors(authorField) {
  const raw = cleanField(authorField);
  if (!raw) return [];
  return raw.split(/\s+and\s+/i).map((name) => {
    name = name.trim();
    if (name.includes(",")) {
      const [family, given] = name.split(",").map((s) => s.trim());
      return { family, given: given || "" };
    }
    const parts = name.split(/\s+/);
    const family = parts.pop();
    return { family, given: parts.join(" ") };
  });
}

function initials(given) {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + ".")
    .join(" ");
}

function toEntry(bibItem) {
  const authors = parseAuthors(bibItem.author);
  return {
    key: bibItem.id,
    type: bibItem.type,
    authors,
    year: cleanField(bibItem.year) || "n.d.",
    title: cleanField(bibItem.title),
    container: cleanField(bibItem.journal || bibItem.booktitle),
    publisher: cleanField(bibItem.publisher),
    volume: cleanField(bibItem.volume),
    pages: cleanField(bibItem.pages),
    doi: cleanField(bibItem.doi),
    url: cleanField(bibItem.url),
  };
}

function entryByKey(entries, key) {
  const found = entries.find((e) => e.id?.toLowerCase() === key.toLowerCase());
  return found ? toEntry(found) : null;
}

// --- Formatage des auteurs pour la citation inline (style author-year) ---

function inlineAuthorNames(authors) {
  if (authors.length === 0) return "?";
  if (authors.length === 1) return authors[0].family;
  if (authors.length === 2) return `${authors[0].family} & ${authors[1].family}`;
  return `${authors[0].family} et al.`;
}

// --- Formatage complet d'une entrée pour la section bibliographie ---

const DEFAULT_TEMPLATE = "{authors} ({year}). *{title}*. {container}{volume}{pages}.{doilink}";

export function formatEntryFull(entry, template = DEFAULT_TEMPLATE) {
  const authorsStr = entry.authors.length
    ? entry.authors.map((a) => `${a.family}, ${initials(a.given)}`).join(", ")
    : "";

  const volumeStr = entry.volume ? `, ${entry.volume}` : "";
  const pagesStr = entry.pages ? `, ${entry.pages}` : "";
  const containerStr = entry.container || (!entry.container && entry.publisher ? entry.publisher : "");
  const doilinkStr = entry.doi
    ? ` [${entry.doi}](https://doi.org/${entry.doi})`
    : entry.url
      ? ` [${entry.url}](${entry.url})`
      : "";

  let out = template
    .replace(/\{authors\}/g, authorsStr)
    .replace(/\{year\}/g, entry.year)
    .replace(/\{title\}/g, entry.title || "")
    .replace(/\{container\}/g, containerStr)
    .replace(/\{volume\}/g, volumeStr)
    .replace(/\{pages\}/g, pagesStr)
    .replace(/\{doilink\}/g, doilinkStr)
    .replace(/\s+\./g, ".") // nettoyage : espace(s) avant un point final résiduel
    .replace(/\.\.+/g, "."); // évite les doubles points si un champ est vide

  return out;
}


// --- Pré-scan global : repère les citations [@key] / [@key1; @key2], numérote ---

const CITE_GROUP_RE = /\[(@[^\]]+)\]/g;
const CITE_KEY_RE = /@([a-zA-Z][\w:-]*)/g;

export function scanCitations(fullText, bibEntries, style) {
  const citeMap = new Map(); // key -> { number, entry, occurrence }
  const citeOrder = [];

  let match;
  CITE_GROUP_RE.lastIndex = 0;
  while ((match = CITE_GROUP_RE.exec(fullText))) {
    const group = match[1];
    let keyMatch;
    CITE_KEY_RE.lastIndex = 0;
    while ((keyMatch = CITE_KEY_RE.exec(group))) {
      const key = keyMatch[1];
      if (!citeOrder.includes(key)) citeOrder.push(key);
    }
  }

  const sortedForBiblio =
    style === "author-year"
      ? [...citeOrder].sort((a, b) => {
          const ea = entryByKey(bibEntries, a);
          const eb = entryByKey(bibEntries, b);
          const na = ea?.authors[0]?.family || a;
          const nb = eb?.authors[0]?.family || b;
          return na.localeCompare(nb);
        })
      : citeOrder;

  const numberByKey = new Map(citeOrder.map((key, idx) => [key, idx + 1]));

  citeOrder.forEach((key) => {
    const entry = entryByKey(bibEntries, key);
    citeMap.set(key, {
      number: numberByKey.get(key),
      biblioIndex: sortedForBiblio.indexOf(key) + 1,
      entry,
      occurrence: 0,
    });
  });

  return { citeMap, sortedForBiblio };
}

// --- Règle inline : [@key] / [@key1; @key2] ---

export function markdownItCitations(md) {
  md.inline.ruler.before("text", "citation_custom", (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x5b /* [ */) return false;
    const match = /^\[(@[^\]]+)\]/.exec(state.src.slice(state.pos));
    if (!match) return false;

    const citeMap = state.env.citeMap;
    if (!citeMap) return false;

    const keys = [...match[1].matchAll(/@([a-zA-Z][\w:-]*)/g)].map((m) => m[1]);
    const knownKeys = keys.filter((k) => citeMap.has(k));
    if (knownKeys.length === 0) return false;

    if (silent) return true;

    const style = state.env.citationStyle || "numeric";
    /*const parts = knownKeys.map((key) => {
      const info = citeMap.get(key);
      info.occurrence += 1;
      const refId = info.occurrence === 1 ? `citeref:${key}` : `citeref:${key}-${info.occurrence}`;

      const label =
        style === "author-year" && info.entry
          ? `${inlineAuthorNames(info.entry.authors)}, ${info.entry.year}`
          : String(info.number);

      return `<a id="${refId}" href="#cite:${key}" class="citation-ref">${label}</a>`;
    });*/
    const parts = knownKeys.map((key) => {
      const info = citeMap.get(key);
      info.occurrence += 1;
      const refId = info.occurrence === 1 ? `citeref:${key}` : `citeref:${key}-${info.occurrence}`;

      const label =
        !info.entry
          ? "??"
          : style === "author-year"
            ? `${inlineAuthorNames(info.entry.authors)}, ${info.entry.year}`
            : String(info.number);
            

      const preview = info.entry ? formatEntryFull(info.entry).replace(/<[^>]+>/g, "").replace(/"/g, "&quot;") : "";
      const titleAttr = preview ? ` title="${preview}"` : "";
      const previewAttr = ` data-preview="cite:${key}"`;

      //return `<a id="${refId}" href="#cite:${key}" class="citation-ref"${titleAttr}${previewAttr}>${label}</a>`;
      return `<a id="${refId}" href="#cite:${key}" class="citation-ref"${previewAttr}>${label}</a>`;
    });

    const token = state.push("citation_html", "", 0);
    const wrapper = style === "numeric" ? ["[", "]"] : ["(", ")"];
    //token.content = `<sup class="citation-group">${wrapper[0]}${parts.join("; ")}${wrapper[1]}</sup>`;
    token.content = `<span class="citation-group">${wrapper[0]}${parts.join("; ")}${wrapper[1]}</span>`;


    state.pos += match[0].length;
    return true;
  });

  md.renderer.rules.citation_html = (tokens, idx) => tokens[idx].content;
}

// --- Marqueur bloc [bibliography] : remplacé in situ par la section formatée ---

export function markdownItBibliographyMarker(md) {
  md.block.ruler.before("paragraph", "bibliography_marker", (state, startLine, endLine, silent) => {
    const lineText = state.src.slice(state.bMarks[startLine], state.eMarks[startLine]).trim();
    if (lineText !== "[bibliography]") return false;
    if (!state.env.citeMap) return false;

    if (silent) return true;

    const token = state.push("html_block", "", 0);
    token.content = renderBibliographySection(state.env.citeMap, state.env.citationStyle, state.env.citationTemplate, md);
    token.map = [startLine, startLine + 1];
    state.env.bibliographyMarkerFound = true;

    state.line = startLine + 1;
    return true;
  });
}

// --- Rendu de la section bibliographie ---

export function renderBibliographySection(citeMap, style, template, md) {
  if (!citeMap || citeMap.size === 0) return "";

  const entries = [...citeMap.entries()].filter(([, info]) => info.entry);
  entries.sort((a, b) => a[1].biblioIndex - b[1].biblioIndex);

  const items = entries
    .map(([key, info]) => {
      const backrefs = [];
      for (let i = 1; i <= info.occurrence; i++) {
        const refId = i === 1 ? `citeref:${key}` : `citeref:${key}-${i}`;
        const sup = i > 1 ? `<sup>${i}</sup>` : "";
        //backrefs.push(`<a href="#${refId}" class="citation-backref">↩↩️${sup}</a>`);
        backrefs.push(`<a href="#${refId}" class="citation-backref">↩️${sup}</a>`);
      }
      const numberPrefix = style === "numeric" ? `${info.number}. ` : "";
      const formattedMd = formatEntryFull(info.entry, template);

      const formattedHtml = md ? md.renderInline(formattedMd, {}) : formattedMd;
      return `<li id="cite:${key}">${numberPrefix}${formattedHtml} ${backrefs.join(" ")}</li>`;
    })
    .join("\n");

  return `<hr class="bib-sep"><section class="bibliography"><h3>Bibliography</h3><ol class="bib-list">${items}</ol></section>`;
}
