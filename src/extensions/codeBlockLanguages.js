import { python } from "@codemirror/lang-python";
import { codeBlockExtensions } from "./codeBlockExtensions";

export const codeBlockLanguages = (editorView, linter) =>
  codeBlockExtensions({
    extensions: {
      python: [python()],
      // ajoute d'autres langages ici, ex: cpp: [cpp()], rust: [rust()]
    },
    editorView,
    tooltipSources: {},
    completionSources: [],
    linter,
  });