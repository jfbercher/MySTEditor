import * as localUtils from "./utils/local_utils.js";
import { mountEditor } from "./editor_factory.js";
import { config } from "./config.js";


// Helper function to compare handles/paths across Web and Tauri environments
async function areHandlesEqual(handleA, handleB) {
  if (!handleA || !handleB) return false;

  // String comparison for Tauri file paths
  if (typeof handleA === 'string' || typeof handleB === 'string') {
    return handleA === handleB;
  }

  // FileSystemHandle comparison for standard Web API
  if (typeof handleA.isSameEntry === 'function') {
    return await handleA.isSameEntry(handleB);
  }

  return handleA === handleB;
}

export class TabManager {
  constructor(editorOptions = {}) {
    this.openTabs = new Map();
    this.activeTabId = null;
    this.editorOptions = editorOptions;
    this.newFileTemplate = "";
    this.tabsBarEl = document.getElementById("tabs-bar");
    this.tabsContentEl = document.getElementById("tabs-content");
  }

  getAllEditorIds = () => {
    return [...this.openTabs.entries()].filter(([, t]) => t.mounted).map(([id]) => id);
  };

  async init() {
    const response = await fetch("./new_file.md");
    this.newFileTemplate = await response.text();

    document.getElementById("new-tab-button")?.addEventListener("click", () => {
      this.openTab();
    });

    await this.restoreTabs();

    setInterval(() => this.checkSuspendInactiveTabs(), config.CHECK_INTERVAL_MS || config.checkIntervalMs);

    setInterval(() => {
      const tabInfo = this.openTabs.get(this.activeTabId);
      if (tabInfo?.mounted) tabInfo.tabState.autosave();
    }, config.autosaveIntervalMs);
  }

  createTabContainer(editorId) {
    const container = document.createElement("div");
    container.id = editorId;
    container.className = "myst-tab-container";
    container.style.width = "100%";
    container.style.height = "100%";
    this.tabsContentEl.appendChild(container);
    return container;
  }

  createTabButton(editorId) {
    const btn = document.createElement("div");
    btn.className = "myst-tab-button";
    btn.dataset.editorId = editorId;

    const label = document.createElement("span");
    label.className = "myst-tab-label";
    btn.appendChild(label);

    const closeBtn = document.createElement("span");
    closeBtn.className = "myst-tab-close";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.closeTab(editorId);
    });
    btn.appendChild(closeBtn);

    btn.addEventListener("click", () => this.activateTab(editorId));
    this.tabsBarEl.appendChild(btn);
    return btn;
  }

  updateTabLabel = (editorId) => {
    const tabInfo = this.openTabs.get(editorId);
    if (!tabInfo) return;
    const label = tabInfo.buttonEl.querySelector(".myst-tab-label");
    const name = tabInfo.tabState.currentFileName || "untitled";
    label.textContent = name;
    tabInfo.buttonEl.classList.toggle("active", editorId === this.activeTabId);
  };

  showOnlyTab(editorId) {
    for (const [id, tabInfo] of this.openTabs.entries()) {
      if (tabInfo.container) tabInfo.container.style.display = id === editorId ? "block" : "none";
      tabInfo.buttonEl.classList.toggle("active", id === editorId);
    }
  }

  touchTab(editorId) {
    const tabInfo = this.openTabs.get(editorId);
    if (tabInfo) tabInfo.lastActiveAt = Date.now();
  }

  async suspendTab(editorId) {
    const tabInfo = this.openTabs.get(editorId);
    if (!tabInfo || !tabInfo.mounted || editorId === this.activeTabId) return;

    try {
      await tabInfo.tabState.autosave();
    } catch (err) {
      console.warn("Autosave before suspend failed:", err);
    }

    tabInfo.savedText = window.myst_editor[editorId]?.text ?? "";
    window.myst_editor[editorId]?.remove();
    tabInfo.container.innerHTML = "";
    tabInfo.mounted = false;
  }

  checkSuspendInactiveTabs() {
    const now = Date.now();
    for (const [id, tabInfo] of this.openTabs.entries()) {
      if (id === this.activeTabId || !tabInfo.mounted) continue;
      if (now - tabInfo.lastActiveAt > config.suspendAfterMs) this.suspendTab(id);
    }
  }

  activateTab(editorId) {
    this.activeTabId = editorId;
    this.touchTab(editorId);
    const tabInfo = this.openTabs.get(editorId);
    console.log("Activating tab:", editorId);
    console.log(tabInfo);
    const content = tabInfo.savedText ?? this.newFileTemplate;

    if (!tabInfo.mounted) {
      mountEditor({
        editorId,
        tab: tabInfo.tabState,
        container: tabInfo.container,
        initialContent: content,
        editorOptions: this.editorOptions,
        getAllEditorIds: this.getAllEditorIds,
        updateTabLabel: this.updateTabLabel,
        openFileHandleInTab: (handle) => this.openFileHandleInTab(handle),
      });
      // S'assurer que le tabState considère ce contenu initial comme propre
      tabInfo.tabState.markSaved(content);
      tabInfo.mounted = true;
    }

    this.showOnlyTab(editorId);
    localUtils.saveActiveTabId(this.activeTabId);
    
  }

  closeTab(editorId) {
    const tabInfo = this.openTabs.get(editorId);
    if (!tabInfo) return;

    const removeTab = () => {
      if (tabInfo.mounted) window.myst_editor[editorId]?.remove();
      tabInfo.container.remove();
      tabInfo.buttonEl.remove();
      tabInfo.tabState.delKeyFromDB();
      this.openTabs.delete(editorId);
    };

    if (this.activeTabId !== editorId) {
      removeTab();
    } else {
      const remaining = [...this.openTabs.keys()].filter((id) => id !== editorId); // <-- correctif
      if (remaining.length > 0) {
        removeTab();
        this.activateTab(remaining[0]);
      } else {
        this.openTab();
        removeTab();
      }
    }
    this.persistTabOrder();
}

  async persistTabOrder() {
    // Delegated to localUtils to keep TabManager storage-agnostic
    await localUtils.saveOpenTabsOrder([...this.openTabs.keys()]);
  }

  updateTabDirtyIndicator(editorId, isDirty) {
    const tabInfo = this.openTabs.get(editorId);
    if (!tabInfo) return;
    tabInfo.buttonEl.classList.toggle("dirty", isDirty);
  }

  createTabShell(editorId) {
    // const tabState = localUtils.createTabState(editorId, () => this.updateTabLabel(editorId));
    const tabState = localUtils.createTabState(
      editorId,
      () => this.updateTabLabel(editorId),
      (isDirty) => this.updateTabDirtyIndicator(editorId, isDirty),
    );
    const container = this.createTabContainer(editorId);
    const buttonEl = this.createTabButton(editorId);

    this.openTabs.set(editorId, {
      tabState,
      mounted: false,
      lastActiveAt: Date.now(),
      savedText: null,
      container,
      buttonEl,
    });
    return editorId;
  }

  openTab(editorId) {
    editorId = editorId ?? this.nextAvailableEditorId();
    this.createTabShell(editorId);
    this.activateTab(editorId);
    this.updateTabLabel(editorId);
    this.persistTabOrder();
    // this.updateTabDirtyIndicator(editorId);
    // CORRECTION : Passer l'état dirty explicite de tabState
    const tabInfo = this.openTabs.get(editorId);
    this.updateTabDirtyIndicator(editorId, tabInfo?.tabState.dirty ?? false);
    return editorId;
  }

  async restoreTabs() {
    // Delegated to localUtils
    const savedOrder = await localUtils.getOpenTabsOrder();
    const lastActiveTabId = await localUtils.getActiveTabId();
    console.log("Restoring tabs:", savedOrder);
    if (!savedOrder || savedOrder.length === 0) {
      this.openTab();
      return;
    }

    for (const editorId of savedOrder) {

      this.createTabShell(editorId);
      const tabInfo = this.openTabs.get(editorId);
      await this.prefillTabLabel(editorId);
    }
    if (lastActiveTabId && this.openTabs.has(lastActiveTabId)) {
      // console.log("Restoring last active tab:", lastActiveTabId);
      this.activateTab(lastActiveTabId);
    } else {
      this.activateTab(savedOrder[0]);
    }
    
  }


  async prefillTabLabel(editorId) {
    const storedHandle = await localUtils.getStoredFileHandle(editorId);
    const tabInfo = this.openTabs.get(editorId);

    if (!tabInfo) return;

    let fileName = "Untitled";

    if (storedHandle) {
      if (typeof storedHandle === "string") {
        // Direct string path (Tauri macOS/Windows)
        fileName = storedHandle.split(/[/\\]/).filter(Boolean).pop() || "Untitled";
      } else if (typeof storedHandle === "object" && storedHandle.name) {
        // FileSystemFileHandle (Web API)
        fileName = storedHandle.name;
      }
      tabInfo.tabState.currentFileHandle = storedHandle;
    }

    // Assign to tab state and refresh DOM label
    tabInfo.tabState.currentFileName = fileName;
    this.updateTabLabel(editorId);
  }

  nextAvailableEditorId() {
    let n = 1;
    while (this.openTabs.has(`myst-${n}`)) n++;
    return `myst-${n}`;
  }

  async findTabForHandle(fileHandle) {
    for (const [, tabInfo] of this.openTabs.entries()) {
      if (await areHandlesEqual(tabInfo.tabState.currentFileHandle, fileHandle)) {
        return tabInfo.tabState.editorId;
      }
    }
    return null;
  }

  async openFileHandleInTab(fileHandle) {
    const existingId = await this.findTabForHandle(fileHandle);
    if (existingId) {
      this.activateTab(existingId);
      return;
    }

    const editorId = this.nextAvailableEditorId();
    this.createTabShell(editorId);
    const tabInfo = this.openTabs.get(editorId);

    const fileData = await tabInfo.tabState.loadFileFromHandle(fileHandle);
    if (fileData) {
      await localUtils.addRecentFileHandle(fileHandle);
      tabInfo.savedText = typeof fileData === "string" ? fileData : await fileData.text();
      this.activateTab(editorId);
      tabInfo.tabState.markSaved(tabInfo.savedText);
    }

    this.updateTabLabel(editorId);
    this.persistTabOrder();
  }
}