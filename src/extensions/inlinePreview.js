import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { TextManager, inlineRefreshEffect } from "../text";
import { tags } from "@lezer/highlight";
import { EditorView } from "codemirror";
import { Decoration, WidgetType } from "@codemirror/view";
import { EditorSelection, EditorState, StateEffect, StateField, Transaction } from "@codemirror/state";

const focusEffect = StateEffect.define();

/** Matches Preview/Inline list padding: 1.25em + 1.5em per nesting level below the first. */
const listPadEm = (depth) => 1.25 + (Math.max(1, depth) - 1) * 1.5;
/** Lato size used for rendered inline widgets / Preview. */
const RENDERED_FONT_PX = 16;
/** Historical mono advance used to align markdown indent with rendered list gutters. */
const MONO_CHAR_WIDTH_PX = 8.43333;

/**
 * Project TextManager's cached Preview chunks into CM replace widgets. No second markdown-it pass —
 * scheduleRender updates chunks first, then dispatches inlineRefreshEffect. Softbroken paragraphs /
 * list items become one widget per source line so carets stay non-block.
 */
export const inlinePreview = (/** @type {TextManager} */ text, options) => {
  const previewFont = "Lato";
  const baseFont = { fontFamily: previewFont, lineHeight: "1.3em" };
  const baseHeading = { fontWeight: "bold", lineHeight: 1.5, fontFamily: previewFont };
  const markdownHighlightStyle = HighlightStyle.define([
    { tag: tags.heading1, ...baseHeading, fontSize: "1.8em" },
    { tag: tags.heading2, ...baseHeading, fontSize: "1.5em" },
    { tag: tags.heading3, ...baseHeading, fontSize: "1.25em" },
    { tag: tags.heading4, ...baseHeading, fontSize: "1.15em" },
    { tag: [tags.link, tags.url], ...baseFont, textDecoration: "underline", color: "var(--accent-dark)" },
    { tag: tags.macroName, ...baseFont, color: "var(--accent-dark)" },
    { tag: tags.emphasis, ...baseFont, fontStyle: "italic" },
    { tag: tags.strong, ...baseFont, fontWeight: "bold" },
    { tag: tags.strikethrough, ...baseFont, textDecoration: "line-through" },
    { tag: [tags.monospace, tags.atom], ...baseFont, fontFamily: "monospace" },
    { tag: [tags.content], ...baseFont },
    { tag: tags.meta, color: "darkgrey" },
  ]);
  const markdownTheme = EditorView.theme({
    "&": { fontSize: "16px" },
    ".cm-widgetBuffer:has(+ .cm-inline-rendered-md), .cm-inline-rendered-md + .cm-widgetBuffer": {
      display: "none",
    },
  });

  const minLineIn = (lineOfId, el, { skipNestedLists = false } = {}) => {
    let minLine = Infinity;
    const walk = (node) => {
      if (skipNestedLists && node !== el && (node.tagName === "UL" || node.tagName === "OL")) return;
      const line = lineOfId.get(node.getAttribute?.("data-line-id"));
      if (line != null) minLine = Math.min(minLine, line);
      for (const child of node.children || []) walk(child);
    };
    walk(el);
    return minLine;
  };

  /** Split on <br> (markdown-it softbreaks) so each source line can be a non-block widget. */
  const softbreakParts = (lineOfId, el) => {
    const parts = [];
    let part = { line: Infinity, nodes: [] };
    const flush = () => {
      if (part.nodes.length) parts.push(part);
      part = { line: Infinity, nodes: [] };
    };
    for (const child of [...el.childNodes]) {
      if (child.nodeName === "BR") {
        flush();
        continue;
      }
      if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) continue;
      const line = child.nodeType === Node.ELEMENT_NODE ? minLineIn(lineOfId, /** @type {Element} */ (child)) : Infinity;
      if (line !== Infinity) part.line = Math.min(part.line, line);
      part.nodes.push(child);
    }
    flush();
    return parts.filter((p) => p.line !== Infinity);
  };

  const wrapNodes = (el, nodes) => {
    const wrap = document.createElement(el.tagName);
    for (const attr of el.attributes || []) {
      if (attr.name === "data-line-id") continue;
      wrap.setAttribute(attr.name, attr.value);
    }
    for (const n of nodes) wrap.appendChild(n.cloneNode(true));
    return wrap.outerHTML;
  };

  /** Project Preview chunk HTML → start-line widget map (uses TextManager.lineMap). */
  function projectHtml(html, lineMap) {
    const dom = new DOMParser().parseFromString(html, "text/html");
    const byLine = new Map();
    const lineOfId = new Map([...lineMap].map(([line, id]) => [id, line]));

    const listDepthOf = (li) => {
      let depth = 0;
      for (let n = li.parentElement; n; n = n.parentElement) {
        if (n.tagName === "UL" || n.tagName === "OL") depth++;
      }
      return depth;
    };

    const addSoftbroken = (contentEl, depth, toHtml) => {
      // List items often wrap text in a single <p>; split that for per-line widgets.
      let el = contentEl;
      if (el.tagName === "LI") {
        const kids = [...el.children].filter((c) => c.tagName !== "UL" && c.tagName !== "OL");
        if (kids.length === 1 && kids[0].tagName === "P") el = kids[0];
      }
      const parts = softbreakParts(lineOfId, el);
      if (parts.length <= 1) {
        const startLine = parts[0]?.line ?? minLineIn(lineOfId, contentEl, { skipNestedLists: true });
        if (startLine === Infinity || byLine.has(startLine)) return;
        byLine.set(startLine, { html: toHtml([...el.childNodes]), listDepth: depth });
        return;
      }
      for (const part of parts) {
        if (!byLine.has(part.line)) byLine.set(part.line, { html: toHtml(part.nodes), listDepth: depth });
      }
    };

    const addListItems = (listEl) => {
      const ordered = listEl.tagName === "OL";
      const tag = listEl.tagName.toLowerCase();
      const types = ordered ? ["decimal", "lower-alpha", "lower-roman"] : ["disc", "circle", "square"];
      let nextNum = ordered ? Number(listEl.getAttribute("start")) || 1 : 0;
      for (const li of listEl.children) {
        if (li.tagName !== "LI") continue;
        const clone = li.cloneNode(true);
        for (const nested of [...clone.children]) {
          if (nested.tagName === "UL" || nested.tagName === "OL") nested.remove();
        }
        const depth = Math.max(1, listDepthOf(li));
        const listStyle = types[(depth - 1) % 3];
        const pad = `${listPadEm(depth)}em`;
        let liAttrs = "";
        if (ordered) {
          const num = li.hasAttribute("value") ? Number(li.getAttribute("value")) || nextNum : nextNum;
          nextNum = num + 1;
          liAttrs = ` value="${num}"`;
        }
        const toHtml = (nodes) => {
          const tmp = document.createElement("div");
          for (const n of nodes) tmp.appendChild(n.cloneNode(true));
          return `<${tag} class="cm-inline-list-item" style="list-style-type:${listStyle};padding-left:${pad}"><li${liAttrs}>${tmp.innerHTML}</li></${tag}>`;
        };
        addSoftbroken(clone, depth, toHtml);
        for (const nested of li.children) {
          if (nested.tagName === "UL" || nested.tagName === "OL") addListItems(nested);
        }
      }
    };

    for (const el of dom.body.children) {
      if (el.tagName === "UL" || el.tagName === "OL") {
        addListItems(el);
        continue;
      }
      if (el.tagName === "P" || /^H[1-6]$/.test(el.tagName)) {
        addSoftbroken(el, null, (nodes) => wrapNodes(el, nodes));
        continue;
      }
      const minLine = minLineIn(lineOfId, el);
      if (minLine !== Infinity && !byLine.has(minLine)) byLine.set(minLine, { html: el.outerHTML, listDepth: null });
    }
    return byLine;
  }

  function computeBlocks() {
    // Shared Preview chunk cache — renderText always refreshes chunks (DOM only when Preview/Both).
    if (!text.chunks.length) text.renderText(true, true);
    // Fingerprint the chunks' own text, not text.text.value: the blocks below are built from these
    // chunks, and a chunk can lag the signal, in which case the two describe different documents.
    const source = text.chunks.map((c) => c.text).join("");
    return {
      byLine: projectHtml(text.chunks.map((c) => c.html).join(""), text.lineMap),
      docLength: source.length,
      docLines: source.split("\n").length,
    };
  }

  /** Whether the blocks still describe `state`'s document. */
  const projectionMatches = (state) => {
    const { docLength, docLines } = state.field(blocksField);
    return docLength === state.doc.length && docLines === state.doc.lines;
  };

  function blockRanges(state) {
    const { byLine } = state.field(blocksField);
    // Stale blocks hold line numbers the document may no longer have, and doc.line() throws on those.
    if (!projectionMatches(state)) return [];
    const starts = [...byLine.keys()].sort((a, b) => a - b);
    const ranges = [];
    for (let i = 0; i < starts.length; i++) {
      const startLine = starts[i];
      let endLine = i + 1 < starts.length ? starts[i + 1] - 1 : state.doc.lines;
      while (endLine > startLine && !state.doc.line(endLine).text.trim()) endLine--;
      const block = byLine.get(startLine);
      ranges.push({
        startLine,
        endLine,
        from: state.doc.line(startLine).from,
        to: state.doc.line(endLine).to,
        html: block.html,
        listDepth: block.listDepth,
      });
    }
    return ranges;
  }

  function sourceListMarginPx(lineText, listDepth) {
    if (!listDepth) return 0;
    const indentLen = lineText.length - lineText.trimStart().length;
    const renderedPadPx = listPadEm(listDepth) * RENDERED_FONT_PX;
    const listMarkCells = 2;
    return Math.max(0, renderedPadPx - (indentLen + listMarkCells) * MONO_CHAR_WIDTH_PX);
  }

  function selectionTouchesBlock(sel, block, doc) {
    return sel.ranges.some((r) => {
      const a = doc.lineAt(r.from).number;
      const b = doc.lineAt(r.to).number;
      return a <= block.endLine && b >= block.startLine;
    });
  }

  class ProjectedWidget extends WidgetType {
    constructor(html, startLine, endLine) {
      super();
      this.html = html;
      this.startLine = startLine;
      this.endLine = endLine;
    }

    eq(widget) {
      return this.html === widget.html && this.startLine === widget.startLine && this.endLine === widget.endLine;
    }

    toDOM(view) {
      const el = document.createElement("span");
      el.className = "cm-inline-rendered-md";
      el.innerHTML = this.html;
      el.addEventListener("mousedown", (ev) => {
        if (!(ev.target instanceof Element) || ev.target.tagName !== "INPUT") return;
        ev.preventDefault();
        const line = view.state.doc.line(this.startLine);
        const statusIdx = line.text.indexOf("[") + 1;
        if (statusIdx <= 0) return;
        const from = line.from + statusIdx;
        const current = line.text.slice(statusIdx, statusIdx + 1);
        view.dispatch({
          changes: { from, to: from + 1, insert: current === " " ? "x" : " " },
          effects: focusEffect.of(true),
          userEvent: "select.pointer",
        });
        view.focus();
      });
      return el;
    }

    ignoreEvent(ev) {
      if (ev.type !== "mousedown" || !(ev.target instanceof Element)) return false;
      if (ev.target.tagName === "INPUT") return true;
      if (ev.target.tagName === "A" || ev.target.closest("a")) return true;
      return !!options.onPreviewClick.peek()?.(ev);
    }
  }

  function buildDecorations(state) {
    const focused = state.field(focusedField);
    const decorations = [];

    for (const block of blockRanges(state)) {
      if (focused && selectionTouchesBlock(state.selection, block, state.doc)) {
        for (let lineNo = block.startLine; lineNo <= block.endLine; lineNo++) {
          const line = state.doc.line(lineNo);
          const margin = sourceListMarginPx(line.text, block.listDepth);
          decorations.push(
            Decoration.line({
              class: "cm-inline-source-line",
              ...(margin ? { attributes: { style: `margin-left: ${margin}px` } } : {}),
            }).range(line.from),
          );
        }
        continue;
      }
      decorations.push(
        Decoration.replace({
          widget: new ProjectedWidget(block.html, block.startLine, block.endLine),
          block: block.startLine !== block.endLine,
        }).range(block.from, block.to),
      );
    }

    return Decoration.set(decorations);
  }

  const focusedField = StateField.define({
    create: () => false,
    update: (value, tr) => {
      for (const e of tr.effects) {
        if (e.is(focusEffect)) return e.value;
      }
      return value;
    },
  });

  const blocksField = StateField.define({
    create: computeBlocks,
    update: (value, tr) => (tr.effects.some((e) => e.is(inlineRefreshEffect)) ? computeBlocks() : value),
  });

  const blockAt = (state, selection) => blockRanges(state).find((b) => selectionTouchesBlock(selection, b, state.doc));

  const decorationsField = StateField.define({
    create: buildDecorations,
    update: (value, tr) => {
      if (tr.docChanged) return value.map(tr.changes);
      // Keep the current widgets while the blocks describe an older document: rebuilding from them
      // would drop every widget until the next render lands.
      if (!projectionMatches(tr.state)) return value;
      if (tr.effects.some((e) => e.is(inlineRefreshEffect) || e.is(focusEffect))) return buildDecorations(tr.state);
      if (!tr.selection) return value;
      const from = blockAt(tr.startState, tr.startState.selection)?.from;
      return from === blockAt(tr.state, tr.selection)?.from ? value : buildDecorations(tr.state);
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  const revealSelectedBlock = EditorState.transactionFilter.of((tr) => {
    if (!tr.selection || tr.docChanged) return tr;
    if (tr.effects.some((e) => e.is(focusEffect) && e.value === true)) return tr;
    if (!blockAt(tr.startState, tr.selection)) return tr;
    return [tr, { effects: focusEffect.of(true) }];
  });

  const enterJumpedBlock = EditorState.transactionFilter.of((tr) => {
    if (!tr.selection || tr.docChanged) return tr;
    if (tr.annotation(Transaction.userEvent) !== "select") return tr;
    const prev = tr.startState.selection.main;
    const next = tr.selection.main;
    if (prev.head === next.head) return tr;

    // Only nudge a caret that would end up *inside* a rendered block, to that block's near edge.
    // Anything else (Home/End/PageUp, or a step that lands on a boundary) must keep its destination.
    const target = blockRanges(tr.startState).find((b) => next.head > b.from && next.head < b.to);
    if (!target || selectionTouchesBlock(tr.startState.selection, target, tr.startState.doc)) return tr;

    const head = next.head > prev.head ? target.from : target.to;
    return {
      selection: next.empty ? EditorSelection.cursor(head) : EditorSelection.range(next.anchor, head),
      effects: focusEffect.of(true),
      userEvent: "select",
    };
  });

  return [
    focusedField,
    blocksField,
    decorationsField,
    revealSelectedBlock,
    enterJumpedBlock,
    syntaxHighlighting(markdownHighlightStyle),
    markdownTheme,
    EditorView.focusChangeEffect.of((_, focus) => focusEffect.of(focus)),
  ];
};
