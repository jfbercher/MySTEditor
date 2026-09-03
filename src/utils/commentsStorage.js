import { get, set, del } from "https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm";

function commentsKey(filePath) {
  return `comments:${filePath}`;
}

export async function saveCommentsForPath(filePath, ycomments) {
  if (!filePath || !ycomments) return;
  try {
    const state = ycomments.encodeState();
    // Ne stocke rien si aucun commentaire/résolu n'existe, pour ne pas polluer IndexedDB inutilement.
    const isEmpty =
      Object.keys(state.positions).length === 0 &&
      Object.keys(state.resolved).length === 0;
    if (isEmpty) {
      await del(commentsKey(filePath));
    } else {
      await set(commentsKey(filePath), state);
    }
  } catch (err) {
    console.error("Failed to save comments for", filePath, err);
  }
}

export async function loadCommentsForPath(filePath) {
  if (!filePath) return null;
  try {
    return (await get(commentsKey(filePath))) ?? null;
  } catch (err) {
    console.error("Failed to load comments for", filePath, err);
    return null;
  }
}

export async function deleteCommentsForPath(filePath) {
  if (!filePath) return;
  try {
    await del(commentsKey(filePath));
  } catch (err) {
    console.error("Failed to delete comments for", filePath, err);
  }
}