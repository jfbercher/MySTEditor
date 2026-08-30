import { useContext, useMemo,  useState } from "preact/hooks";
import styled from "styled-components";
import { MystState } from "../mystState";
import { useSignalEffect } from "@preact/signals";
import { scrollToPos } from "../utils";
import { numberHeadings } from "../utils/headingNumbering";
// For drag & drop of sections
import { moveSectionInText } from "../utils/sectionReorder";

const Wrapper = styled.div`
  background-color: var(--panel-bg);
  padding: 20px 0;
  box-sizing: border-box;
  height: 100%;
  border: 1px solid var(--border);
  box-shadow: inset 0px 0px 4px var(--box-shadow);
  border-radius: var(--border-radius);
  overflow-y: auto;
  overscroll-behavior: contain;

  & > h1 {
    font-size: 20px;
    padding-left: ${(props) => (props.compact ? "16px" : "100px")};
    margin-bottom: 0;
  }
`;


const VerticalSparator = styled.hr`
  border: none;
  height: 1px;
  background-color: var(--border);
  margin-top: 20px;
  margin-bottom: 0;
`;

const HeadingList = styled.div`
  margin-left: ${(props) => (props.compact ? "16px" : "100px")};
  margin-top: 20px;
  ul {
    list-style: none;
  }
  & > ul {
    padding-left: 0;
  }
  li {
    overflow: hidden;
  }
  li > span {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: bold;
    font-size: 18px;
    line-height: 150%;
    user-select: none;
    &:hover {
      text-decoration: underline;
      cursor: pointer;
    }
  }
  .dragging {
    opacity: 0.4;
  }
  .drop-before {
    box-shadow: inset 0 2px 0 0 var(--accent-dark, #06c);
  }
  .drop-after {
    box-shadow: inset 0 -2px 0 0 var(--accent-dark, #06c);
  }
`;

function findSiblingsArray(nodes, target, parentChildren = nodes) {
  for (const node of nodes) {
    if (node === target) return parentChildren;
    const found = findSiblingsArray(node.children, target, node.children);
    if (found) return found;
  }
  return null;
}


function Heading({ heading, dragState, setDragState, onDrop }) {
  const isDragged = dragState.dragged === heading;
  const isDropBefore = dragState.overNode === heading && dragState.overPosition === "before";
  const isDropAfter = dragState.overNode === heading && dragState.overPosition === "after";

  let children;
  if (heading.children.length > 0) {
    children = (
      <ul>
        {heading.children.map((c) => (
          <Heading key={c.pos} heading={c} dragState={dragState} setDragState={setDragState} onDrop={onDrop} />
        ))}
      </ul>
    );
  }

  return (
    <li
      draggable={!heading.isTitle}
      className={[isDragged ? "dragging" : "", isDropBefore ? "drop-before" : "", isDropAfter ? "drop-after" : ""].filter(Boolean).join(" ")}
      onDragStart={(ev) => {
        if (heading.isTitle) return;
        ev.stopPropagation();
        setDragState({ dragged: heading, overNode: null, overPosition: null });
      }}
      onDragOver={(ev) => {
        if (!dragState.dragged || dragState.dragged === heading) return;
        ev.preventDefault();
        ev.stopPropagation();
        const rect = ev.currentTarget.getBoundingClientRect();
        const position = ev.clientY - rect.top < rect.height / 2 ? "before" : "after";
        setDragState((s) => (s.overNode === heading && s.overPosition === position ? s : { ...s, overNode: heading, overPosition: position }));
      }}
      onDragLeave={(ev) => {
        ev.stopPropagation();
      }}
      onDrop={(ev) => {
        if (!dragState.dragged || dragState.dragged === heading) return;
        ev.preventDefault();
        ev.stopPropagation();
        onDrop(dragState.dragged, heading, dragState.overPosition ?? "before");
        setDragState({ dragged: null, overNode: null, overPosition: null });
      }}
      onDragEnd={() => setDragState({ dragged: null, overNode: null, overPosition: null })}
    >
      <span title="Go to heading" data-heading-pos={heading.pos}>
        {heading.number ? `${heading.number} ` : ""}
        {heading.text}
      </span>
      {children}
    </li>
  );
}

export const TableOfContents = ({ compact = false }) => {
  const { headings, editorView, options, text, userSettings } = useContext(MystState);
  const [dragState, setDragState] = useState({ dragged: null, overNode: null, overPosition: null });

  const numberingEnabled = userSettings.value.find((s) => s.id === "number-headers")?.enabled ?? false;
  const numberedHeadings = useMemo(
    () => (numberingEnabled ? numberHeadings(headings.value) : headings.value),
    [headings.value, numberingEnabled],
  );

  function handleClick(ev) {
    const posAttr = ev.target?.dataset?.headingPos;
    if (!posAttr) return;
    scrollToPos(parseInt(posAttr, 10), { editorView, options, text });
  }

  function handleDrop(draggedNode, targetNode, position) {
    // Restriction aux frères : refuse silencieusement si pas le même parent.
    const draggedSiblings = findSiblingsArray(headings.value, draggedNode);
    const targetSiblings = findSiblingsArray(headings.value, targetNode);
    if (draggedSiblings !== targetSiblings) return;

    console.log("AVANT --> draggedNode, targetNode, position, headings.value, text.text.value", draggedNode, targetNode, position, headings.value, text.text.value)
    const newText = moveSectionInText(draggedNode, targetNode, position, headings.value, text.text.value);
    editorView.value.dispatch({
      changes: { from: 0, to: editorView.value.state.doc.length, insert: newText },
    });
       console.log("APRÉS --> draggedNode, targetNode, position, headings.value, text.text.value", draggedNode, targetNode, position, headings.value, text.text.value)

  }

  return (
    <Wrapper compact={compact}>
      <h1>Table of Contents</h1>
      <VerticalSparator />
      <HeadingList compact={compact} onClick={handleClick}>
        <ul>
          {numberedHeadings.map((h) => (
            <Heading heading={h} key={h.pos} dragState={dragState} setDragState={setDragState} onDrop={handleDrop} />
          ))}
        </ul>
      </HeadingList>
    </Wrapper>
  );
};

