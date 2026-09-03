// Exported as a function
export const isTauri = () => typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

export * from "./local_utils/theme.js";
export * from "./local_utils/fs.js";
export * from "./local_utils/stats.js";
export * from "./local_utils/tab_state.js";
export * from "./local_utils/zoom.js";