import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { sanitize, TextManager, inlineRefreshEffect } from "../text";
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
 * Same whole-document markdown-it render as Preview, then project HTML into the editor as replace
 * widgets (one piece per block / list item). Active selection shows raw source. Uses non-block
 * replaces so cm-lines stay real — carets work on rendered lines like the old Inline path, without
 * a second markdown renderer.
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
    // Old Inline hid these; they add gaps between projected lines.
    ".cm-widgetBuffer:has(+ .cm-inline-rendered-md), .cm-inline-rendered-md + .cm-widgetBuffer": {
      display: "none",
    },
  });

  function computeBlocks(state) {
    const md = text.md.peek();
    const lineMap = new Map();
    const html = sanitize(md.render(state.doc.toString(), { lineMap, startLine: 1, chunkId: 0 }));
    const dom = new DOMParser().parseFromString(html, "text/html");
    const byLine = new Map();
    // Reverse the line map once; looking each id up in `lineMap` would rescan it per element.
    const lineOfId = new Map([...lineMap].map(([line, id]) => [id, line]));

    const minLineIn = (el, { skipNestedLists = false } = {}) => {
      let minLine = Infinity;
      const walk = (node) => {
        if (skipNestedLists && node !== el && (node.tagName === "UL" || node.tagName === "OL")) return;
        const line = lineOfId.get(node.getAttribute?.("data-line-id"));
        if (line != null) minLine = Math.min(minLine, line);
        for (const child of node.children) walk(child);
      };
      walk(el);
      return minLine;
    };

    const listDepth = (li) => {
      let depth = 0;
      for (let n = li.parentElement; n; n = n.parentElement) {
        if (n.tagName === "UL" || n.tagName === "OL") depth++;
      }
      return depth;
    };

    const addListItems = (listEl) => {
      const ordered = listEl.tagName === "OL";
      const tag = listEl.tagName.toLowerCase();
      const types = ordered ? ["decimal", "lower-alpha", "lower-roman"] : ["disc", "circle", "square"];
      let nextNum = ordered ? Number(listEl.getAttribute("start")) || 1 : 0;
      for (const li of listEl.children) {
        if (li.tagName !== "LI") continue;
        const startLine = minLineIn(li, { skipNestedLists: true });
        if (startLine === Infinity || byLine.has(startLine)) continue;

        const clone = li.cloneNode(true);
        for (const nested of [...clone.children]) {
          if (nested.tagName === "UL" || nested.tagName === "OL") nested.remove();
        }
        const depth = Math.max(1, listDepth(li));
        const listStyle = types[(depth - 1) % 3];
        const pad = `${listPadEm(depth)}em`;
        let liAttrs = "";
        if (ordered) {
          const num = li.hasAttribute("value") ? Number(li.getAttribute("value")) || nextNum : nextNum;
          nextNum = num + 1;
          liAttrs = ` value="${num}"`;
        }
        byLine.set(startLine, {
          html: `<${tag} class="cm-inline-list-item" style="list-style-type:${listStyle};padding-left:${pad}"><li${liAttrs}>${clone.innerHTML}</li></${tag}>`,
          listDepth: depth,
        });

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
      const minLine = minLineIn(el);
      if (minLine !== Infinity && !byLine.has(minLine)) byLine.set(minLine, { html: el.outerHTML, listDepth: null });
    }
    return { byLine };
  }

  function blockRanges(state) {
    const { byLine } = state.field(blocksField);
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

  /** Extra left margin so source list markers sit where the rendered bullet gutter does. */
  function sourceListMarginPx(lineText, listDepth) {
    if (!listDepth) return 0;
    const indentLen = lineText.length - lineText.trimStart().length;
    const renderedPadPx = listPadEm(listDepth) * RENDERED_FONT_PX;
    // "- "/"* "/"1. " ≈ 2 mono cells; keeps item text under rendered content and the mark in the bullet gutter.
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
      // span (not div): sits in a cm-line so the caret can live on rendered lines.
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

    // Let CM place the caret on the line; only intercept links / preview clicks / checkboxes.
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
      // Non-block replace keeps the cm-line (carets). Multi-line ranges must use block:true
      // (CM forbids non-block replaces across line breaks).
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

  // Only recomputed when TextManager.scheduleRender dispatches inlineRefreshEffect (same pipeline
  // as Preview) — never synchronously on docChanged, or every keystroke would block on a
  // whole-document render.
  const blocksField = StateField.define({
    create: computeBlocks,
    update: (value, tr) => (tr.effects.some((e) => e.is(inlineRefreshEffect)) ? computeBlocks(tr.state) : value),
  });

  const blockAt = (state, selection) => blockRanges(state).find((b) => selectionTouchesBlock(selection, b, state.doc));

  const decorationsField = StateField.define({
    create: buildDecorations,
    update: (value, tr) => {
      if (tr.effects.some((e) => e.is(inlineRefreshEffect) || e.is(focusEffect))) return buildDecorations(tr.state);
      // Typing: the projection is stale until the scheduled refresh lands, so just map the existing
      // widgets through the change. Keeps the caret responsive; content catches up a frame later.
      if (tr.docChanged) return value.map(tr.changes);
      // Selection: only the block under the cursor is shown as source, so a move within one block
      // changes nothing.
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
    const ranges = blockRanges(tr.startState);
    const prev = tr.startState.selection.main;
    const next = tr.selection.main;
    if (prev.head === next.head) return tr;

    const forward = next.head > prev.head;
    const lo = Math.min(prev.head, next.head);
    const hi = Math.max(prev.head, next.head);
    const candidates = ranges.filter((b) => {
      if (selectionTouchesBlock(tr.startState.selection, b, tr.startState.doc)) return false;
      return b.to > lo && b.from < hi;
    });
    if (candidates.length === 0) return tr;

    const closest = forward ? candidates.reduce((a, b) => (a.from <= b.from ? a : b)) : candidates.reduce((a, b) => (a.to >= b.to ? a : b));
    return {
      selection: EditorSelection.cursor(forward ? closest.from : closest.to),
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
