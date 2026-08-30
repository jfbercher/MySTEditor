import * as localUtils from "./utils/local_utils.js";
import MystEditor, { defaultButtons } from "./MystEditor.jsx";
import { effect } from "@preact/signals";
import { h } from "preact";

// Styles dynamiques
import codeMirrorCss from "./styles/codemirror-addition.css?inline";
import previewCss from "./styles/preview.css?inline";
import frontmatterCss from "./styles/frontmatter.css?inline";
import footnotesCss from "./styles/footnotes.css?inline";
import bibliographyCss from "./styles/biblio.css?inline";
import editorTabsCss from "./styles/editor-tabs.css?inline";
import katexCss from "katex/dist/katex.min.css?inline";

const previewStyle = localUtils.makeStyleSheet(previewCss);
const frontmatterStyle = localUtils.makeStyleSheet(frontmatterCss);
const codeMirrorStyle = localUtils.makeStyleSheet(codeMirrorCss);
const katexCssPlus = katexCss + `
.eq-numbered { position: relative; padding-right: 3em; }
.eq-number { position: absolute; right: 0; top: 50%; transform: translateY(-50%); }
.katex .eqn-num::before { content: none !important; }
`;
const katexStyle = localUtils.makeStyleSheet(katexCssPlus);
const editorTabsStyle = localUtils.makeStyleSheet(editorTabsCss);
const footnotesStyle = localUtils.makeStyleSheet(footnotesCss);
const bibliographyStyle = localUtils.makeStyleSheet(bibliographyCss);

const usercolors = ["#30bced", "#60c771", "#e6aa3a", "#cbb63e", "#ee6352", "#9ac2c9", "#8acb88", "#14b2c4"];
const urlParams = new URLSearchParams(window.location.search);
const room = urlParams.get("room") || "0";
const username = urlParams.get("username") || Math.floor(Math.random() * 1000).toString();
const color = usercolors[Math.floor(Math.random() * usercolors.length)];

const collabEnabled = !(import.meta.env.VITE_COLLAB == "OFF") && urlParams.get("collab") != "false";
const collabUrl = import.meta.env.VITE_WS_URL ?? urlParams.get("collab_server");

export function makeButtons(tab, getAllEditorIds, updateTabLabel, openFileHandleInTab) {
  const reducedButtons = [1, 2, 3, 4, 6].map((i) => defaultButtons[i]);
  return reducedButtons.concat([
    {
      text: h("span", { style: "font-size:1.5em" }, "☀︎/☾"),
      tooltip: "Toggle theme",
      action: async () => await localUtils.toggleEditorTheme(getAllEditorIds),
    },
    {
      id: "recent-files",
      text: h("span", { style: "font-size:1.5em" }, "📂"),
      tooltip: "Open a file",
      action: async () => {
        try {
          const fileHandle = await tab.selectMarkdownFile();
          if (fileHandle) await openFileHandleInTab(fileHandle);
        } catch (err) {
          if (err.name !== "AbortError") console.error("Open file error:", err);
        }
      },
      options: () => tab.getRecentFileOptions(10, openFileHandleInTab),
    },
    {
      text: h("span", { style: "font-size:1.5em" }, "📄"),
      tooltip: "New file",
      action: async () => {
        const response = await fetch("./new_file.md");
        const newFileTemplate = await response.text();
        tab.setEditorText(newFileTemplate);
        await tab.setSubtitle("a new file");
        await tab.setCurrentFile(null);
        updateTabLabel(tab.editorId);
      },
    },
    {
      id: "save-menu",
      text: h("span", { style: "font-size:1.5em" }, "💾"),
      tooltip: tab.currentFileHandle ? "Save" : "Save as...",
      // Clic direct : Sauvegarde intelligente (Save ou Save As selon l'état)
      action: async () => {
        await tab.smartSave();
      },
      // Menu déroulant au survol / clic secondaire
      options: () => [
        {
          id: "save-simple",
          text: "💾 Save",
          action: async () => {
            await tab.smartSave();
          },
        },
        {
          id: "save-as",
          text: "📝 Save as...",
          action: async () => {
            await tab.saveAs();
          },
        },
        {
          id: "save-reload",
          text: "🔄 Save and reload",
          action: async () => {
            const saved = await tab.smartSave();
            if (saved) {
              window.location.reload();
            }
          },
        },
      ],
    },
    /*{
      text: h("span", { style: "font-size:1.5em" }, "💾"),
      tooltip: "Save file as..",
      action: async () => {
        const content = window.myst_editor[tab.editorId].text;
        if ("showSaveFilePicker" in window) {
          try {
            const handle = await window.showSaveFilePicker({
              suggestedName: tab.currentFileName,
              types: [{ description: "Fichier Markdown", accept: { "text/markdown": [".md"] } }],
            });
            await tab.setCurrentFile(handle);
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            updateTabLabel(tab.editorId);
            return;
          } catch (err) {
            if (err.name === "AbortError") return;
          }
        }
        const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = tab.currentFileName;
        a.click();
        URL.revokeObjectURL(a.href);
      },
    },
    {
      id: "saveAndReload",
      text: h("span", { style: "font-size:1.5em" }, "💾↻"),
      tooltip: "Save document and reload page",
      action: async () => {
        const saved = await tab.saveCurrentDoc();
        if (saved) window.location.reload();
      },
    },
    */
    {
      id: "workingDirectory",
      text: h("span", { style: "font-size:1.5em" }, "🗃️"),
      tooltip: "Select working directory",
      action: async () => localUtils.selectWorkingFolder(),
    },
    {
      id: "autosave",
      text: h("span", { style: "font-size:1.5em" }, "📌"),
      tooltip: "Auto-save (each minute)",
      action: () => {
        const enabled = tab.toggleAutoSave();
        console.log("AutoSave:", enabled);
      },
    },
    {
      id: "stats",
      text: "📊",
      tooltip: "Text statistics",
      action: () => tab.showStatsPopup(),
    },
  ]);
}

export function mountEditor(options) {
  const { 
    editorId, 
    tab, 
    container, 
    initialContent, 
    editorOptions, 
    getAllEditorIds, 
    updateTabLabel, 
    openFileHandleInTab // <-- 1. Récupérer le paramètre ici
  } = options;
// export function mountEditor({ editorId, tab, container, initialContent, editorOptions, getAllEditorIds, updateTabLabel }) {
  MystEditor(
    {
      id: editorId,
      templatelist: "linkedtemplatelist.json",
      initialText: "",
      title: "Adapted from [MyST Editor](https://github.com/antmicro/myst-editor/)",
      subtitle: "Template for new files (new_file.md)",
      transforms: editorOptions.transforms ?? [],
      collaboration: {
        enabled: collabEnabled,
        commentsEnabled: collabEnabled,
        resolvingCommentsEnabled: collabEnabled,
        wsUrl: collabUrl ?? "#",
        username,
        room: `${room}-${editorId}`,
        color,
        mode: collabUrl ? "websocket" : "local",
      },
      getBibliographyDirectory: () => localUtils.getWorkingDirectory(),
      onReady: ({ state }) => {
        effect(async () => {
          const view = state.editorView.value;
          if (view && !tab.editorReady) {
            tab.setEditorReady(true);
            await tab.applyThemeAtStartup();

            let rawContent = null;
            const pathResult = await localUtils.loadFileFromPathParam();
            if (pathResult) {
              tab.setCurrentFilePathParam(pathResult.path);
              rawContent = pathResult.content;
            } else {
              const fileData = await tab.loadFileOnStartup();
              rawContent = fileData ? await fileData.text() : "";
            }

            if (!rawContent) {
              rawContent = initialContent;
            }

            await localUtils.loadImageFolderOnStartup();
            await localUtils.loadWorkingFolderOnStartup();

            tab.setEditorText(rawContent);
            updateTabLabel(editorId);
          }
        });
      },
      additionalStyles: [codeMirrorStyle, katexStyle, previewStyle, frontmatterStyle, footnotesStyle, bibliographyStyle],
      mapUrl: (tag, url) => (tag === "img" ? localUtils.resolveImage(url) : url),
      customRoles: editorOptions.customRoles ?? [],
      customDirectives: editorOptions.customDirectives ?? [],
      includeButtons: makeButtons(tab, getAllEditorIds, updateTabLabel, openFileHandleInTab),
      spellcheckOpts: { dict: "en_US", dictionaryPath: `${window.location.pathname}dictionaries` },
      syncScroll: true,
    },
    container,
  );
}

