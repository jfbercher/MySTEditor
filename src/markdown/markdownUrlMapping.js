import markdownIt from "markdown-it";

const mappedAttrs = ["src", "href"];

const mapToken = (token, mapFunc) => {
  for (const attrName of mappedAttrs) {
    const attr = token.attrGet(attrName);
    if (attr) token.attrSet(attrName, mapFunc(token.tag, attr));
  }
};

function markdownItMapUrls(/** @type {markdownIt} */ md, mapUrl) {
  md.core.ruler.after("inline", "map_urls", (state) => {
    for (const token of state.tokens) {
      mapToken(token, mapUrl);
      token.children?.forEach?.((c) => mapToken(c, mapUrl));
    }
  });
}

const overloadMapUrl = (cache) => (mapUrl) => (tag, url) => {
  
  if (cache.has(url)) return cache.get(url);

  const result = mapUrl(tag, url);
  if (typeof result?.then !== "function") return result;

  cache.resolve(url, result, `mapUrl:${tag}`);
  return url;
};

export { markdownItMapUrls, overloadMapUrl };
