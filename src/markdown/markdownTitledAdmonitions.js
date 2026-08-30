import { directivesDefault, directiveOptions } from "markdown-it-docutils";

const admonitionKinds = ["note", "tip", "warning", "attention", "caution", "danger", "error", "important", "hint", "seealso"];

const titledAdmonitions = {};
for (const kind of admonitionKinds) {
  const Base = directivesDefault[kind];
  if (!Base) continue;

  titledAdmonitions[kind] = class extends Base {
    required_arguments = 0;
    optional_arguments = 1;
    final_argument_whitespace = true;
  };
}

const BaseAdmonitionDirective = directivesDefault.admonition;

class OpenableAdmonition extends BaseAdmonitionDirective {
  constructor(...args) {
    super(...args);
    this.option_spec = {
      class: directiveOptions.class_option,
      name: directiveOptions.unchanged,
      open: directiveOptions.flag,
    };
  }
  run(data) {
    const tokens = super.run(data);
    if (data.options.open) {
      const openToken = tokens.find((t) => t.type === "admonition_open");
      openToken?.attrJoin("class", "open");
    }
    return tokens;
  }
}

titledAdmonitions.admonition = OpenableAdmonition;



export default titledAdmonitions;