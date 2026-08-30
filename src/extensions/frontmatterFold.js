import { foldService } from "@codemirror/language";
import { extractFrontmatter } from "../markdown/frontmatterUtils";

export const frontmatterFoldService = foldService.of((state, lineStart, lineEnd) => {
// We only suggest the fold for the very first line of the document (that of the opening “---”).
  if (lineStart !== 0) return null;

  const result = extractFrontmatter(state.doc.toString());
  if (!result) return null;

  const openLine = state.doc.line(1);
  const closeLine = state.doc.line(result.endLine + 1); // +1: endLine is 0-based (closing "---" line index)

  return { from: openLine.to, to: closeLine.to };
});