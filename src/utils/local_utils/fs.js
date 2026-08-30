// Manages image folders, the working directory (workingDirectory), image URL resolution, 
// recent files, and API communication via HTTP parameters (path=...).

import { get, set } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm';
import { config } from "../../config.js";

export let imagesDirectory = null;
export let workingDirectory = null;

const imageExtensions = new Set(["gif", "jpg", "jpeg", "png", "webp", "avif", "svg", "bmp", "tif", "tiff", "ico", "heic", "heif"]);

export async function selectImageFolder() {
  imagesDirectory = await window.showDirectoryPicker({ mode: "read" });
  await set("imagesDirHandle", imagesDirectory);
  console.log("Folder selected and saved:", imagesDirectory.name);
}

export async function loadImageFolderOnStartup() {
  const storedHandle = await get("imagesDirHandle");
  if (!storedHandle) return null;
  const options = { mode: "read" };
  let permission = await storedHandle.queryPermission(options);
  if (permission !== "granted") permission = await storedHandle.requestPermission(options);
  if (permission === "granted") {
    imagesDirectory = storedHandle;
    return imagesDirectory;
  }
  console.warn("Permission denied for stored folder.");
  return null;
}

export async function selectWorkingFolder() {
  workingDirectory = await window.showDirectoryPicker({ mode: "read" });
  await set("workingDirHandle", workingDirectory);
  console.log("Working folder selected and saved:", workingDirectory.name);
}

export async function loadWorkingFolderOnStartup() {
  const storedHandle = await get("workingDirHandle");
  if (!storedHandle) return null;
  const options = { mode: "read" };
  let permission = await storedHandle.queryPermission(options);
  if (permission !== "granted") permission = await storedHandle.requestPermission(options);
  if (permission === "granted") {
    workingDirectory = storedHandle;
    return workingDirectory;
  }
  console.warn("Permission denied for stored working folder.");
  return null;
}

export function getWorkingDirectory() {
  return workingDirectory;
}

export async function resolveImage(path) {
  if (/^(https?:|data:|blob:|mailto:)/i.test(path)) return path;

  const extension = path.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  if (!imageExtensions.has(extension)) return path;
  if (!workingDirectory) return path + " (no work dir)";

  try {
    const parts = path.replace(/^\.?\//, "").replaceAll("\\", "/").split("/").filter(Boolean);
    const fileName = parts.pop();
    let directory = workingDirectory;
    for (const part of parts) directory = await directory.getDirectoryHandle(part);
    const handle = await directory.getFileHandle(fileName);
    const file = await handle.getFile();
    return URL.createObjectURL(file);
  } catch (err) {
    console.error("Image not found:", path, err);
    return config.fallbackImage //`https://upload.wikimedia.org/wikipedia/commons/a/a3/Image-not-found.png`;
  }
}

// --- Fichiers récents ---

export async function getRecentFileHandles() {
  return (await get("recentFileHandles")) ?? [];
}

export async function addRecentFileHandle(fileHandle) {
  const recentHandles = await getRecentFileHandles();
  const filteredHandles = [];
  for (const handle of recentHandles) {
    if (!(await handle.isSameEntry(fileHandle))) filteredHandles.push(handle);
  }
  filteredHandles.unshift(fileHandle);
  await set("recentFileHandles", filteredHandles);
  return filteredHandles;
}

// --- Chargement / Sauvegarde via paramètre d'URL (?path=...) ---

export async function loadFileFromPathParam() {
  const params = new URLSearchParams(location.search);
  const filePath = params.get("path");
  if (!filePath) return null;
  try {
    const response = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
    if (!response.ok) throw new Error(await response.text());
    const content = await response.text();
    return { path: filePath, content };
  } catch (err) {
    console.error("Failed to load file from path param:", err);
    return null;
  }
}

export async function saveFileToPathParam(filePath, content) {
  const response = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`, { method: "POST", body: content });
  if (!response.ok) throw new Error(await response.text());
}