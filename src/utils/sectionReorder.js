const SECTION_LABEL_RE = /^\(([a-zA-Z][\w:-]*)\)=\s*$/;

/** Position ligne (1-based) → offset caractère, début de cette ligne. */
function lineStartOffset(fullText, lineNumber) {
  const lines = fullText.split("\n");
  let offset = 0;
  for (let i = 0; i < lineNumber - 1; i++) {
    offset += lines[i].length + 1; // +1 pour le \n
  }
  return offset;
}

/** Calcule les bornes [from, to) d'un sous-arbre de heading dans le texte source. */
export function computeSectionRange(node, allHeadingsFlat, fullText) {
  const lines = fullText.split("\n");

  // Ligne de départ : recule d'un cran si un label (mon-label)= précède immédiatement.
  //let startLine = node._flatIndexLine; // ligne 1-based du heading lui-même
  let startLine = fullText.slice(0, node.pos).split("\n").length; // Chat
  const prevLine = lines[startLine - 2]; // ligne juste au-dessus (0-based)
  if (prevLine && SECTION_LABEL_RE.test(prevLine)) {
    startLine -= 1;
  }

  // Ligne de fin : juste avant le prochain heading de niveau <= node.level, n'importe où après.
  let endLine = lines.length; // par défaut, fin du document
  // const nodeIdx = allHeadingsFlat.findIndex((h) => h === node);
  const nodeIdx = allHeadingsFlat.findIndex(h => h.pos === node.pos); // Chat
  if (nodeIdx === -1) {
  throw new Error(
    `Heading not found in tree (pos=${node.pos})`
  );
}
  for (let i = nodeIdx + 1; i < allHeadingsFlat.length; i++) {
    if (allHeadingsFlat[i].level <= node.level) {
      endLine = allHeadingsFlat[i]._flatIndexLine - 1;
      // Recule aussi si CE heading suivant a lui-même un label sur la ligne précédente
      // (sinon on couperait son label en le laissant dans le bloc précédent).
      const nextPrevLine = lines[allHeadingsFlat[i]._flatIndexLine - 2];
      if (nextPrevLine && SECTION_LABEL_RE.test(nextPrevLine)) {
        endLine -= 1;
      }
      break;
    }
  }

  const from = lineStartOffset(fullText, startLine);
  const to = endLine >= lines.length ? fullText.length : lineStartOffset(fullText, endLine + 1);
  return { from, to, startLine, endLine };
}

/** Aplatit l'arbre headings.value en liste, avec la ligne 1-based de chaque nœud. */
export function flattenHeadingsWithLines(nodes, fullText, out = []) {
  for (const node of nodes) {
    const line = fullText.slice(0, node.pos).split("\n").length;
    node._flatIndexLine = line; // annotation temporaire, réutilisée par computeSectionRange
    out.push(node);
    flattenHeadingsWithLines(node.children, fullText, out);
  }
  return out;
}

/**
 * Déplace le sous-arbre `draggedNode` juste avant ou après `targetNode` (frères de même parent).
 * @param {"before"|"after"} position
 */
export function moveSectionInText(draggedNode, targetNode, position, headingsTree, fullText) {

  const flat = flattenHeadingsWithLines(headingsTree, fullText);
  const draggedRange = computeSectionRange(draggedNode, flat, fullText);
  const targetRange = computeSectionRange(targetNode, flat, fullText);
  //const draggedBlock = fullText.slice(draggedRange.from, draggedRange.to);

  let draggedBlock = fullText.slice(draggedRange.from, draggedRange.to);

  if (!draggedBlock.endsWith("\n\n")) {
    draggedBlock += "\n\n";
  }

  // On retire le bloc déplacé du texte, en travaillant sur des offsets ajustés.
  const withoutDragged = fullText.slice(0, draggedRange.from) + fullText.slice(draggedRange.to);

  // Recalcule la position d'insertion dans le texte SANS le bloc déplacé.
  let insertAt;
  if (draggedRange.from < targetRange.from) {
    // Le bloc déplacé était avant la cible : la cible a "reculé" de la taille du bloc retiré.
    const shift = draggedRange.to - draggedRange.from;
    insertAt = position === "before" ? targetRange.from - shift : targetRange.to - shift;
  } else {
    insertAt = position === "before" ? targetRange.from : targetRange.to;
  }

  let beforeInsert = withoutDragged.slice(0, insertAt);

  if ( beforeInsert.length > 0 && !beforeInsert.endsWith("\n")) {
    beforeInsert += "\n\n";
  }

  const newText = beforeInsert + draggedBlock + withoutDragged.slice(insertAt);

return newText;

}