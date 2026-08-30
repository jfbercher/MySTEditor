import styled from "styled-components";

export const MystCSSVars = styled.div`
  /* ─────────────────────────────────────────
   * Common
   * ───────────────────────────────────────── */

  --gray-900: #333;
  --gray-800: #5c5c5c;
  --gray-700: #88818c;
  --gray-600: #cccccc;
  --gray-500: #dadada;
  --gray-400: #e5e5e5;
  --gray-300: #e8e6e8;
  --gray-200: #f8f8f8;
  --gray-100: #f9f9f9;

  --blue-500: #0083e1;
  --blue-200: #82cfe6;
  --blue-100: #c1e4ef;

  --red-500: #e74a3c;
  --red-400: #fae6e6;

  --orange-500: #f59e0b;

  --green-500: #00af91;
  --green-400: #00ccaa;
  --green-300: #ecfce6;

  --brown-500: #940;

  /* ─────────────────────────────────────────
   * Common variables
   * ───────────────────────────────────────── */

  --border-2: 3px;
  --border-radius: 5px;
`;


export const lightTheme = new CSSStyleSheet();

lightTheme.replaceSync(`
  #myst-css-namespace {
    color: #333;
    color-scheme: light;

    --accent: var(--blue-200);
    --accent-light: var(--blue-100);
    --accent-dark: var(--blue-500);

    --border: var(--gray-600);

    --navbar-bg: var(--gray-200);
    --button-bg: white;
    --button-bg-hover: var(--gray-400);

    --modal-bg: white;
    --switch-bg: var(--gray-500);
    --switch-active-bg: var(--blue-500);

    --panel-bg: white;
    --box-shadow: var(--gray-600);

    --icon-invert: 0;

    --string-fg: var(--brown-500);
    --deleted-bg: var(--red-400);
    --inserted-bg: var(--green-300);

    --editor-subtitle:  #333;

    --editor-bg: var(--gray-200);
    --editor-gutter-fg: var(--gray-800);
    --editor-selection-bg: rgb(215, 212, 240);
    --editor-active-line-bg: #cceeff44;
    --editor-cursor: #333;

    --error-bg: var(--red-500);

    /* CodeMirror */
    --tok-heading: #0550ae;
    --tok-meta: #6e7781;
    --tok-link: #0969da;
    --tok-url: #116329;
    --tok-label: #8250df;
    --tok-keyword: #cf222e;
    --tok-string: #0a3069;
    --tok-comment: #6e7781;

    --editor-title: #003366;

  }
`);


export const darkTheme = new CSSStyleSheet();

darkTheme.replaceSync(`
  #myst-css-namespace {
    color: white;
    color-scheme: dark;

    --accent: #0083e1;
    --accent-light: #82cfe6;
    --accent-dark: rgb(121, 192, 255);

    --border: #878787;

    --navbar-bg: #1a1a1a;
    --button-bg: #333;
    --button-bg-hover: #5c5c5c;

    --modal-bg: #1a1a1a;
    --switch-bg: #5c5c5c;
    --switch-active-bg: #0083e1;

    --panel-bg: #1a1a1a;
    --box-shadow: #333;

    --icon-invert: 1;

    --string-fg: #ffa657;
    --deleted-bg: #e74a3cb2;
    --inserted-bg: #00af91b2;

    --editor-subtitle: #ddd;

    --editor-bg: #2a2a2a;
    --editor-gutter-fg: #ddd;
    --editor-selection-bg: #d7d4f020;
    --editor-active-line-bg: #cceeff10;
    --editor-cursor: #fff;

    --error-bg: #f5766e;

    /* CodeMirror */
    --tok-heading: #79c0ff;
    --tok-meta: #8b949e;
    --tok-link: #58a6ff;
    --tok-url: #7ee787;
    --tok-label: #d2a8ff;
    --tok-keyword: #ff7b72;
    --tok-string: #a5d6ff;
    --tok-comment: #8b949e;

    --editor-title: #79c0ff;
  }
`);

export const MystContainer = styled(MystCSSVars)`
  all: initial;
  font-family: "Lato", sans-serif;
  height: 100%;

  @media print {
    @page {
      margin: 1.5cm !important;
    }
  }

  .todo {
    background-color: yellow;
  }

  .file-link {
    color: var(--accent-dark);

    &:hover {
      cursor: pointer;
      text-decoration: underline;
    }
  }

  button,
  input,
  dialog,
  textarea {
    color: inherit;
  }

  ins {
    background: var(--inserted-bg);
  }

  del {
    background: var(--deleted-bg);
  }

  #tabs-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px 0 8px;
  background-color: var(--navbar-bg, #1a1a1a);
  border-bottom: 1px solid var(--border, #878787);
}

.myst-tab-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  background-color: var(--button-bg, #333);
  color: var(--editor-gutter-fg, inherit);
  border: 1px solid var(--border, transparent);
  border-bottom: none;
  font-family: inherit;
  font-size: 13px;
  user-select: none;
  transition: background-color 0.2s, color 0.2s;
}

.myst-tab-button:hover {
  background-color: var(--button-bg-hover, #5c5c5c);
}

.myst-tab-button.active {
  background-color: var(--panel-bg, #ffffff);
  color: var(--accent-dark, #0083e1);
  font-weight: bold;
}

.myst-tab-close {
  opacity: 0.6;
  font-weight: bold;
  padding: 0 2px;
  border-radius: 3px;
}

.myst-tab-close:hover {
  opacity: 1;
  color: var(--error-bg, #e74a3c);
}

#new-tab-button {
  cursor: pointer;
  border: 1px solid var(--border, transparent);
  background-color: var(--button-bg, #333);
  color: inherit;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 14px;
  line-height: 1;
  margin-bottom: 4px;
  transition: background-color 0.2s;
}

#new-tab-button:hover {
  background-color: var(--button-bg-hover, #5c5c5c);
}
`;