import texmath from "markdown-it-texmath";
import katex from "katex";
import { getLineById } from "./markdownSourceMap";
import { scanSectionLabelLines } from "../utils/headingNumbering";


export const katexMacros = {};

// --- multitabs
const katexMacrosByEditor = new Map(); // editorId -> objet macros mutable

export function getKatexMacros(editorId) {
  if (!katexMacrosByEditor.has(editorId)) {
    katexMacrosByEditor.set(editorId, {});
  }
  return katexMacrosByEditor.get(editorId);
}

export function updateMathMacros(editorId, frontmatter) {
  const macros = getKatexMacros(editorId);
  for (const key in macros) delete macros[key];
  const mathMacros = frontmatter?.math;
  if (mathMacros && typeof mathMacros === "object") {
    Object.assign(macros, mathMacros);
  }
}

export function getMacrosSignature(editorId) {
  return JSON.stringify(getKatexMacros(editorId));
}

export function disposeEditorMacros(editorId) {
  katexMacrosByEditor.delete(editorId);
}
// ---



export function getSectionLabelsSignature(byLabel) {
  const entries = [];
  for (const [label, info] of byLabel.entries()) {
    if (info.kind === "sec") entries.push(`${label}:${info.number}:${info.title}`);
  }
  entries.sort();
  return entries.join("|");
}

function findNearestTableEntry(byLine, absoluteLine) {
  let best = null;
  let bestLine = -Infinity;
  for (const [line, entry] of byLine.entries()) {
    if (entry.kind !== "table") continue;
    if (line <= absoluteLine && line > bestLine) {
      bestLine = line;
      best = entry;
    }
  }
  return best;
}

export function getNumberingConfig(frontmatter) {
  const defaultKindLabel = {
    eq: "Equation",
    fig: "Figure",
    table: "Table",
    sec: "Section"
  };

  const numbering = frontmatter?.numbering ?? {};

  const getEntry = (singular, plural) =>
    numbering[singular] ?? numbering[plural];

  const getTemplate = (singular, plural, fallback) => {
    const entry = getEntry(singular, plural);
    return (typeof entry === "object" && entry?.template)
      ? entry.template.replace("%s", "").trim()
      : fallback;
  };

  const getEnabled = (singular, plural, fallback = true) => {
    const entry = getEntry(singular, plural);
    if (typeof entry === "boolean") return entry;
    return fallback;
  };

  return {
    kindLabel: {
      eq: getTemplate("equation", "equations", defaultKindLabel.eq),
      fig: getTemplate("figure", "figures", defaultKindLabel.fig),
      table: getTemplate("table", "tables", defaultKindLabel.table),
      sec: getTemplate("section", "sections", defaultKindLabel.sec),
    },
    numberingEnabled: {
      eq: getEnabled("equation", "equations"),
      fig: getEnabled("figure", "figures"),
      table: getEnabled("table", "tables"),
      sec: numbering.headings ?? true,
    }
  };
}

export function getKindLabel(frontmatter) {
  const defaultKindLabel = {
    eq: "Equation",
    fig: "Figure",
    table: "Table",
    sec: "Section"
  };

  const numbering = frontmatter?.numbering ?? {};

  const getTemplate = (singular, plural, fallback) => {
    const value =
      numbering[singular]?.template ??
      numbering[plural]?.template;

    return value?.replace("%s", "").trim() || fallback;
  };

  return {
    eq: getTemplate("equation", "equations", defaultKindLabel.eq),
    fig: getTemplate("figure", "figures", defaultKindLabel.fig),
    table: getTemplate("table", "tables", defaultKindLabel.table),
    sec: getTemplate("section", "sections", defaultKindLabel.sec)
  };
}

export function refDisplayText(info, state) {
  // for links references like [](#label)
  const kindLabel = state.env?.kindLabel ?? {};
  const numberingEnabled = state.env?.numberingEnabled ?? {};

  const currentLabel = kindLabel[info.kind] ?? info.kind;
  const isNumberingEnabled = numberingEnabled[info.kind] ?? true;

  // Numérotation explicitement désactivée
  if (!isNumberingEnabled) {
    return `${currentLabel} ??`;
  }

  // Pas de numéro disponible
  if (info.number == null || info.number === "") {
    return info.title + "??" || `${currentLabel} ??`;
  }

  return info.kind === "eq"
    ? `(${info.number})`
    : `${currentLabel} ${info.number}`;
}



export function scanTargets(fullText, numberingEnabled=null, headingMap = null) {
  const envs = ["equation", "align", "gather", "multline"];
  const labelRE = /\\label\{([^}]+)\}/;
  const directiveLabelRE = /^:label:\s*(\S+)/;
  const nameRE = /^:name:\s*(\S+)/;

  const byLine = new Map();
  const byLabel = new Map();

  let eqNumber = 0;
  let figNumber = 0;
  let storedNumber = 0;

  let currentLine = null;
  let mathFenceMarker = null;

  // Figures
  let inFigure = false;
  let figureFenceMarker = null;
  let figureLine = null;
  let figureLabel = null;
  let figureOptionsDone = false;
  let figureCaptionLines = [];
  let figureCaptionDone = false;
  // Tables
  let inTable = false;
  let tableFenceMarker = null;
  let tableLine = null;
  let tableLabel = null;
  let tableCaption = "";
  let tableOptionsDone = false;
  let tableNumber = 0;

  const lines = fullText.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // ---------- FIGURE ----------
    if (inFigure) {
      const closeMatch = figureFenceMarker && line.trim() === figureFenceMarker;
      if (closeMatch) {
        if (figureLabel) {
          const title = figureCaptionLines.join(" ").trim();
          const entry = byLine.get(figureLine);
          entry.label = figureLabel;
          entry.title = title;
          byLabel.set(figureLabel, { number: entry.number, kind: "fig", title, line: figureLine });
        }
        inFigure = false;
        figureFenceMarker = null;
        figureLabel = null;
        figureOptionsDone = false;
        figureCaptionLines = [];
        figureCaptionDone = false;
        continue;
      }

      if (!figureOptionsDone) {
        const nameMatch = line.match(nameRE);
        if (nameMatch) { figureLabel = nameMatch[1]; continue; }
        if (line.trim() === "") { figureOptionsDone = true; }
        else if (!/^:/.test(line)) {
          figureOptionsDone = true;
          figureCaptionLines.push(line.trim());
        }
        continue;
      }

      if (!figureCaptionDone) {
        if (line.trim() === "") figureCaptionDone = true;
        else figureCaptionLines.push(line.trim());
      }
      continue;
    }

    const figureFenceOpen = line.match(/^([`:~]{3,})\{figure[^}]*\}/);
    if (figureFenceOpen) {
      inFigure = true;
      figureFenceMarker = figureFenceOpen[1];
      figureLine = lineNo;
      figNumber++;
      storedNumber = numberingEnabled.fig ? figNumber : "??";
      byLine.set(figureLine, { number: storedNumber, label: null, kind: "fig", title: "" });
      figureOptionsDone = false;
      figureCaptionLines = [];
      figureCaptionDone = false;
      continue;
    }

    // ---------- Tables -----------

    // ---------- TABLE ----------
    if (inTable) {
      const closeMatch = tableFenceMarker && line.trim() === tableFenceMarker;
      if (closeMatch) {
        if (tableLabel) {
          const entry = byLine.get(tableLine);
          entry.label = tableLabel;
          entry.title = tableCaption;
          byLabel.set(tableLabel, { number: entry.number, kind: "table", title: tableCaption, line: tableLine });
        }
        inTable = false;
        tableFenceMarker = null;
        tableLabel = null;
        tableOptionsDone = false;
        continue;
      }

      if (!tableOptionsDone) {
        const nameMatch = line.match(nameRE);
        if (nameMatch) { tableLabel = nameMatch[1]; continue; }
        if (line.trim() === "") tableOptionsDone = true;
        continue;
      }
      continue;
    }

    const tableFenceOpen = line.match(/^([`:~]{3,})\{list-table\}(?:\s+(.*))?$/);
    if (tableFenceOpen && numberingEnabled.table) {
      inTable = true;
      tableFenceMarker = tableFenceOpen[1];
      tableCaption = (tableFenceOpen[2] || "").trim();
      tableLine = lineNo;
      tableNumber++;
      byLine.set(tableLine, { number: tableNumber, label: null, kind: "table", title: tableCaption });
      tableOptionsDone = false;
      continue;
    }

    // ---------- EQUATION ----------
      const begin = envs.some(env => line.includes(`\\begin{${env}}`));
      const end = envs.some(env => line.includes(`\\end{${env}}`));
      const dollarCount = (line.match(/\$\$/g) ?? []).length;
      const hasDollar = dollarCount > 0;
      const singleLineDollar = dollarCount >= 2;

      const mathFenceOpenMatch = !currentLine && line.match(/^([`:~]{3,})\{math\}/);
      const mathFenceCloseMatch = currentLine && mathFenceMarker && line.trim() === mathFenceMarker;

      if (!currentLine && (begin || hasDollar || mathFenceOpenMatch)) {
        currentLine = lineNo;
        if (mathFenceOpenMatch) mathFenceMarker = mathFenceOpenMatch[1];
        const inlineLabel = line.match(labelRE)?.[1] ?? null;
        eqNumber++;
        storedNumber = numberingEnabled.eq ? eqNumber : "??";
        byLine.set(currentLine, { number: storedNumber, label: inlineLabel, kind: "eq" });
        if (inlineLabel) byLabel.set(inlineLabel, { number: eqNumber, kind: "eq", title: "" });
        if (singleLineDollar) currentLine = null;
        continue;
      }

      if (!currentLine) continue;

      const label = line.match(labelRE) ?? line.match(directiveLabelRE);
      if (label) {
        byLine.get(currentLine).label = label[1];
        byLabel.set(label[1], { number: byLine.get(currentLine).number, kind: "eq", title: "", line: currentLine });
      }

      if (end || hasDollar || mathFenceCloseMatch) {
        currentLine = null;
        mathFenceMarker = null;
      }
  }


  // Sections
  /*if (headingMap?.byLine) {
    for (const info of headingMap.byLine.values()) {
      if (!info.label) continue;
      byLabel.set(info.label, {
        number: headingMap.active ? info.number : null,
        kind: "sec",
        title: info.text,
      });
    }
  }*/


// Sections par
const sectionLabelLines = scanSectionLabelLines(fullText); // label -> ligne du heading
for (const [label, headingLine] of sectionLabelLines.entries()) {
  const headingInfo = headingMap?.byLine.get(headingLine);
  if (!headingInfo) continue;
  byLabel.set(label, {
    number: headingMap.active ? headingInfo.number : null,
    kind: "sec",
    title: headingInfo.text,
    line: headingLine, 
  });
}


  const targets = {};
  for (const [label, info] of byLabel.entries()) {
    targets[label] = { label, kind: info.kind, title: info.title, number: info.number };
  }

  //console.log("headingMap reçu:", headingMap);
  //console.log("byLabel final:", byLabel); 
  //console.log("Targets found:", byLine, byLabel);
  return { byLine, byLabel, targets };
}


const markdownItMath = (md, editorId) => {
  const macros = getKatexMacros(editorId);
  md.use(texmath, {
    engine: katex,
    delimiters: ['dollars', 'brackets', 'beg_end'],
    katexOptions: { throwOnError: false, macros },
  });


/*const markdownItMath = (md) => {
  md.use(texmath, {
    engine: katex,
    delimiters: ['dollars', 'brackets', 'beg_end'], // $...$ inline, $$...$$ bloc
    outerSpace: true,
    katexOptions: {
      throwOnError: false, macros: katexMacros
    },
  });*/

  // Replace @label by Type (Equation/Figure/Table) number
  md.inline.ruler.before("text", "at_ref", (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x40 /* '@' */) return false;

    const match = /^@([a-zA-Z][\w:-]*)/.exec(state.src.slice(state.pos));
    if (!match) return false;

    const label = match[1];
    const refMap = state.env.refMap;
    if (!refMap) return false;

    const info = refMap.byLabel.get(label);
    if (!info) return false; // label inconnu : on laisse '@' intact (email, mention, etc.)

    if (silent) return true;

    const kindLabel = state.env?.kindLabel;
    const numberingEnabled = state.env?.numberingEnabled;

    // const kindLabel = { eq: "Equation", fig: "Figure", table: "Table", sec: "Section" }[info.kind] ?? info.kind;
    const currentLabel = kindLabel[info.kind] ?? info.kind;

    const linkTok = state.push("link_open", "a", 1);
    linkTok.attrSet("href", `#${label}`);
    linkTok.attrSet("data-preview", label);
    const textTok = state.push("text", "", 0);
    textTok.content = `${currentLabel} ${info.number ?? "??"}`;
    state.push("link_close", "a", -1);

    state.pos += match[0].length;
    return true;
  });


  const originalBlockRule = md.renderer.rules.math_block;

  md.renderer.rules.math_block = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  token.content = token.content.replace(/\\label\{eq:[^}]+\}\s*/g, "");

  const html = originalBlockRule(tokens, idx, options, env, self);
  if (!env.refMap) return html;
  //if (!env.numberingEnabled.eq) return html;

  let eqInfo;
  let sourceLineId = token.attrGet("data-line-id"); // conservé pour le report sur le <div>

  if (token.meta?.numbered) {
    const label = token.meta.label;
    const info = env.refMap.byLabel.get(label);
    eqInfo = info != null ? { number: info.number, label } : null;
  } else {
    const resolvedLine = sourceLineId ? getLineById(env.lineMap, sourceLineId) : null;
    eqInfo = resolvedLine != null ? env.refMap.byLine.get(resolvedLine) : null;
  }

  if (!eqInfo) return html;

    const anchorId = eqInfo.label || token.attrGet("id");
    const anchorAttr = anchorId ? ` id="${anchorId}"` : "";
    const lineIdAttr = sourceLineId ? ` data-line-id="${sourceLineId}"` : "";
    if (!env.numberingEnabled.eq) {
      return `<div ${anchorAttr}${lineIdAttr}>${html}</div>`;
    }
    else { 
    return `<div class="eq-numbered"${anchorAttr}${lineIdAttr}>${html}<span class="eq-number">(${eqInfo.number})</span></div>`;
  }
};


  const originalParagraphOpen =
    md.renderer.rules.paragraph_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
    const html = originalParagraphOpen(tokens, idx, options, env, self);

    if (!env.refMap) return html;
     if (!env.numberingEnabled.fig) return html;

    //const token = tokens[idx-1];
    //token.content = token.content.replace(/^(([a-zA-Z][\w:-]*))=\s*$/gm, "");

    const prevToken = tokens[idx - 1];
    if (!prevToken || prevToken.type !== "figure_caption_open") return html;

    let openIdx = idx - 1;
    while (openIdx >= 0 && tokens[openIdx].type !== "figure_open") openIdx--;
    if (openIdx < 0) return html;

    const figToken = tokens[openIdx];
    const id = figToken.attrGet("data-line-id");
    const resolvedLine = id ? getLineById(env.lineMap, id) : null;
    const info = resolvedLine != null ? env.refMap.byLine.get(resolvedLine) : null;
    if (!info) return html;

    return html + `<span class="fig-number">Figure ${info.number}: </span>`;
  };


  md.core.ruler.after("inline", "auto_ref", (state) => {
    if (!state.env.refMap) return;

    state.tokens.forEach((blockToken) => {
      if (blockToken.type !== "inline" || !blockToken.children) return;

      for (let i = 0; i < blockToken.children.length; i++) {
        const tok = blockToken.children[i];
        if (tok.type !== "link_open") continue;

        const href = tok.attrGet("href") || "";
        if (!href.startsWith("#")) continue;

        const label = href.slice(1);
        let info = state.env.refMap.byLabel.get(label);
        if (!info) {
          // nonexistent reference
          info = {number: "??", kind: '', title: ''}
        }//continue; // no label... 

        tok.attrSet("data-preview", label); 

        const next = blockToken.children[i + 1];
        const isEmpty = next && next.type === "link_close";

        if (isEmpty) {
          // Lien vide : on génère tout le texte, comme avant /!\ on perd le lien
          const textToken = new state.Token("text", "", 0);
          textToken.content = refDisplayText(info, state);//info.kind === "fig" ? `Figure ${info.number}` : `(${info.number})`;
          blockToken.children.splice(i + 1, 0, textToken);
          i++;
        } else if (next && next.type === "text" &&
          (next.content.includes("{number}") || next.content.includes("%s"))) {

          // Lien avec texte explicite contenant {number} ou %s :
          // on substitue le placeholder par le numéro
          next.content = next.content
            .replace(/\{number\}/g, String(info.number))
            .replace(/%s/g, String(info.number));
        }
      }
    });
  });

  const originalTableOpen =
    md.renderer.rules.table_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
    let html = originalTableOpen(tokens, idx, options, env, self);
    if (!env.refMap) return html;
     if (!env.numberingEnabled.table) return html;

    const token = tokens[idx];
    const absoluteLine = token.map ? token.map[0] + env.startLine - (env.chunkId !== 0 ? 1 : 0) : null;
    if (absoluteLine == null) return html;

    const info = findNearestTableEntry(env.refMap.byLine, absoluteLine);
    if (!info || !info.label) return html;

    // html = html.replace("<table", `<table id="${info.label}"`);
    html = html.replace("<table", `<table id="${info.label}"`);

    // Si aucune caption n'a été fournie, on en injecte une minimale nous-mêmes.
    const nextToken = tokens[idx + 1];
    if (!nextToken || nextToken.type !== "table_caption_open") {
      html += `<caption class="table-number-only">Table ${info.number}</caption>`;
    }

    return html;
  };

  const originalTableCaptionOpen =
    md.renderer.rules.table_caption_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.table_caption_open = (tokens, idx, options, env, self) => {
    const html = originalTableCaptionOpen(tokens, idx, options, env, self);
    if (!env.refMap) return html;

    let openIdx = idx;
    while (openIdx >= 0 && tokens[openIdx].type !== "table_open") openIdx--;
    if (openIdx < 0) return html;

    const tableToken = tokens[openIdx];
    const absoluteLine = tableToken.map ? tableToken.map[0] + env.startLine - (env.chunkId !== 0 ? 1 : 0) : null;
    const info = absoluteLine != null ? findNearestTableEntry(env.refMap.byLine, absoluteLine) : null;
    if (!info) return html;

    return html + `Table ${info.number}: `;
  };


  // Corrects the text displayed by {eq}label, overwritten locally by chunk (docutils internal bug)
  md.core.ruler.push("fix_ref_numbers", (state) => {
    if (!state.env.refMap) return;

    state.tokens.forEach((blockToken) => {
      if (blockToken.type !== "inline" || !blockToken.children) return;
      const children = blockToken.children;

      for (let i = 0; i < children.length; i++) {
        const tok = children[i];
        if (tok.type === "ref_open" && tok.meta?.label) {

          tok.attrSet("data-preview", tok.meta.label); // preview
          let info = state.env.refMap.byLabel.get(tok.meta.label);
          //if (!info) continue;
          let noInfo = null;
          if (!info) {
          // nonexistent reference
          noInfo = true; 
        }

          const textTok = children[i + 1];
          if (!textTok || textTok.type !== "text") continue;
          
          if (info) {
            if (tok.meta.kind === "eq") {
              textTok.content = `(${info.number})`;
            } else if (tok.meta.kind === "ref" && tok.meta.value) {
              // value contient le texte du lien à compléter par le titre
              textTok.content = tok.meta.value + ' ' + info.title
            }
            else if (tok.meta.kind === "numref" && tok.meta.value) {
              // value contient le patron "%s"/"{number}" déjà résolu localement par docutils ;
              // on le recalcule nous-mêmes avec le bon numéro global.
              textTok.content = tok.meta.value
                .replace(/%s/g, String(info.number))
                .replace(/\{number\}/g, String(info.number));
            }
          }
          else {
            textTok.content = "??";
          }
        }
      }
    });
  });
};



export default markdownItMath;