import { load as yamlLoad } from "js-yaml";

/**
 * Extrait et parse le bloc frontmatter YAML (---...---) en tête d'un texte.
 * @param {string} fullText
 * @returns {{ frontmatter: any, endLine: number } | null}
 */
export function extractFrontmatter(fullText) {
  const lines = fullText.split("\n");
  if (lines[0]?.trim() !== "---") return null;

  let endLine = null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endLine = i;
      break;
    }
  }
  if (endLine == null) return null;

  const yamlText = lines.slice(1, endLine).join("\n");
  try {
    const frontmatter = yamlLoad(yamlText);
    return { frontmatter, endLine };
  } catch (e) {
    console.error("Failed to parse frontmatter YAML:", e);
    return null;
  }
}