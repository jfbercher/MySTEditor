import * as localUtils from "./utils/local_utils.js";
import { get, set } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm';
import { mountEditor } from "./editor_factory.js";
import { config } from "./config.js";


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
    //setInterval(() => this.autosaveAll(), config.autosaveIntervalMs);

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

    if (!tabInfo.mounted) {
      mountEditor({
        editorId,
        tab: tabInfo.tabState,
        container: tabInfo.container,
        initialContent: tabInfo.savedText ?? this.newFileTemplate,
        editorOptions: this.editorOptions,
        getAllEditorIds: this.getAllEditorIds,
        updateTabLabel: this.updateTabLabel,
        openFileHandleInTab: (handle) => this.openFileHandleInTab(handle), // <-- Transmis à mountEditor
      });
      tabInfo.mounted = true;
    }

    this.showOnlyTab(editorId);
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
      const remaining = [...this.openTabs.keys()];
      if (remaining.length > 1) {
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
    await set("openTabsOrder", [...this.openTabs.keys()]);
  }

  createTabShell(editorId) {
    const tabState = localUtils.createTabState(editorId, () => this.updateTabLabel(editorId));
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
    return editorId;
  }

  async restoreTabs() {
    const savedOrder = await get("openTabsOrder");
    if (!savedOrder || savedOrder.length === 0) {
      this.openTab();
      return;
    }

    for (const editorId of savedOrder) {
      this.createTabShell(editorId);
      await this.prefillTabLabel(editorId);
    }
    this.activateTab(savedOrder[0]);
  }

  async prefillTabLabel(editorId) {
    const storedHandle = await get(`storedFileHandle:${editorId}`);
    const tabInfo = this.openTabs.get(editorId);
    if (!tabInfo) return;

    tabInfo.tabState.currentFileName = storedHandle?.name ?? "Untitled";
    this.updateTabLabel(editorId);
  }

  nextAvailableEditorId() {
    let n = 1;
    while (this.openTabs.has(`myst-${n}`)) n++;
    return `myst-${n}`;
  }
// À ajouter dans la classe TabManager dans tab_manager.js

async findTabForHandle(fileHandle) {
  for (const [editorId, tabInfo] of this.openTabs.entries()) {
    const existingHandle = tabInfo.tabState.currentFileHandle;
    if (existingHandle && (await existingHandle.isSameEntry(fileHandle))) {
      return editorId;
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

    // Comportement normal : nouvel onglet, nouveau fichier
    const editorId = this.nextAvailableEditorId();
    this.createTabShell(editorId);
    const tabInfo = this.openTabs.get(editorId);
    
    const fileData = await tabInfo.tabState.loadFileFromHandle(fileHandle);
    if (fileData) {
      await localUtils.addRecentFileHandle(fileHandle);
      tabInfo.savedText = await fileData.text();
      this.activateTab(editorId);
    }
    
    this.updateTabLabel(editorId);
    this.persistTabOrder();
  }

}