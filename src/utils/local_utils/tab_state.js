// Gère l'état et la manipulation d'un onglet ou d'un fichier ouvert.
import { get, set, del } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm';
import { applyThemeAtStartup, applyCodeMirrorTheme } from './theme.js';
import { showStatsPopup } from './stats.js';
import { config } from "../../config.js";

import { 
  workingDirectory, 
  getRecentFileHandles, 
  addRecentFileHandle, 
  saveFileToPathParam, 
  loadFileFromPathParam 
} from './fs.js';

export function createTabState(editorId, onFileChanged) {
  let activeWorkingDir = workingDirectory;

  const tab = {
    editorId,
    currentFileHandle: null,
    selectedFileHandle: null,
    currentFileName: config.defaultFileName,
    currentFilePathParam: null,
    autoSaveEnabled: true,
    editorReady: false,
  };

  tab.setEditorReady = (value) => { tab.editorReady = value; };
  tab.setCurrentFilePathParam = (value) => { tab.currentFilePathParam = value; };
  tab.toggleAutoSave = () => { tab.autoSaveEnabled = !tab.autoSaveEnabled; return tab.autoSaveEnabled; };

  tab.setEditorText = (newText) => {
    const view = window.myst_editor[editorId]?.main_editor;
    if (!view) {
      console.warn("Editor not ready yet:", editorId);
      return;
    }
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: newText }, selection: { anchor: 0 } });
    view.focus();
  };

  tab.setSubtitle = async (text) => {
    const shadowRoot = document.getElementById(editorId)?.shadowRoot;
    const subtitle = shadowRoot?.getElementById("document-subtitle");
    let currentDir = workingDirectory || await get("workingDirHandle");
    if (subtitle) {
      const dirName = currentDir ? currentDir.name : "Undefined";
      subtitle.innerHTML = "Editing " + text + "  &emsp; - &emsp;   Working dir: " + dirName;
    }
  };


  tab.setCurrentFile = async (handle) => {
    if (handle === null) {
      tab.currentFileHandle = null;
      tab.currentFileName = null;
      await tab.setSubtitle("");
      onFileChanged?.();
      return;
    }
    tab.currentFileHandle = handle;
    tab.currentFileName = handle.name;
    await tab.setSubtitle(tab.currentFileName);
    await set(`storedFileHandle:${editorId}`, tab.currentFileHandle);
    onFileChanged?.();
  };

  tab.delKeyFromDB = async () => {
    await del(`storedFileHandle:${editorId}`);
  };

  tab.selectMarkdownFile = async () => {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: "Markdown Files", accept: { "Markdown/*": [".md", ".markdown", ".txt"] } }],
      multiple: false,
    });
    await set(`storedFileHandle:${editorId}`, fileHandle);
    return fileHandle;
  };

  tab.loadFileFromHandle = async (fileHandle) => {
    try {
      const options = { mode: "readwrite" };
      let permission = await fileHandle.queryPermission(options);
      if (permission !== "granted") permission = await fileHandle.requestPermission(options);
      if (permission !== "granted") {
        console.warn("Permission denied for file:", fileHandle.name);
        return null;
      }
      const fileData = await fileHandle.getFile();
      tab.currentFileHandle = fileHandle;
      tab.selectedFileHandle = fileHandle;
      tab.currentFileName = fileHandle.name;
      await set(`storedFileHandle:${editorId}`, tab.currentFileHandle);
      await tab.setSubtitle(tab.currentFileName);
      onFileChanged?.();
      return fileData;
    } catch (error) {
      console.error("Failed to load file:", error);
      return null;
    }
  };

  tab.openNewFile = async () => {
    try {
      const fileHandle = await tab.selectMarkdownFile();
      const file = await tab.loadFileFromHandle(fileHandle);
      if (file) {
        await addRecentFileHandle(fileHandle);
        await tab.setCurrentFile(fileHandle);
        tab.setEditorText(await file.text());
      }
    } catch (err) {
      if (err.name !== "AbortError") console.error("Open file error:", err);
    }
  };


  tab.loadFileOnStartup = async () => {
    const storedHandle = await get(`storedFileHandle:${editorId}`);
    if (!storedHandle) return null;
    const fileData = await tab.loadFileFromHandle(storedHandle);
    if (!fileData) await set(`storedFileHandle:${editorId}`, null);
    return fileData;
  };



tab.getRecentFileOptions = async (maxFiles = config.maxRecentFiles, onOpenHandle = null) => {
  const handles = await getRecentFileHandles();
  return handles.slice(0, maxFiles).map((handle) => ({
    id: handle.name,
    text: handle.name,
    action: async () => {
      if (onOpenHandle) {
        // Redirige vers la logique globale d'ouverture/activation d'onglet !
        await onOpenHandle(handle);
      } else {
        // Comportement de fallback local
        const file = await tab.loadFileFromHandle(handle);
        if (file) {
          tab.setEditorText(await file.text());
          tab.currentFileName = handle.name;
        }
      }
    },
  }));
};

  tab.saveCurrentDoc = async () => {
    const content = window.myst_editor[editorId].text;
    const contentToSave = content;

    if (tab.currentFilePathParam) {
      await saveFileToPathParam(tab.currentFilePathParam, contentToSave);
      console.log(`Saved (via path param): ${tab.currentFilePathParam}`);
    } else {
      const writable = await tab.currentFileHandle.createWritable();
      await writable.write(contentToSave);
      await writable.close();
      console.log(`Saved: ${tab.currentFileName}`);
    }
    return true;
  };

  tab.autosave = async () => {
    if (!tab.currentFilePathParam && !tab.currentFileHandle) return;
    if (!tab.autoSaveEnabled) return;

    try {
      const content = window.myst_editor[editorId].text;

      if (!content.trim()) {
        if (tab.currentFilePathParam) {
          const pathResult = await loadFileFromPathParam();
          if (pathResult) tab.currentFilePathParam = pathResult.path;
          return;
        } else {
          const file = await tab.currentFileHandle.getFile();
          const fileContent = await file.text();
          tab.setEditorText(fileContent);
          console.log(`Content empty, reloading ${tab.currentFileName}`);
          return;
        }
      }

      await tab.saveCurrentDoc();
      console.log(`Autosave : ${tab.currentFileName}`);
    } catch (err) {
      console.error("Autosave error:", err);
    }
  };

  tab.saveAs = async () => {
    const content = window.myst_editor[editorId].text;

    // 1. showSaveFilePicker (Chrome, Edge, Opera)
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: tab.currentFileName || "document.md",
          types: [{ description: "Markdown Files", accept: { "text/markdown": [".md", ".markdown"] } }],
        });
        await tab.setCurrentFile(handle);
        await addRecentFileHandle(handle);
        await tab.saveCurrentDoc();
        return true;
      } catch (err) {
        if (err.name !== "AbortError") console.error("Save as error:", err);
        return false;
      }
    }

    // 2. Fallback (Firefox, Safari)
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = tab.currentFileName || "document.md";
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  };

  tab.smartSave = async () => {
    // S'il existe un handle ou un path HTTP, sauvegarde simple
    if (tab.currentFileHandle || tab.currentFilePathParam) {
      return await tab.saveCurrentDoc();
    }
    // Sinon, bascule sur Save As
    return await tab.saveAs();
  };



  tab.applyThemeAtStartup = () => applyThemeAtStartup(editorId);
  tab.applyCodeMirrorTheme = () => applyCodeMirrorTheme(editorId);
  tab.showStatsPopup = () => showStatsPopup(editorId);

  return tab;
}