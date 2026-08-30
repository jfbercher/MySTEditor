import { useContext, useMemo } from "preact/hooks";
import styled from "styled-components";
import { MystState } from "../mystState";
import { useSignalEffect } from "@preact/signals";
import { scrollToPos } from "../utils";
import { numberHeadings } from "../utils/headingNumbering";

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
`;

function Heading({ heading }) {
  let children;
  if (heading.children.length > 0) {
    children = (
      <ul>
        {heading.children.map((c) => (
          <Heading key={c.pos} heading={c} />
        ))}
      </ul>
    );
  }
  return (
    <li>
      <span title="Go to heading" data-heading-pos={heading.pos}>
        {heading.number ? `${heading.number} - ` : ""}
        {heading.text}
      </span>
      {children}
    </li>
  );
}



export const TableOfContents = ({ compact = false }) => {
  const { headings, editorView, options, text, userSettings } = useContext(MystState);

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

  return (
    <Wrapper compact={compact}>
      <h1>Table of Contents</h1>
      <VerticalSparator />
      <HeadingList compact={compact} onClick={handleClick}>
        <ul>
          {numberedHeadings.map((h) => (
            <Heading heading={h} key={h.pos} />
          ))}
        </ul>
      </HeadingList>
    </Wrapper>
  );
};
