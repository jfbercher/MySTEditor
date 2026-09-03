import { loadConfig } from "./config.js";
import { initZoom, initExternalLinkHandler, isTauri } from "./utils/local_utils.js";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { TabManager } from "./tab_manager.js";

/**
 * Initializes the main application components and sets up Tauri listeners if running in Desktop mode.
 * 
 * @param {Object} options Configuration options for TabManager (roles, directives, transforms)
 * @returns {Promise<TabManager>} The initialized TabManager instance
 */
export async function initApp(options = {}) {
  // Load global configurations and initialize basic UI utilities
  await loadConfig();
  initZoom();
  initExternalLinkHandler();

  // Initialize the tab manager with passed custom roles and extensions
  const tabManager = new TabManager(options);
  await tabManager.init();

  // Handle desktop-specific interactions if running within Tauri
  if (isTauri()) {
    console.log("Tauri environment detected");

    // Listen for file-open events emitted when the application is already running
    await listen("open-file", (event) => {
      console.log("File open event received:", event.payload);
      tabManager.openFileHandleInTab(event.payload);
    });
    console.log("Tauri 'open-file' listener successfully registered");

    // Check for any pending file passed during initial application startup (e.g., via macOS Finder)
    try {
      const pendingPath = await invoke("get_pending_file");
      if (pendingPath) {
        console.log("Retrieved pending startup file:", pendingPath);
        tabManager.openFileHandleInTab(pendingPath);
      }
    } catch (err) {
      console.error("Failed to retrieve pending startup file:", err);
    }
  }

  return tabManager;
}