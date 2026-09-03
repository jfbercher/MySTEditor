import markdownIt from "markdown-it";

const mappedAttrs = ["src", "href"];

const mapToken = (token, mapFunc) => {
  // 1. Map standard key-value attributes stored in token.attrs array
  if (Array.isArray(token.attrs)) {
    for (let i = 0; i < token.attrs.length; i++) {
      const [attrName, attrValue] = token.attrs[i];
      if (mappedAttrs.includes(attrName) && attrValue) {
        token.attrs[i][1] = mapFunc(token.tag || "img", attrValue);
      }
    }
  }

  // 2. Map direct token properties used by image/figure directives
  if (token.src) {
    token.src = mapFunc("img", token.src);
    token.attrSet("src", token.src);
  }

  // 3. Process nested tokens recursively if present
  if (Array.isArray(token.children)) {
    for (const child of token.children) {
      mapToken(child, mapFunc);
    }
  }
};

function markdownItMapUrls(/** @type {markdownIt} */ md, mapUrl) {
  md.core.ruler.after("inline", "map_urls", (state) => {
    // Top-level AST iteration
    for (const token of state.tokens) {
      mapToken(token, mapUrl);
    }
  });
}

const overloadMapUrl = (cache) => (mapUrl) => (tag, url) => {
  if (!url) return url;

  // Return immediately if cached
  if (cache.has(url)) return cache.get(url);

  const result = mapUrl(tag, url);

  // Asynchronous branch (Web mode)
  if (typeof result?.then === "function") {
    cache.resolve(url, result, `mapUrl:${tag}`);
    return url;
  }

  // Synchronous branch (Tauri mode): force cache insertion and return result directly
  if (cache.set) {
    cache.set(url, result);
  }
  return result;
};

export { markdownItMapUrls, overloadMapUrl };