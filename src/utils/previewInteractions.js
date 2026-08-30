/** Handles a click in the projected preview HTML: toggle dropdown, scroll to internal anchor.
@returns {boolean} true if the event was handled (to be stopped/prevented further)
 */

import { EditorView } from "@codemirror/view";


function resolveLabelToLine(label, refMap) {
  return refMap?.byLabel?.get(label)?.line ?? null;
}

export function handlePreviewInteraction(ev, root, view, refMap, headingMap) {
  const dropdownHeader = ev.target.closest(".admonition.dropdown > header");
  if (dropdownHeader) {
    dropdownHeader.parentElement.classList.toggle("open");
    return true;
  }

  const anchorLink = ev.target.closest('a[href^="#"]');
  if (anchorLink) {
    ev.preventDefault();
    const targetId = decodeURIComponent(anchorLink.getAttribute("href").slice(1));


  if (view) {
  const lineNumber = resolveLabelToLine(targetId, refMap);
  if (lineNumber != null && lineNumber <= view.state.doc.lines) {
    const pos = view.state.doc.line(lineNumber).from;

    view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "start" }) });

    requestAnimationFrame(() => {
      const lineBlock = view.lineBlockAt(pos);
      const mystEditor = view.dom.closest("#myst-editor") ?? view.scrollDOM.parentElement;
      const scrollerRect = view.scrollDOM.getBoundingClientRect();
      const editorRect = mystEditor.getBoundingClientRect();
      const offset = scrollerRect.top - editorRect.top + mystEditor.scrollTop;

      mystEditor.scrollTo({ top: lineBlock.top + offset, behavior: "smooth" });
    });
    return true;
  }
} 

/* We move to the footnotes section at the end of the document; 
this is done in two steps, because the document isn't necessarily formatted 
yet and the destination may not be clearly marked.*/

if (targetId.startsWith("fn:") && view) {
  const mystEditor = view.dom.closest("#myst-editor") ?? view.scrollDOM.parentElement;
  mystEditor.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: "instant" });
  setTimeout(() => {
    mystEditor.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: "instant" });
  }, 100);
  return true;
}

// Fallback
    const targetEl = root?.querySelector?.(`#${CSS.escape(targetId)}`);
    targetEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }

  return false;
}