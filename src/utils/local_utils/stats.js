export function computeStats(text, mdInstance) {
  const tokens = mdInstance.parse(text, {});
  const excludeOpen = ["table_open", "figure_open"];
  const excludeClose = ["table_close", "figure_close"];
  let excludeDepth = 0;
  let headingCount = 0;
  let paragraphCount = 0;
  let wordCount = 0;
  let charsWithSpaces = 0;
  let charsNoSpaces = 0;

  function collectText(token) {
    let str = "";
    if (token.type === "text" || token.type === "code_inline") str += token.content;
    if (token.children) for (const child of token.children) str += collectText(child);
    return str;
  }

  for (const token of tokens) {
    if (excludeOpen.includes(token.type)) { excludeDepth++; continue; }
    if (excludeClose.includes(token.type)) { excludeDepth--; continue; }
    if (excludeDepth > 0) continue;
    if (token.type === "heading_open") headingCount++;
    if (token.type === "paragraph_open") paragraphCount++;
    if (token.type === "inline") {
      const raw = collectText(token);
      const trimmed = raw.trim();
      if (trimmed) wordCount += trimmed.split(/\s+/).length;
      charsWithSpaces += raw.length;
      charsNoSpaces += raw.replace(/\s+/g, "").length;
    }
  }

  return { headingCount, paragraphCount, wordCount, charsWithSpaces, charsNoSpaces, lineCount: text.split(/\r?\n/).length };
}

export function showStatsPopup(editorId) {
  const text = window.myst_editor[editorId].text;
  const mdInstance = window.myst_editor[editorId].state.text.md.value;
  const stats = computeStats(text, mdInstance);

  let overlay = document.getElementById("stats-popup-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "stats-popup-overlay";
  overlay.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 9999;`;
  overlay.addEventListener("click", (ev) => { if (ev.target === overlay) overlay.remove(); });

  const box = document.createElement("div");
  box.style.cssText = `background: white; border-radius: 8px; padding: 24px 32px; min-width: 260px; font-family: sans-serif; box-shadow: 0 4px 20px rgba(0,0,0,0.2);`;
  box.innerHTML = `
    <h2 style="margin-top:0;">Text statistics</h2>
    <ul style="list-style:none; padding:0; line-height:1.8;">
      <li>Sections : <b>${stats.headingCount}</b></li>
      <li>Paragraphs: <b>${stats.paragraphCount}</b></li>
      <li>Lines: <b>${stats.lineCount}</b></li>
      <li>Words: <b>${stats.wordCount}</b></li>
      <li>Characters (with spaces): <b>${stats.charsWithSpaces}</b></li>
      <li>Characters (without spaces): <b>${stats.charsNoSpaces}</b></li>
    </ul>
    <button id="stats-popup-close" style="padding:6px 14px; cursor:pointer;">Close</button>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  box.querySelector("#stats-popup-close").addEventListener("click", () => overlay.remove());
}