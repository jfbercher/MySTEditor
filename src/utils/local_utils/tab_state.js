// Gère l'état et la manipulation d'un onglet ou d'un fichier ouvert.
import { get, set, del } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm';
import { applyThemeAtStartup, applyCodeMirrorTheme } from './theme.js';
import { showStatsPopup } from './stats.js';
import { config } from "../../config.js";
import { showToast } from '../utils_ui.js';
import { saveCommentsForPath, loadCommentsForPath } from "../commentsStorage.js";


import { 
  workingDirectory, 
  getRecentFileHandles, 
  addRecentFileHandle, 
  saveFileToPathParam, 
  loadFileFromPathParam, 
  saveBackupFile
} from './fs.js';

// Détection de l'environnement Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Déclarations dynamiques des modules Tauri
let tauriDialog, tauriFs;

if (isTauri) {
  Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs')
  ]).then(([dialog, fs]) => {
    tauriDialog = dialog;
    tauriFs = fs;
  });
}

// Fonction utilitaire pour extraire le nom de fichier d'un chemin (Tauri) ou Handle (Web)
function getFileName(fileHandleOrPath) {
  if (!fileHandleOrPath) return config.defaultFileName;
  if (typeof fileHandleOrPath === 'string') {
    return fileHandleOrPath.split('/').pop().split('\\').pop();
  }
  return fileHandleOrPath.name || config.defaultFileName;
}

// Persist the active tab ID
export async function saveActiveTabId(tabId) {
  return await set("activeTabId", tabId);
}

// Retrieve the stored active tab ID
export async function getActiveTabId() { 
  return await get("activeTabId");
}


export function createTabState(editorId, onFileChanged, onDirtyChanged) {
  let activeWorkingDir = workingDirectory;

  const tab = {
    editorId,
    currentFileHandle: null,
    selectedFileHandle: null,
    currentFileName: config.defaultFileName,
    currentFilePathParam: null,
    autoSaveEnabled: true,
    editorReady: false,
    dirty: false,
    lastSavedText: "",
    ycommentsRef: null,
    pendingCommentsState: null,
  };

  // Comments ------

  function tryApplyComments() {
    if (tab.pendingCommentsState && tab.ycommentsRef) {
      tab.ycommentsRef.applyState(tab.pendingCommentsState);
      tab.pendingCommentsState = null;
    }
  }

  /** À appeler dès que collab.value.ycomments existe (depuis onReady/effect côté index.html). */
  tab.registerYComments = (ycomments) => {
    tab.ycommentsRef = ycomments;
    tryApplyComments();
  };

  /** À appeler dès que le chemin du fichier + son contenu texte sont connus (chargement du fichier). */
  tab.loadCommentsForCurrentFile = async () => {
    const filePath = tab.currentFileName; // ou un vrai chemin absolu si disponible, voir remarque plus bas
    if (!filePath) return;
    tab.pendingCommentsState = await loadCommentsForPath(filePath);
    tryApplyComments();
  };

  tab.saveCommentsForCurrentFile = async () => {
    const filePath = tab.currentFileName;
    if (!filePath || !tab.ycommentsRef) return;
    await saveCommentsForPath(filePath, tab.ycommentsRef);
  };

  // End comments ------

    tab.setDirty = (value) => {
      if (tab.dirty === value) return;
      tab.dirty = value;
      onDirtyChanged?.(value);
    };

  tab.markSaved = (text) => {
    tab.lastSavedText = text;
    tab.setDirty(false);
  };

  tab.checkDirty = (currentText) => { tab.setDirty(currentText !== tab.lastSavedText); };
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
    let currentDir = workingDirectory || (isTauri ? localStorage.getItem("workingDirHandle") : await get("workingDirHandle"));
    if (subtitle) {
      let dirName = "Undefined";
      if (currentDir) {
        dirName = typeof currentDir === 'string' ? currentDir.split('/').pop() : currentDir.name;
      }
      subtitle.innerHTML = "Editing " + text + "  &emsp; - &emsp;   Working dir: " + dirName;
    }
  };

  tab.setCurrentFile = async (handleOrPath) => {
    if (handleOrPath === null) {
      tab.currentFileHandle = null;
      tab.currentFileName = null;
      await tab.setSubtitle("");
      onFileChanged?.();
      return;
    }
    tab.currentFileHandle = handleOrPath;
    tab.currentFileName = getFileName(handleOrPath);
    await tab.setSubtitle(tab.currentFileName);
    
    if (isTauri) {
      localStorage.setItem(`storedFileHandle:${editorId}`, tab.currentFileHandle);
    } else {
      await set(`storedFileHandle:${editorId}`, tab.currentFileHandle);
    }
    onFileChanged?.();
  };

  tab.delKeyFromDB = async () => {
    if (isTauri) {
      localStorage.removeItem(`storedFileHandle:${editorId}`);
    } else {
      await del(`storedFileHandle:${editorId}`);
    }
  };

  tab.selectMarkdownFile = async () => {
    console.log("Opening new file... (m)");
    if (isTauri) {
      const selected = await tauriDialog.open({
        multiple: false,
        filters: [{ description: "Markdown Files", name: "Markdown", extensions: ["md", "markdown", "txt"] }]
      });
      if (selected) {
        localStorage.setItem(`storedFileHandle:${editorId}`, selected);
        return selected;
      }
      return null;
    } else {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: "Markdown Files", accept: { "text/markdown": [".md", ".markdown", ".txt"] } }],
        multiple: false,
      });
      await set(`storedFileHandle:${editorId}`, fileHandle);
      return fileHandle;
    }
  };

  tab.loadFileFromHandle = async (fileHandleOrPath) => {
    try {
      if (isTauri) {
        // fileHandleOrPath est une chaîne de caractères (chemin d'accès absolu)
        const textContent = await tauriFs.readTextFile(fileHandleOrPath);
        tab.currentFileHandle = fileHandleOrPath;
        tab.selectedFileHandle = fileHandleOrPath;
        tab.currentFileName = getFileName(fileHandleOrPath);
        localStorage.setItem(`storedFileHandle:${editorId}`, tab.currentFileHandle);
        await tab.setSubtitle(tab.currentFileName);
        onFileChanged?.();
        // Simule l'objet File pour conserver la compatibilité de retour (.text())
        return { text: async () => textContent };
      } else {
        const options = { mode: "readwrite" };
        let permission = await fileHandleOrPath.queryPermission(options);
        if (permission !== "granted") permission = await fileHandleOrPath.requestPermission(options);
        if (permission !== "granted") {
          console.warn("Permission denied for file:", fileHandleOrPath.name);
          return null;
        }
        const fileData = await fileHandleOrPath.getFile();
        tab.currentFileHandle = fileHandleOrPath;
        tab.selectedFileHandle = fileHandleOrPath;
        tab.currentFileName = fileHandleOrPath.name;
        await set(`storedFileHandle:${editorId}`, tab.currentFileHandle);
        await tab.setSubtitle(tab.currentFileName);
        onFileChanged?.();
        return fileData;
      }
    } catch (error) {
      console.error("Failed to load file:", error);
      return null;
    }
  };

  tab.openNewFile = async () => {
    console.log("Opening new file...");
    try {
      const fileHandleOrPath = await tab.selectMarkdownFile();
      console.log("Opening new file... (n)");
      if (!fileHandleOrPath) return;
      const file = await tab.loadFileFromHandle(fileHandleOrPath);
      if (file) {
        await addRecentFileHandle(fileHandleOrPath);
        await tab.setCurrentFile(fileHandleOrPath);
        const content = await file.text();
        tab.setEditorText(content);
        tab.markSaved(content);
        tab.setDirty(false);
        console.log(`Opened file: ${tab.currentFileName}`, tab);
      }
    } catch (err) {
      if (err.name !== "AbortError") console.error("Open file error:", err);
    }
  };

  tab.loadFileOnStartup = async () => {
    const stored = isTauri 
      ? localStorage.getItem(`storedFileHandle:${editorId}`) 
      : await get(`storedFileHandle:${editorId}`);
    if (!stored) return null;
    const fileData = await tab.loadFileFromHandle(stored);
    if (!fileData) {
      if (isTauri) localStorage.removeItem(`storedFileHandle:${editorId}`);
      else await set(`storedFileHandle:${editorId}`, null);
    }
    return fileData;
  };

  tab.getRecentFileOptions = async (maxFiles = config.maxRecentFiles, onOpenHandle = null) => {
    const handles = await getRecentFileHandles();
    return handles.slice(0, maxFiles).map((handleOrPath) => {
      const fileName = getFileName(handleOrPath);
      return {
        id: fileName,
        text: fileName,
        action: async () => {
          if (onOpenHandle) {
            await onOpenHandle(handleOrPath);
          } else {
            const file = await tab.loadFileFromHandle(handleOrPath);
            if (file) {
              const text = await file.text();
              tab.setEditorText(text);
              tab.markSaved(text); 
              tab.currentFileName = fileName;
            }
          }
        },
      };
    });
  };

  tab.saveCurrentDoc = async () => {
    const contentToSave = window.myst_editor[editorId].text;

    if (tab.currentFilePathParam) {
      await saveFileToPathParam(tab.currentFilePathParam, contentToSave);
      tab.markSaved(contentToSave);
      await tab.saveCommentsForCurrentFile(); 
      console.log(`Saved (via path param): ${tab.currentFilePathParam}`);
    } else if (isTauri) {
      await tauriFs.writeTextFile(tab.currentFileHandle, contentToSave);
      tab.markSaved(contentToSave);
      await tab.saveCommentsForCurrentFile(); 
      console.log(`Saved (Tauri): ${tab.currentFileName}`);
    } else {
      const writable = await tab.currentFileHandle.createWritable();
      await writable.write(contentToSave);
      await writable.close();
      tab.markSaved(contentToSave);
      await tab.saveCommentsForCurrentFile(); 
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
          const file = await tab.loadFileFromHandle(tab.currentFileHandle);
          if (file) {
            const fileContent = await file.text();
            tab.setEditorText(fileContent);
            tab.markSaved(fileContent); 
            console.log(`Content empty, reloading ${tab.currentFileName}`);
          }
          return;
        }
      }

      await tab.saveCurrentDoc();
      await tab.saveCommentsForCurrentFile(); 
      // console.log(`Autosave : ${tab.currentFileName}`);
    } catch (err) {
      console.error("Autosave error:", err);
    }
  };

  tab.saveAs = async () => {
    const content = window.myst_editor[editorId].text;

    // 1. Sauvegarde native Tauri
    if (isTauri) {
      try {
        const filePath = await tauriDialog.save({
          defaultPath: tab.currentFileName || "document.md",
          filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }]
        });
        if (filePath) {
          await tauriFs.writeTextFile(filePath, content);
          await tab.setCurrentFile(filePath);
          await addRecentFileHandle(filePath);
          tab.markSaved(content);
          await tab.saveCommentsForCurrentFile(); 
          showToast(`Save-as successful.`);
          return true;
        }
        return false;
      } catch (err) {
        console.error("Tauri save as error:", err);
        return false;
      }
    }

    // 2. showSaveFilePicker (Chrome, Edge, Opera)
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

    // 3. Fallback Web basique (Firefox, Safari Web)
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = tab.currentFileName || "document.md";
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  };

  tab.handleBackup = async () => {
    const currentContent = window.myst_editor[editorId]?.text ?? "";
    const currentHandle = tab.currentFileHandle;
    if (!currentContent.trim()) {
        return false;
    }

    const success = await saveBackupFile(currentHandle, currentContent);
    if (success) {
      showToast(`Backup of ${tab.currentFileName} successful.`);
      console.log("Backup with success.");
    }
  };

  tab.smartSave = async () => {
    if (tab.currentFileHandle || tab.currentFilePathParam) {
      return await tab.saveCurrentDoc();
    }
    return await tab.saveAs();
  };

  tab.applyThemeAtStartup = () => applyThemeAtStartup(editorId);
  tab.applyCodeMirrorTheme = () => applyCodeMirrorTheme(editorId);
  tab.showStatsPopup = () => showStatsPopup(editorId);

  return tab;
}