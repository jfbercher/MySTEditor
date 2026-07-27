import MarkdownIt from "markdown-it";
import { Directive, directivePlugin, Role, rolePlugin } from "markdown-it-docutils";
import { escapeRE } from "markdown-it/lib/common/utils";

/**
 * @typedef {{
 *  target: string | RegExp,
 *  transform: (input: string) => string | Promise<string>
 * }} Transform
 *
 * A transformation which will be applied to the output of `markdown-it`.
 * `transform` will be applied to all matches of `target`.
 */

/**
 * Transform results, keyed by the matched input.
 *
 * This is also how async transforms deliver their output: they resolve into the cache, which
 * notifies its listeners, and each mode then re-renders and reads the finished HTML back out.
 * Delivery is therefore identical in Preview and Inline, and nothing depends on the markup a
 * transform produced still being in the document by the time its promise settles.
 */
export class TransformCache extends Map {
  #pending = new Map();
  #listeners = new Set();

  /** @param {(input: string) => void} listener - run with each settled input. @returns {() => void} unsubscribe */
  onChange(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  clear() {
    this.#pending.clear();
    super.clear();
  }

  /** Store `promise`'s result under `input`; repeated inputs share the one in-flight promise. */
  resolve(input, promise, target) {
    if (this.#pending.has(input)) return;
    this.#pending.set(input, promise);

    promise
      .then((result) => this.set(input, result))
      .catch((err) => {
        console.error("Error in custom transform:", target, "Caused by input:", input, "Error:", err);
        // Cache the raw input so a failed transform isn't retried on every render.
        this.set(input, input);
      })
      .finally(() => {
        this.#pending.delete(input);
        this.#listeners.forEach((listener) => listener(input));
      });
  }
}

/**
 * Adds caching and async support to a transformation.
 *
 * @param {TransformCache} cache
 * @returns {(t: Transform) => Transform}
 */
const overloadTransform =
  (cache) =>
  ({ transform: originalTransform, target, ...rest }) => ({
    target,
    transform: (input, ...params) => {
      // `has`, not truthiness: a transform that legitimately resolves to "" would otherwise be
      // retried on every render, and since resolving now triggers a render, that would not settle.
      if (cache.has(input)) return cache.get(input);

      const result = originalTransform(input, ...params);
      if (typeof result?.then != "function") return result;

      // Async: leave the raw input in place for now. Resolving notifies the cache's listeners,
      // and the re-render that follows picks up the finished HTML from the cache above.
      cache.resolve(input, result, target);
      return input;
    },
    ...rest,
  });

/**
 * @param {string} txt
 * @param {Transform} transform
 */
const applyTransform = (txt, { transform, target }) => txt.replaceAll(target, transform);

/**
 * @param {Transform[]} transforms
 * @returns {function(MarkdownIt): void}
 */
const markdownReplacer = (transforms, cache) => (markdownIt) => {
  const mappedTransforms = transforms.map((t) => ({
    ...overloadTransform(cache)(t),
    /** A regular expression for a transform that only matches at the beggining of a string, useful for parsing */
    beginTarget: new RegExp(`^(?:${t.target instanceof RegExp ? t.target.source : escapeRE(t.target)})`, t.target.flags ?? "g"),
  }));

  const defaultTextRule = markdownIt.renderer.rules.text;
  markdownIt.renderer.rules.text = (...args) => mappedTransforms.reduce(applyTransform, defaultTextRule(...args));

  // This ruler entry ensures that no preexisting inline Markdown rules will be applied to any text that matches a transform.
  // The `text` rule above will handle it instead.
  markdownIt.inline.ruler.before("text", "transforms", (state, silent) => {
    const src = state.src.slice(state.pos, state.posMax);
    for (const transform of mappedTransforms) {
      /** Check if the current source fragment starts with a transform */
      const match = transform.beginTarget.exec(src);
      if (!match) continue;
      state.pos += match[0].length;
      if (silent) return true;

      const token = state.push("text", "", 0);
      token.content = src.slice(0, match[0].length);
      return true;
    }
    return false;
  });
};

/***************************** CUSTOM ROLES *****************************/

/**
 * @typedef {{
 *  target: string,
 *  transform: (input: string) => string | Promise<string>
 * }} RoleTransform
 *
 * A transformation which will be applied to the content of a MyST role specified as `target`
 */

const CUSTOM_ROLE_RULE = "custom_role";

/**
 * @param {RoleTransform}
 * @returns {{ name: string, role: Role }}
 */
const toDocutilsRole = ({ target, transform }) => {
  const DocutilsRole = class extends Role {
    run({ content }) {
      const token = new this.state.Token(CUSTOM_ROLE_RULE, "span", 1);
      token.content = transform(content);
      return [token];
    }
  };

  return { name: target, role: DocutilsRole };
};

/**
 *  @param { Transform[] } transforms
 *  @returns {function(MarkdownIt): void}
 */
const useCustomRoles = (transforms, cache) => (markdownIt) => {
  const customRoles = transforms
    .map(overloadTransform(cache))
    .map(toDocutilsRole)
    .reduce((roles, { name, role }) => {
      roles[name] = role;
      return roles;
    }, {});

  // Usually a markdownIt renderer rule would escape all html code. Here we create a rule
  // which explicitly does nothing so that all html returned by transforms is rendered.
  markdownIt.renderer.rules[CUSTOM_ROLE_RULE] = (tokens, idx, options, env, self) =>
    `<span ${self.renderAttrs(tokens[idx])}>${tokens[idx].content}</span>`;
  markdownIt.use(rolePlugin, { roles: customRoles });
};

const CUSTOM_DIRECTIVE_RULE = "custom_directive";

const toDocutilsDirective = ({ target, transform, required_arguments = 0, optional_arguments = 0, option_spec = {} }) => {
  const DocutilsDirective = class extends Directive {
    has_content = true;
    required_arguments = required_arguments;
    optional_arguments = optional_arguments;
    option_spec = option_spec;
    run(data) {
      const token = this.createToken(CUSTOM_DIRECTIVE_RULE, "div", 1, {
        map: data.map,
        block: true,
      });
      // We should support caching and async directives
      token.content = transform(data.body + JSON.stringify(data.args) + JSON.stringify(data.options), data, this);
      return [token];
    }
  };

  return { name: target, directive: DocutilsDirective };
};

const useCustomDirectives = (transforms, cache) => (markdownIt) => {
  const customDirectives = transforms
    .map(overloadTransform(cache))
    .map(toDocutilsDirective)
    .reduce((directives, { name, directive }) => {
      directives[name] = directive;
      return directives;
    }, {});

  markdownIt.renderer.rules[CUSTOM_DIRECTIVE_RULE] = (tokens, idx, options, env, self) =>
    `<div ${self.renderAttrs(tokens[idx])}>${tokens[idx].content}</div>`;
  markdownIt.use(directivePlugin, { directives: customDirectives });
};

export { markdownReplacer, useCustomRoles, useCustomDirectives };
