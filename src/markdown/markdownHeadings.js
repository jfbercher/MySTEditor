const SECTION_LABEL_RE = /^\(([a-zA-Z][\w:-]*)\)=\s*$/;

const markdownItHeadings = (md) => {
  md.core.ruler.after("inline", "heading_numbering", (state) => {
    if (!state.env.headingMap) return;

    const labelByLine = new Map();
    const knownSectionLabels = new Set();
    if (state.env.refMap) {
      for (const [label, info] of state.env.refMap.byLabel.entries()) {
        if (info.kind !== "sec") continue;
        knownSectionLabels.add(label);
        for (const [line, hInfo] of state.env.headingMap.byLine.entries()) {
          if (hInfo.number === info.number && hInfo.text === info.title) {
            labelByLine.set(line, label);
            break;
          }
        }
      }
    }

    // Passe 1 : supprime tout paragraphe "(label)=" qui correspond à un label de section connu,
    // indépendamment de la présence du heading suivant dans ce même chunk (coupure de chunk possible pour h1-h3).
    for (let k = 0; k < state.tokens.length; k++) {
      const pOpen = state.tokens[k];
      if (pOpen.type !== "paragraph_open") continue;
      const pInline = state.tokens[k + 1];
      const pClose = state.tokens[k + 2];
      if (pInline?.type !== "inline" || pClose?.type !== "paragraph_close") continue;

      const match = pInline.content.trim().match(SECTION_LABEL_RE);
      if (!match || !knownSectionLabels.has(match[1])) continue;

      state.tokens.splice(k, 3);
      k -= 1; // pour re-tester correctement l'index k après suppression
    }

    // Passe 2 : numérotation + ancre + nettoyage du marqueur de titre, sur les heading_open restants.
    for (let k = 0; k < state.tokens.length; k++) {
      const token = state.tokens[k];
      if (token.type !== "heading_open") continue;

      const absoluteLine = token.map ? token.map[0] + state.env.startLine - (state.env.chunkId !== 0 ? 1 : 0) : null;
      if (absoluteLine == null) continue;

      const info = state.env.headingMap.byLine.get(absoluteLine);
      if (!info) continue;

      const label = labelByLine.get(absoluteLine);
      if (label) token.attrSet("id", label);

      const inlineToken = state.tokens[k + 1];
      if (!inlineToken || inlineToken.type !== "inline") continue;

      if (info.isTitle) {
        token.attrJoin("class", "myst-editor-title");
        inlineToken.children.forEach((child) => {
          if (child.type === "text") {
            child.content = child.content.replace(/\{\s*myst-editor-title\s*\}/, "").trim();
          }
        });
        continue;
      }

      if (!state.env.headingMap.active || info.number == null) continue;

      const numTok = new state.Token("html_inline", "", 0);
      numTok.content = `<span class="custom-header-num">${info.number}</span>`;
      inlineToken.children.unshift(numTok);
    }
  });
};

export default markdownItHeadings;