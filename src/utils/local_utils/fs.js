import { get, set } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm';
import { convertFileSrc } from '@tauri-apps/api/core';
import { config } from "../../config.js";

// Helper de détection de l'environnement Tauri
export const isTauri = () => typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

// Variables globales d'état (String sous Tauri, DirectoryHandle sous Web)
export let imagesDirectory = null;
export let workingDirectory = null;

const imageExtensions = new Set([
  "gif", "jpg", "jpeg", "png", "webp", "avif", "svg", 
  "bmp", "tif", "tiff", "ico", "heic", "heif"
]);

// --- Core storage helpers for Tab order and file handles ---

export async function saveOpenTabsOrder(tabsArray) {
  return await set("openTabsOrder", tabsArray);
}

export async function getOpenTabsOrder() {
  return await get("openTabsOrder");
}

export async function getStoredFileHandle(editorId) {
  const key = `storedFileHandle:${editorId}`;
  let stored = await get(key);
  if (!stored && typeof localStorage !== 'undefined') {
    stored = localStorage.getItem(key);
  }
  return stored;
}

export async function setStoredFileHandle(editorId, handleOrPath) {
  const key = `storedFileHandle:${editorId}`;
  if (typeof handleOrPath === 'string') {
    localStorage.setItem(key, handleOrPath);
  }
  await set(key, handleOrPath);
}

// --- Sélection des dossiers (Images & Working Directory) ---

export async function selectImageFolder() {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      imagesDirectory = selected;
      localStorage.setItem("imagesDirHandle", imagesDirectory);
      console.log("Folder selected and saved (Tauri):", imagesDirectory);
    }
  } else {
    if ('showDirectoryPicker' in window) {
      try {
        imagesDirectory = await window.showDirectoryPicker();
        await set("imagesDirHandle", imagesDirectory);
        console.log("Folder selected and saved (Web):", imagesDirectory.name);
      } catch (err) {
        if (err.name !== 'AbortError') console.error("Error selecting folder (Web):", err);
      }
    }
  }
}

export async function loadImageFolderOnStartup() {
  if (isTauri()) {
    const storedPath = localStorage.getItem("imagesDirHandle");
    if (storedPath) {
      imagesDirectory = storedPath;
      return imagesDirectory;
    }
  } else {
    const storedHandle = await get("imagesDirHandle");
    if (storedHandle) {
      imagesDirectory = storedHandle;
      return imagesDirectory;
    }
  }
  return null;
}

export async function selectWorkingFolder() {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      workingDirectory = selected;
      localStorage.setItem("workingDirHandle", workingDirectory);
      console.log("Working folder selected and saved (Tauri):", workingDirectory);
    }
  } else {
    if ('showDirectoryPicker' in window) {
      try {
        workingDirectory = await window.showDirectoryPicker();
        await set("workingDirHandle", workingDirectory);
        console.log("Working folder selected and saved (Web):", workingDirectory.name);
      } catch (err) {
        if (err.name !== 'AbortError') console.error("Error selecting working folder (Web):", err);
      }
    }
  }
}

export async function loadWorkingFolderOnStartup() {
  if (isTauri()) {
    const storedPath = localStorage.getItem("workingDirHandle");
    if (storedPath) {
      workingDirectory = storedPath;
      return workingDirectory;
    }
  } else {
    const storedHandle = await get("workingDirHandle");
    if (storedHandle) {
      workingDirectory = storedHandle;
      return workingDirectory;
    }
  }
  return null;
}

export function getWorkingDirectory() {
  return workingDirectory;
}

// --- Résolution des images (Web vs Tauri) ---

export function resolveImageSync(path) {
  // 1. Return immediately if empty or already an absolute/converted URL (http, https, blob, data, asset://)
  if (
    !path || 
    /^(https?:|data:|blob:|mailto:|asset:)/i.test(path) ||
    path.startsWith("https://asset.localhost")
  ) {
    return path;
  }

  const extension = path.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  if (!imageExtensions.has(extension)) return path;
  if (!workingDirectory) return config.fallbackImage;

  if (isTauri()) {
    try {
      let rawWorkingDir = typeof workingDirectory === 'string' 
        ? decodeURIComponent(workingDirectory) 
        : workingDirectory;

      const cleanWorkingDir = rawWorkingDir.replace(/\/$/, "");
      const cleanRelativePath = path.replace(/^\.?\//, "").replaceAll("\\", "/");
      const absolutePath = `${cleanWorkingDir}/${cleanRelativePath}`;

      let assetUrl = convertFileSrc(absolutePath);
      if (assetUrl.includes("%2F")) {
        assetUrl = assetUrl.replaceAll("%2F", "/");
      }
      return assetUrl;
    } catch (err) {
      console.error("Error resolving image synchronously with Tauri:", err);
      return config.fallbackImage;
    }
  }

  // Sous Web : la résolution synchrone retourne le fallback si non pré-traité par resolveImage
  return config.fallbackImage;
}

export async function resolveImage(path) {
  if (!path || /^(https?:|data:|blob:|mailto:)/i.test(path)) return path;

  const extension = path.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  if (!imageExtensions.has(extension)) return path;
  if (!workingDirectory) return path + " (no work dir)";

  if (isTauri()) {
    return resolveImageSync(path);
  } else {
    try {
      const parts = path.replace(/^\.?\//, "").replaceAll("\\", "/").split("/").filter(Boolean);
      const fileName = parts.pop();
      let directory = workingDirectory;
      for (const part of parts) {
        directory = await directory.getDirectoryHandle(part);
      }
      const handle = await directory.getFileHandle(fileName);
      const file = await handle.getFile();
      return URL.createObjectURL(file);
    } catch (err) {
      console.error("Image not found (Web):", path, err);
      return config.fallbackImage;
    }
  }
}

// --- Fichiers récents ---

export async function getRecentFileHandles() {
  if (isTauri()) {
    const raw = localStorage.getItem("recentFileHandles");
    return raw ? JSON.parse(raw) : [];
  } else {
    const handles = await get("recentFileHandles");
    return Array.isArray(handles) ? handles : [];
  }
}

export async function addRecentFileHandle(fileHandleOrPath) {
  if (isTauri()) {
    const recentHandles = await getRecentFileHandles();
    const filtered = recentHandles.filter(p => p !== fileHandleOrPath);
    filtered.unshift(fileHandleOrPath);
    localStorage.setItem("recentFileHandles", JSON.stringify(filtered));
    return filtered;
  } else {
    const recentHandles = await getRecentFileHandles();
    // Filtrage pour éviter les doublons avec les FileSystemHandle Web
    const filtered = [];
    for (const item of recentHandles) {
      const isSame = typeof item.isSameEntry === 'function' && typeof fileHandleOrPath.isSameEntry === 'function'
        ? await item.isSameEntry(fileHandleOrPath)
        : item === fileHandleOrPath;
      if (!isSame) filtered.push(item);
    }
    filtered.unshift(fileHandleOrPath);
    await set("recentFileHandles", filtered);
    return filtered;
  }
}

// --- Chargement / Sauvegarde des fichiers ---

export async function loadFileFromPathParam() {
  const params = new URLSearchParams(location.search);
  const filePath = params.get("path");
  if (!filePath) return null;
  
  if (isTauri()) {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const content = await readTextFile(filePath);
      return { path: filePath, content };
    } catch (err) {
      console.error("Failed to load file from path param (Tauri):", err);
      return null;
    }
  }
  return null;
}

export async function saveFileToPathParam(filePath, content) {
  if (isTauri()) {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(filePath, content);
  }
}

/**
 * Creates a backup copy of the current file by replacing its extension with .bak
 * @param {string|FileSystemFileHandle} currentHandleOrPath - Web handle or Tauri file path
 * @param {string} content - The text content to write into the backup
 */
export async function saveBackupFile(currentHandleOrPath, content) {
  if (!currentHandleOrPath) return false;

  if (isTauri()) {
    try {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      
      const backupPath = typeof currentHandleOrPath === 'string'
        ? currentHandleOrPath.replace(/\.[^/.]+$/, "") + ".bak"
        : null;

      if (!backupPath) return false;

      await writeTextFile(backupPath, content);
      console.log("Tauri backup created:", backupPath);
      return true;
    } catch (err) {
      console.error("Backup error (Tauri):", err);
      return false;
    }
  } else {
    try {
      // Web environment: fallback to workingDirectory or prompt using showSaveFilePicker
      if (typeof currentHandleOrPath === 'object' && currentHandleOrPath.name) {
        const originalName = currentHandleOrPath.name;
        const backupName = originalName.replace(/\.[^/.]+$/, "") + ".bak";

        // 1. Primary approach: write inside workingDirectory if available
        if (workingDirectory && typeof workingDirectory.getFileHandle === 'function') {
          const backupHandle = await workingDirectory.getFileHandle(backupName, { create: true });
          const writable = await backupHandle.createWritable();
          await writable.write(content);
          await writable.close();
          console.log("Web backup created inside workingDirectory:", backupName);
          return true;
        }

        // 2. Fallback approach: prompt user via standard File System Access API
        if ('showSaveFilePicker' in window) {
          const backupHandle = await window.showSaveFilePicker({
            suggestedName: backupName,
            types: [{
              description: 'Backup File',
              accept: { 'text/plain': ['.bak'] }
            }]
          });
          const writable = await backupHandle.createWritable();
          await writable.write(content);
          await writable.close();
          console.log("Web backup created via save picker:", backupName);
          return true;
        }
      }
      return false;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log("Backup cancelled by user.");
      } else {
        console.error("Backup error (Web):", err);
      }
      return false;
    }
  }
}