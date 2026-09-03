import { render } from "preact";
import { useEffect, useRef, useMemo, useContext, useState } from "preact/hooks";
import { StyleSheetManager, styled } from "styled-components";
import CodeMirror from "./components/CodeMirror";
import Preview, { PreviewFocusHighlight } from "./components/Preview";
import Diff from "./components/Diff";
import { EditorTopbar } from "./components/Topbar";
import ResolvedComments from "./components/Resolved";
import { handlePreviewClickToScroll } from "./extensions/syncDualPane";
import { createMystState, MystState, predefinedButtons, defaultButtons } from "./mystState";
import { batch, computed, signal, effect, useSignal, useSignalEffect } from "@preact/signals";
import { MystContainer } from "./styles/MystStyles";
import { syncCheckboxes } from "./markdown/markdownCheckboxes";
import { TableOfContents } from "./components/TableOfContents";
import ErrorModal from "./components/ErrorModal";
import ErrorBoundary from "./components/ErrorBoundary";
import { createLogger, Logger } from "./logger";
import { setupPreviewPopups, invalidatePreviewMapCache } from "./utils/previewPopup";



const EditorParent = styled.div`
  font-family: "Lato";
  display: flex;
  flex-flow: row wrap;
  width: 100%;
  height: 100%;
  ${(props) => props.$fullscreen && "position: fixed; left: 0; top: 0; z-index: 10;"}
  ${(props) => {
    switch (props.mode) {
      case "Preview":
        return "#editor-wrapper { display: none }";
      case "Source":
        return "#preview-wrapper { display: none }";
      case "Diff":
        return "#editor-wrapper { display: none }; #preview-wrapper { display: none }";
      case "Both":
        return "#resolved-wrapper { display: none }";
      case "Resolved":
        return "#preview-wrapper { display: none };";
      case "Outline":
        return "#preview-wrapper { display: none };";
      case "Inline":
        return "#preview-wrapper { display: none }";
      default:
        return ``;
    }
  }}
`;


const TocToggleWrapper = styled.div`
  position: relative;
  width: 0;
  z-index: 2;
`;

const TocToggle = styled.button`
  position: absolute;
  top: 10px;
  left: 10px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--panel-bg);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
`;

const TocPanel = styled.div`
  flex: 0 0 ${(props) => (props.open ? `${props.width}px` : "0px")};
  width: ${(props) => (props.open ? `${props.width}px` : "0px")};
  overflow: hidden;
  transition: ${(props) => (props.resizing ? "none" : "flex-basis 0.2s ease")};
  height: 100%;
  position: relative;
`;

const ResizeHandle = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 3;
  &:hover {
    background-color: var(--border);
  }
`;

const MystWrapper = styled.div`
  padding: 20px;
  display: flex;
  box-sizing: border-box;
  height: calc(100% - 60px);
  width: 100%;
  position: relative;
  background-color: var(--panel-bg);
  ${(props) => props.$fullscreen && "box-sizing:border-box; height: calc(100vh - 60px);"}
`;

const StatusBanner = styled.div`
  height: 40px;
  position: sticky;
  z-index: 10;
  width: 100%;
  top: 60px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--accent-light);
  font-weight: 600;
`;



/** CSS flexbox takes the content size of elements to determine the layout and ignores padding.
 * This wrapper is here to make sure the padding is added one element deeper and elements are equal width.
 * Ideally we would use CSS Grid but that has some performance issues with CodeMirror on Chromium. */

const FlexWrapper = styled.div`
  flex: 1;
  min-width: 0;
  height: 100%;

  & > * {
    min-height: 500px;
  }
`;

const hideBodyScrollIf = (val) => (document.documentElement.style.overflow = val ? "hidden" : "visible");



const MystEditor = () => {
  const { editorView, cache, options, collab, text, suggestMode } = useContext(MystState);
  const fullscreen = useSignal(false);
  useSignalEffect(() => hideBodyScrollIf(fullscreen.value));

  const preview = useRef(null);
  useEffect(() => {
    text.preview.value = preview.current;
  }, [preview.current]);
  
  useEffect(() => {
    if (options.parent) setupPreviewPopups(options.parent, text);
  }, []);

  useEffect(() => {
  return () => {
    document.removeEventListener("mousemove", onResize);
    document.removeEventListener("mouseup", stopResize);
  };
}, []);

  const alert = useSignal(null);
  const alertFor = (alertText, secs) => {
    alert.value = alertText;
    setTimeout(() => (alert.value = null), secs * 1000);
  };

  const buttonActions = useMemo(
    () => ({
      "copy-html": async () => {
        await text.copy();
        alertFor("copied!", 2);
      },
      fullscreen: () => (fullscreen.value = !fullscreen.peek()),
      refresh: () => {
        cache.transform.clear();
        text.rerender();
        alertFor("Rich links refreshed!", 1);
      },
      "suggest-mode": () => (suggestMode.value = !suggestMode.peek()),
    }),
    [],
  );

  const buttons = useMemo(
    () =>
      options.includeButtons.value.map((b) => ({
        ...b,
        action: b.action || buttonActions[b.id],
      })),
    [options.includeButtons.value, buttonActions],
  );


const [tocOpen, setTocOpen] = useState(false);
const [tocWidth, setTocWidth] = useState(260);
const [isResizing, setIsResizing] = useState(false);
const wrapperRef = useRef(null);
const resizing = useRef(false);

function startResize(ev) {
  ev.preventDefault();
  resizing.current = true;
  setIsResizing(true);
  document.addEventListener("mousemove", onResize);
  document.addEventListener("mouseup", stopResize);
}

function onResize(ev) {
  if (!resizing.current || !wrapperRef.current) return;
  const left = wrapperRef.current.getBoundingClientRect().left;
  const newWidth = Math.min(Math.max(ev.clientX - left, 150), 500);
  setTocWidth(newWidth);
}

function stopResize() {
  resizing.current = false;
  setIsResizing(false);
  document.removeEventListener("mousemove", onResize);
  document.removeEventListener("mouseup", stopResize);
}

  return (
    <StyleSheetManager target={options.parent}>
      <MystContainer id="myst-css-namespace">
        <ErrorModal />
        <ErrorBoundary>
          <EditorParent mode={options.mode.value} $fullscreen={fullscreen.value}>
            {options.topbar.value && <EditorTopbar alert={alert} buttons={buttons} />}
            {options.collaboration.value.enabled && !collab.value.ready.value && (
              <StatusBanner>Connecting to the collaboration server ...</StatusBanner>
            )}
            {options.collaboration.value.enabled && collab.value.lockMsg.value && <StatusBanner>{collab.value.lockMsg}</StatusBanner>}
            <MystWrapper ref={wrapperRef} className="myst-editor-wrapper" $fullscreen={fullscreen.value}>
              <TocToggleWrapper>
                <TocToggle open={tocOpen} onClick={() => setTocOpen((o) => !o)} title={tocOpen ? "Hide table of contents" : "Show table of contents"}>
                  {tocOpen ? "‹" : "›"}
                </TocToggle>
              </TocToggleWrapper>
              <TocPanel open={tocOpen} width={tocWidth} resizing={isResizing}>
                {tocOpen && <TableOfContents compact />}
                {tocOpen && <ResizeHandle onMouseDown={startResize} />}
              </TocPanel>
              <FlexWrapper id="editor-wrapper" className="flex-wrapper">
                <CodeMirror />
              </FlexWrapper>
              <FlexWrapper id="preview-wrapper" className="flex-wrapper">
                <Preview
                  className="myst-preview"
                  ref={preview}
                  mode={options.mode.value}
                  onClick={(ev) => {
                    try {
                      if (options.onPreviewClick.value?.(ev)) return;

                      /*const dropdownHeader = ev.target.closest(".admonition.dropdown > header");
                      if (dropdownHeader) {
                        dropdownHeader.parentElement.classList.toggle("open");
                        return;
                      }*/

                      const anchorLink = ev.target.closest('a[href^="#"]');
                      if (anchorLink) {
                        ev.preventDefault();
                        const targetId = decodeURIComponent(anchorLink.getAttribute("href").slice(1));
                        const targetEl = options.parent?.querySelector?.(`#${CSS.escape(targetId)}`);
                        targetEl?.scrollIntoView({ behavior: "smooth", block: "start" });
                        return;
                      }

                      syncCheckboxes(ev, text.lineMap, editorView.value);

                      if (options.syncScroll.value && options.mode.value == "Both") {
                        handlePreviewClickToScroll(ev, text.lineMap, preview, editorView.value);
                      }
                    } catch (e) {
                      console.error("The following error occured while handling a click on the preview pane");
                      console.error(e);
                    }
                  }}
                >
                  <PreviewFocusHighlight className="cm-previewFocus" />
                </Preview>
              </FlexWrapper>
              {options.mode.value === "Diff" && (
                <FlexWrapper className="flex-wrapper">
                  <Diff />
                </FlexWrapper>
              )}
              {options.mode.value == "Resolved" &&
                options.collaboration.value.commentsEnabled &&
                options.collaboration.value.resolvingCommentsEnabled &&
                collab.value.ready.value && (
                  <FlexWrapper id="resolved-wrapper" className="flex-wrapper">
                    <ResolvedComments />
                  </FlexWrapper>
                )}
              {options.mode.value === "Outline" && (
                <FlexWrapper className="flex-wrapper">
                  <TableOfContents />
                </FlexWrapper>
              )}
            </MystWrapper>
          </EditorParent>
        </ErrorBoundary>
      </MystContainer>
    </StyleSheetManager>
  );
};

export default ({ additionalStyles, id, ...params }, /** @type {HTMLElement} */ target) => {
  if (!target.shadowRoot) {
    target.attachShadow({
      mode: "open",
    });
  }
  if (additionalStyles) {
    target.shadowRoot.adoptedStyleSheets = target.shadowRoot.adoptedStyleSheets.filter((s) => !additionalStyles.includes(s));
    target.shadowRoot.adoptedStyleSheets.push(...(Array.isArray(additionalStyles) ? additionalStyles : [additionalStyles]));
  }
  params.parent = target.shadowRoot;

  const editorId = id ?? crypto.randomUUID();
  if (!window.myst_editor) window.myst_editor = {};
  if (editorId in window.myst_editor) {
    throw `Editor with id ${editorId} is already on the page. Pick a different id, or leave it empty for a random one.`;
  }
  window.myst_editor[editorId] = {};

  const form = target.closest("form");
  if (form) {
    form.addEventListener("formdata", (e) => e.formData.append(params.name, window.myst_editor[editorId].text));
  }

  const state = createMystState({ id: editorId, ...params });
  window.myst_editor[editorId].state = state;
  const logger = createLogger(state);
  window.myst_editor[editorId].logger = logger;

  state.options.onReady.value?.({ state, git: null });

  // cleanup function
  function remove() {
    state.cleanups.forEach((c) => c());
    delete window.myst_editor[editorId];
    render(null, target.shadowRoot);
  }
  window.myst_editor[editorId].remove = remove;
  // runs Preact cleanup logic when target is removed
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (Array.prototype.some.call(mutation.removedNodes, (n) => n == target)) {
        remove();
        observer.disconnect();
      }
    }
  });
  observer.observe(target.parentElement, { childList: true });

  render(
    <MystState.Provider value={state}>
      <Logger.Provider value={logger}>
        <MystEditor />
      </Logger.Provider>
    </MystState.Provider>,
    target.shadowRoot,
  );

  return state;
};

export { defaultButtons, predefinedButtons, batch, computed, signal, effect, MystEditor as MystEditorPreact };
export { default as MystEditorGit } from "./myst-git/MystEditorGit";
export { CollaborationClient } from "./collaboration";
export { darkTheme, lightTheme } from "./styles/MystStyles";
