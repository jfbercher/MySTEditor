import { Directive, directiveOptions, directivesDefault } from "markdown-it-docutils";

// Remplace toutes les Admonitions par des MyST-like admonitions

const DEFAULT_TITLES = {
  admonition: "",
  attention: "Attention",
  caution: "Caution",
  danger: "Danger",
  error: "Error",
  important: "Important",
  hint: "Hint",
  note: "Note",
  seealso: "See Also",
  tip: "Tip",
  warning: "Warning",
};

const getBold = texte => {
  const match = texte.match(/^(?:\*\*|__)(.+?)(?:\*\*|__)$/);
  return match ? match : false;
};

/** Le seul token de bloc du corps est-il un paragraphe entièrement couvert par **gras** ? */
function extractBoldOnlyTitle(bodyTokens) {
  // bodyTokens attendu : [paragraph_open, inline, paragraph_close, ...reste]
  if (bodyTokens[0]?.type !== "paragraph_open" || bodyTokens[1]?.type !== "inline") return null;
  const title = getBold(bodyTokens[1].content);
  if (!title) return null;
  return { full: title[0], title: title[1] }; // paragraph_open, inline, paragraph_close
}


function extractHeadingTitle(bodyTokens) {
  if (bodyTokens[0]?.type !== "heading_open" || bodyTokens[1]?.type !== "inline" || bodyTokens[2]?.type !== "heading_close") return null;
  const title = bodyTokens[1].content ?? "";
  if (!title.trim()) return null;
  return {full: title, title: title, consumedCount: 3 };
}

class BaseAdmonitionV2 extends Directive {
  final_argument_whitespace = true;
  has_content = true;
  option_spec = {
    class: directiveOptions.class_option,
    name: directiveOptions.unchanged,
    open: directiveOptions.flag,
    icon: directiveOptions.unchanged, // "false" pour masquer l'icône ; toute autre valeur = icône normale
  };
  
  required_arguments = 0;
  optional_arguments = 1; // Permet de capturer le titre optionnel

  title = "";
  kind = "";

  run(data) {
    const classes = data.options.class ? [...data.options.class] : [];
    const isDropdown = classes.includes("dropdown");
    const noIcon = data.options.icon == false;
    const hasOpen = data.options.open == null;


    // --- Titre ---
    let titleContent = data.args[0]; // markdown brut, pas encore parsé
    let bodyStartOffset = 0;
    let bodyText = data.body;
    let bodyMapStart = data.bodyMap[0];

    if (!titleContent) {
      const probe = this.nestedParse(data.body, data.bodyMap[0]); 
      const headingResult = extractHeadingTitle(probe); 
      const boldResult = extractBoldOnlyTitle(probe);
      const result = headingResult || boldResult;

      if (result) {
        const lines = data.body.split("\n");
        const index = lines.findIndex(line => line.includes(result.full));

        titleContent = result.title;
        bodyText = index >= 0 ? lines.slice(index + 1).join("\n") : data.body;
      } else {
        titleContent = this.title || DEFAULT_TITLES[this.kind] || "";
      }
    }

    // --- Conteneur : <details> pour dropdown, <aside> sinon ---
    const containerTag = isDropdown ? "details" : "aside";
    const openToken = this.createToken("admonition_open", containerTag, 1, {
      map: data.map,
      block: true,
      meta: { kind: this.kind },
    });
    if (classes.length) openToken.attrSet("class", classes.join(" "));
    openToken.attrJoin("class", "admonition");
    if (this.kind) openToken.attrJoin("class", this.kind);
    if (noIcon) openToken.attrJoin("class", "no-icon");
    if (isDropdown && hasOpen) openToken.attrSet("open", "");

    const newTokens = [openToken];

    // --- Titre : <summary> pour dropdown, <header> sinon ---
    const titleTag = isDropdown ? "summary" : "header";
    const titleOpen = this.createToken("admonition_title_open", titleTag, 1);
    titleOpen.attrSet("class", "admonition-title");
    newTokens.push(titleOpen);
    newTokens.push(
      this.createToken("inline", "", 0, {
        map: [data.map[0], data.map[0]],
        content: titleContent,
        children: [],
      }),
    );
    newTokens.push(this.createToken("admonition_title_close", titleTag, -1, { block: true }));

    // --- Corps ---
    const bodyTokens = this.nestedParse(bodyText, bodyMapStart);
    newTokens.push(...bodyTokens);

    newTokens.push(this.createToken("admonition_close", containerTag, -1, { block: true }));
    return newTokens;
  }
}

function makeAdmonition(kind) {
  return class extends BaseAdmonitionV2 {
    kind = kind;
  };
}

export const titledAdmonitions = {
  admonition: makeAdmonition("admonition"),
  attention: makeAdmonition("attention"),
  caution: makeAdmonition("caution"),
  danger: makeAdmonition("danger"),
  error: makeAdmonition("error"),
  important: makeAdmonition("important"),
  hint: makeAdmonition("hint"),
  note: makeAdmonition("note"),
  seealso: makeAdmonition("seealso"),
  tip: makeAdmonition("tip"),
  warning: makeAdmonition("warning"),
};

// https://github.com/executablebooks/markdown-it-docutils/blob/main/src/directives/images.ts
// figure-md seems to be a myst-parser (MyST+Sphinx) thing but the MyST project seems to be
// evolving away from Sphinx towards mystmd, so slim chance of mainlining this


const shared_option_spec = {
  alt: directiveOptions.unchanged,
  height: directiveOptions.length_or_unitless,
  width: directiveOptions.length_or_percentage_or_unitless,
  scale: directiveOptions.percentage,
  target: directiveOptions.unchanged_required,
  class: directiveOptions.class_option,
  name: directiveOptions.unchanged,
};

class FigureMd extends directivesDefault.image {
  option_spec = {
    ...shared_option_spec,
    align: directiveOptions.create_choice(["left", "center", "right"]),
    figwidth: directiveOptions.length_or_percentage_or_unitless_figure,
    figclass: directiveOptions.class_option,
  };
  has_content = true;
  required_arguments = 0;
  optional_arguments = 1;
  run(data) {
    const openToken = this.createToken("figure_open", "figure", 1, {
      map: data.map,
      block: true,
    });
    if (data.options.figclass) {
      openToken.attrJoin("class", data.options.figclass.join(" "));
    }
    if (data.options.align) {
      openToken.attrJoin("class", `align-${data.options.align}`);
    }
    if (data.options.figwidth && data.options.figwidth !== "image") {
      openToken.attrSet("width", data.options.figwidth);
    }
    let target;
    if (data.args.length > 0) {
      target = newTarget(this.state, openToken, "fig", data.args[0], data.body.trim());
      openToken.attrJoin("class", "numbered");
    }

    let captionTokens = [];
    let legendTokens = [];
    let imageToken = null;
    if (data.body) {
      imageToken = this.state.md.parseInline(data.body.split("\n")[0], this.state.env)[0].children[0];
      imageToken.map = data.map;
      if (data.options.height) {
        imageToken.attrSet("height", data.options.height);
      }
      if (data.options.width) {
        imageToken.attrSet("width", data.options.width);
      }
      if (data.options.align) {
        imageToken.attrJoin("class", `align-${data.options.align}`);
      }
      if (data.options.class) {
        imageToken.attrJoin("class", data.options.class.join(" "));
      }

      const captionSplit = data.body.split("\n\n");
      if (captionSplit.length > 1) {
        const [caption, ...legendParts] = captionSplit.slice(1);
        const legend = legendParts.join("\n\n");
        const captionMap = data.bodyMap[0] + 2;
        const openCaption = this.createToken("figure_caption_open", "figcaption", 1, {
          block: true,
        });
        if (target) {
          openCaption.attrSet("number", `${target.number}`);
        }
        const captionBody = this.nestedParse(caption, captionMap);
        const closeCaption = this.createToken("figure_caption_close", "figcaption", -1, {
          block: true,
        });
        captionTokens = [openCaption, ...captionBody, closeCaption];
        if (legend) {
          const legendMap = captionMap + caption.split("\n").length + 1;
          const openLegend = this.createToken("figure_legend_open", "", 1, {
            block: true,
          });
          const legendBody = this.nestedParse(legend, legendMap);
          const closeLegend = this.createToken("figure_legend_close", "", -1, {
            block: true,
          });
          legendTokens = [openLegend, ...legendBody, closeLegend];
        }
      }
    }
    const closeToken = this.createToken("figure_close", "figure", -1, { block: true });
    return [openToken, imageToken, ...captionTokens, ...legendTokens, closeToken];
  }
}

function newTarget(state, token, kind, label, title, silent = false) {
  const env = getDocState(state);
  const number = nextNumber(state, kind);
  const target = {
    label,
    kind,
    number,
    title,
  };
  if (!silent) {
    const meta = getNamespacedMeta(token);
    meta.target = target;
    token.attrSet("id", label);
    env.targets[label] = target;
  }
  return target;
}

function getDocState(state) {
  const env = state.env?.docutils ?? {};
  if (!env.targets) env.targets = {};
  if (!env.references) env.references = [];
  if (!env.numbering) env.numbering = {};
  if (!state.env.docutils) state.env.docutils = env;
  return env;
}

function nextNumber(state, kind) {
  const env = getDocState(state);
  if (env.numbering[kind] == null) {
    env.numbering[kind] = 1;
  } else {
    env.numbering[kind] += 1;
  }
  return env.numbering[kind];
}

function getNamespacedMeta(token) {
  const meta = token.meta?.docutils ?? {};
  if (!token.meta) token.meta = {};
  if (!token.meta.docutils) token.meta.docutils = meta;
  return meta;
}

class FigureExtended extends directivesDefault.image {
  option_spec = {
    ...shared_option_spec,
    align: directiveOptions.create_choice(["left", "center", "right"]),
    figwidth: directiveOptions.length_or_percentage_or_unitless_figure,
    figclass: directiveOptions.class_option,
    jfbclass: directiveOptions.class_option,
  };
  has_content = true;
  required_arguments = 1;   // <-- changé : l'image est maintenant un argument obligatoire
  optional_arguments = 0;   // <-- changé : plus d'argument optionnel pour le label (voir remarque plus bas)
  run(data) {
    const openToken = this.createToken("figure_open", "figure", 1, {
      map: data.map,
      block: true,
    });
    if (data.options.figclass) {
      openToken.attrJoin("class", data.options.figclass.join(" "));
    }
    if (data.options.jfbclass) {
      openToken.attrJoin("class", data.options.jfbclass.join(" "));
    }
    if (data.options.align) {
      openToken.attrJoin("class", `align-${data.options.align}`);
    }
    if (data.options.figwidth && data.options.figwidth !== "image") {
      openToken.attrSet("width", data.options.figwidth);
    }
    let target;
    if (data.options.name) {
      target = newTarget(this.state, openToken, "fig", data.options.name, data.body.trim());
      openToken.attrJoin("class", "numbered");
    }

    const imageToken = this.create_image(data);
    imageToken.map = [data.map[0], data.map[0]];
    if (data.options.height) imageToken.attrSet("height", data.options.height);
    if (data.options.width) imageToken.attrSet("width", data.options.width);
    if (data.options.align) imageToken.attrJoin("class", `align-${data.options.align}`);
    if (data.options.class) imageToken.attrJoin("class", data.options.class.join(" "));

    let captionTokens = [];
    let legendTokens = [];
    if (data.body) {
      const [caption, ...legendParts] = data.body.split("\n\n");
      const legend = legendParts.join("\n\n");
      const captionMap = data.bodyMap[0];
      const openCaption = this.createToken("figure_caption_open", "figcaption", 1, { block: true });
      if (target) openCaption.attrSet("number", `${target.number}`);
      const captionBody = this.nestedParse(caption, captionMap);
      const closeCaption = this.createToken("figure_caption_close", "figcaption", -1, { block: true });
      captionTokens = [openCaption, ...captionBody, closeCaption];
      if (legend) {
        const legendMap = captionMap + caption.split("\n").length + 1;
        const openLegend = this.createToken("figure_legend_open", "", 1, { block: true });
        const legendBody = this.nestedParse(legend, legendMap);
        const closeLegend = this.createToken("figure_legend_close", "", -1, { block: true });
        legendTokens = [openLegend, ...legendBody, closeLegend];
      }
    }
    const closeToken = this.createToken("figure_close", "figure", -1, { block: true });
    return [openToken, imageToken, ...captionTokens, ...legendTokens, closeToken];
  }
}

class Table extends Directive {
  optional_arguments = 1;
  has_content = true;
  final_argument_whitespace = true;
  run(data) {
    const tableTokens = this.nestedParse(data.body, data.map);
    let prefixTokens = [];
    let suffixTokens = [];
    if (data.args.length > 0) {
      const openToken = this.createToken("figure_open", "figure", 1, {
        map: data.map,
        block: true,
      });
      const target = newTarget(this.state, openToken, "fig", data.args[0], data.body.trim());
      openToken.attrJoin("class", "numbered");
      const openCaption = this.createToken("figure_caption_open", "figcaption", 1, {
        block: true,
      });
      openCaption.attrSet("style", "text-align: left");
      if (target) {
        openCaption.attrSet("number", `${target.number}`);
      }
      const captionBody = this.nestedParse(data.args[0], data.map[0]);
      const closeCaption = this.createToken("figure_caption_close", "figcaption", -1, {
        block: true,
      });
      prefixTokens = [openToken, openCaption, ...captionBody, closeCaption];
      suffixTokens = [this.createToken("figure_close", "figure", -1, { block: true })];
    }

    return [...prefixTokens, ...tableTokens, ...suffixTokens];
  }
}

export default {
  "figure-md": FigureMd,
  "figure-perso": FigureExtended,
  "figure": FigureExtended,
  table: Table,
  "tableau": Table,
};
