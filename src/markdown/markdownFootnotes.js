const FOOTNOTE_DEF_RE = /^\[\^([^\]]+)\]:\s?(.*)$/;
const FOOTNOTE_REF_RE = /\[\^([^\]]+)\]/g;

/** Pré-scan global : repère définitions et références, numérote par ordre de première référence. */

export function scanFootnotes(fullText) {
  const lines = fullText.split("\n");
  const definitions = new Map();
  const refOrder = [];
  const refCounts = new Map(); // label -> nombre d'occurrences vues

  let currentDefLabel = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const defMatch = line.match(FOOTNOTE_DEF_RE);

    if (defMatch) {
      currentDefLabel = defMatch[1];
      definitions.set(currentDefLabel, { contentLines: [defMatch[2]], defLine: i + 1 });
      continue;
    }

    if (currentDefLabel && /^(\t| {4})/.test(line)) {
      definitions.get(currentDefLabel).contentLines.push(line.replace(/^(\t| {4})/, ""));
      continue;
    }
    if (currentDefLabel && line.trim() !== "") {
      currentDefLabel = null;
    }

    let match;
    FOOTNOTE_REF_RE.lastIndex = 0;
    while ((match = FOOTNOTE_REF_RE.exec(line))) {
      const label = match[1];
      if (!refOrder.includes(label)) refOrder.push(label);
    }
  }

  const footnoteMap = new Map();
  refOrder.forEach((label, idx) => {
    const def = definitions.get(label);
    footnoteMap.set(label, {
      number: idx + 1,
      content: def ? def.contentLines.join(" ").trim() : "",
      occurrence: 0, // compteur mutable, incrémenté au fil du rendu (voir plus bas)
    });
  });

  return { footnoteMap };
}

export function markdownItFootnoteRefs(md) {
  md.inline.ruler.before("text", "footnote_ref_custom", (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x5b) return false;
    if (state.src.charCodeAt(state.pos + 1) !== 0x5e) return false;

    const match = /^\[\^([^\]]+)\]/.exec(state.src.slice(state.pos));
    if (!match) return false;

    const label = match[1];
    const info = state.env.footnoteMap?.get(label);
    if (!info) return false;

    if (silent) return true;

    info.occurrence += 1;
    const refId = info.occurrence === 1 ? `fnref:${label}` : `fnref:${label}-${info.occurrence}`;

    const token = state.push("footnote_ref_html", "", 0);
    const preview = info.content.replace(/"/g, "&quot;").slice(0, 200);
    token.content = `<sup id="fnref:${label}" class="footnote-ref" data-preview="fn:${label}"><a href="#fn:${label}">${info.number}</a></sup>`;

    state.pos += match[0].length;
    return true;
  });

  md.renderer.rules.footnote_ref_html = (tokens, idx) => tokens[idx].content;
}


export function markdownItFootnoteDefs(md) {
  md.block.ruler.before("paragraph", "footnote_def_skip", (state, startLine, endLine, silent) => {
    const lineText = state.src.slice(state.bMarks[startLine], state.eMarks[startLine]);
    if (!FOOTNOTE_DEF_RE.test(lineText)) return false;
    if (!state.env.footnoteMap) return false;

    if (silent) return true;

    let line = startLine + 1;
    while (line < endLine) {
      const text = state.src.slice(state.bMarks[line], state.eMarks[line]);
      if (/^(\t| {4})/.test(text) && text.trim() !== "") {
        line++;
        continue;
      }
      break;
    }

    state.line = line;
    return true;
  });
}

export function renderFootnotesSection(footnoteMap, md) {
  if (footnoteMap.size === 0) return "";

  const items = [...footnoteMap.entries()]
    .sort((a, b) => a[1].number - b[1].number)
    .map(([label, info]) => {
      const contentHtml = md.renderInline(info.content, {});
      const backrefs = [];
      for (let i = 1; i <= info.occurrence; i++) {
        const refId = i === 1 ? `fnref:${label}` : `fnref:${label}-${i}`;
        const sup = i > 1 ? `<sup>${i}</sup>` : "";
        backrefs.push(`<a href="#${refId}" class="footnote-backref">↩${sup}</a>`);
      }
      return `<li id="fn:${label}">${contentHtml} ${backrefs.join(" ")}</li>`;
    })
    .join("\n");

  return `<hr class="footnotes-sep"><section class="footnotes"><ol class="footnotes-list">${items}</ol></section>`;
}
