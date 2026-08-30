// src/utils/headingNumbering.js
export const TITLE_MARKER = /\{\s*myst-editor-title\s*\}/;
const SECTION_LABEL_RE = /^\(([a-zA-Z][\w:-]*)\)=\s*$/;

export function numberHeadings(nodes) {
  const counters = {};

  function visit(list) {
    return list.map((node) => {
      const isTitle = node.level === 1 && TITLE_MARKER.test(node.text);
      const cleanText = node.text.replace(TITLE_MARKER, "").trim();

      let number = null;
      if (!isTitle) {
        counters[node.level] = (counters[node.level] || 0) + 1;
        Object.keys(counters).forEach((lvl) => {
          if (Number(lvl) > node.level) delete counters[lvl];
        });

        const parts = [];
        for (let l = 1; l <= node.level; l++) parts.push(counters[l] || 0);
        while (parts.length > 1 && parts[0] === 0) parts.shift();
        number = parts.join(".");
      }

      return { ...node, text: cleanText, number, isTitle, children: visit(node.children) };
    });
  }

  return visit(nodes);
}


/** Associe chaque label de section trouvé dans le texte à la ligne absolue du heading qui suit. */
export function scanSectionLabelLines(fullText) {
  const lines = fullText.split("\n");
  const labelToHeadingLine = new Map(); // label -> ligne absolue du heading (1-based)

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SECTION_LABEL_RE);
    if (!match) continue;

    const nextLine = lines[i + 1];
    if (!nextLine || !/^#{1,6}\s/.test(nextLine)) continue;

    labelToHeadingLine.set(match[1], i + 2); // ligne absolue du heading, 1-based
  }
    return labelToHeadingLine;
}

export function flattenToLineMap(nodes, fullText, map = new Map()) {
  for (const node of nodes) {
    const lineNumber = fullText.slice(0, node.pos).split("\n").length;
    map.set(lineNumber, { number: node.number, isTitle: node.isTitle, text: node.text });
    flattenToLineMap(node.children, fullText, map);
  }
  return map;
}
