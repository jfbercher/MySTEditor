import markdownIt from "markdown-it";
import { extractFrontmatter } from "./frontmatterUtils";


import { load as yamlLoad } from "js-yaml";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderAuthors(authors) {
  if (!authors) return "";
  const list = Array.isArray(authors) ? authors : [authors];
  const names = list.map((a) => (typeof a === "string" ? a : a?.name)).filter(Boolean).map(escapeHtml);
  if (!names.length) return "";
  return `<div class="myst-fm-authors">${names.join(", ")} </div>`;
}

function renderDate(date) {
  if (!date) return "";
  const d = new Date(date);
  const text = isNaN(d.getTime())
    ? escapeHtml(date)
    : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return `<time class="myst-fm-date" datetime="${escapeHtml(date)}">${text}</time>`;
}

function renderDoi(doi) {
  if (!doi) return "";
  const clean = String(doi).replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, "");
  const url = `https://doi.org/${clean}`;
  return `<a class="myst-fm-doi" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
}

function renderGithub(github) {
  if (!github) return "";
  const clean = String(github).replace(/^(https?:\/\/)?github\.com\//, "");
  return `<a class="myst-fm-github" href="https://github.com/${escapeHtml(clean)}" target="_blank" rel="noopener noreferrer">GitHub</a>`;
}

function renderLicense(license) {
  const text = typeof license === "string" ? license : license?.name || license?.id;
  if (!text) return "";
  return `<span class="myst-fm-license">${escapeHtml(text)}</span>`;
}

function renderVenue(venue) {
  const text = typeof venue === "string" ? venue : venue?.title;
  if (!text) return "";
  return `<span class="myst-fm-venue">${escapeHtml(text)}</span>`;
}

function renderFrontmatterHtml(fm) {
  if (!fm || typeof fm !== "object") return "";

  const badges = [renderLicense(fm.license), renderGithub(fm.github)].filter(Boolean).join(" ");
  const headerLine = [renderVenue(fm.venue), badges].filter(Boolean).join(" · ");
  const title = fm.title ? `<div class="myst-fm-title   myst-editor-title">${escapeHtml(fm.title)}</div>` : "";
  const subtitle = fm.subtitle ? `<p class="myst-fm-subtitle">${escapeHtml(fm.subtitle)}</p>` : "";
  const authors = renderAuthors(fm.authors);
  const dateDoi = [renderDate(fm.date), renderDoi(fm.doi)].filter(Boolean).join(" ");

  if (!title && !subtitle && !authors && !dateDoi && !headerLine) return "";

  return `<div class="myst-fm-block">${headerLine ? `<div class="myst-fm-header">${headerLine}</div>` : ""}${title}${subtitle}${authors}${dateDoi ? `<div class="myst-fm-date-doi">${dateDoi}</div>` : ""}</div>`;
}


export function markdownFrontmatter(/** @type {markdownIt} */ md) {
  md.block.ruler.before("hr", "frontmatter", (state, startLine, endLine, silent) => {
    if (startLine !== 0 || state.env.chunkId !== 0) return false;

    const result = extractFrontmatter(state.src);
    if (!result) return false;

    if (silent) return true;

    state.env.frontmatter = result.frontmatter;

    const html = renderFrontmatterHtml(result.frontmatter);
    if (html) {
      const token = state.push("html_block", "", 0);
      token.content = html;
      token.map = [startLine, result.endLine + 1];
    }

    state.line = result.endLine + 1;
    return true;
  });
}

