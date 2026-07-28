import { ChangeSpec } from "@codemirror/state";
import { test, expect, Page } from "@playwright/test";
import { EditorView } from "codemirror";
import fs from "fs/promises";
import { createMystState } from "../src/mystState";
import { DEMO_FEATURE_TIP } from "../src/myst-git/demo-data.js";

declare global {
  interface Window {
    myst_editor: Record<
      string,
      {
        text: string;
        main_editor: EditorView;
        state: ReturnType<typeof createMystState>;
      }
    >;
  }
}

const id = "demo";

test.describe.parallel("With collaboration disabled", () => {
  test.beforeEach(async ({ page }) => {
    await applyPageOpts(page, { collab: "false" });
  });

  test("Loads initial document", async ({ page }) => {
    await expect(async () => {
      const editorContent = await page.evaluate((id) => window.myst_editor[id].text, id);
      expect(editorContent).toMatch(/^# This is MyST Editor/);
      expect(editorContent.indexOf(editorContent.slice(0, 20))).toBe(editorContent.lastIndexOf(editorContent.slice(0, 20))); // Assert that content isn't duplicated
    }).toPass();
  });

  test("Caches async transforms", async ({ page }) => {
    await clearEditor(page);
    const todayDate = new Date().toLocaleString("en-GB", { timeZone: "UTC" }).split(" ")[0];

    // |date| gets transformed for the first time
    await insertChangesAndCheckOutput(
      page,
      {
        from: 0,
        insert: "blah blah |date| blah blah",
      },
      (html) => expect(html).toContain(todayDate),
    );

    // Find out what the transform has returned
    const previewContent = (await page.locator(".myst-preview").first().textContent()) as string;
    const time = previewContent.split(" ")[3];

    await page.waitForTimeout(2000);

    // Assert that the next |date| returns the same time as the first one
    await clearEditor(page);
    await insertChangesAndCheckOutput(
      page,
      {
        from: 0,
        insert: "blah blah |date| blah blah",
      },
      (html) => expect(html).toContain(time),
    );

    // But if we click the refresh button then the transform will be updated and output will be different
    await page.getByTitle("Refresh issue links").click();
    await insertChangesAndCheckOutput(page, null, (html) => expect(html).not.toContain(time));
  });

  test.describe("Renders input", () => {
    [1, 2, 3].forEach((header) => {
      test("Renders header: " + header, async ({ page }) => {
        await clearEditor(page);
        await insertChangesAndCheckOutput(
          page,
          {
            from: 0,
            insert: "#".repeat(header) + " Some title",
          },
          (html) => expect(html.match(`<h${header}.*>Some title`)).toHaveLength(1),
        );
      });
    });

    test("Renders synchronous transforms", async ({ page }) => {
      await clearEditor(page);
      await insertChangesAndCheckOutput(
        page,
        {
          from: 0,
          insert: "blah blah @some-user blah  blah ",
        },
        (html) => expect(html).toContain(`<a href="https://github.com/some-user">`),
      );
    });

    test("Renders async transforms", async ({ page }) => {
      const today = new Date().toLocaleString("en-GB", { timeZone: "UTC" });
      const [date, time] = today.split(" ");
      await clearEditor(page);
      await insertChangesAndCheckOutput(
        page,
        {
          from: 0,
          insert: "blah blah |date| blah blah",
        },
        (html) => expect(html).toContain(date),
      );
    });

    test("Renders custom roles", async ({ page }) => {
      await clearEditor(page);
      await insertChangesAndCheckOutput(
        page,
        {
          from: 0,
          insert: "blah blah {say}`something` blah blah",
        },
        (html) => expect(html).toContain(" says: 'something'"),
      );
    });
  });

  test("Copy as HTML button copies to clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-write", "clipboard-read"]);
    await page.getByTitle("Copy document as HTML").click();
    await page.waitForSelector(".topbar-alert");
    await expect(async () => {
      const clipboard = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboard).toContain("<h1>");
    }).toPass();
  });

  test("Mermaid diagrams", async ({ page }) => {
    await clearEditor(page);
    await insertChangesAndCheckOutput(
      page,
      {
        from: 0,
        insert: `\`\`\`mermaid
graph TD
    A-->B
\`\`\``,
      },
      (html) => expect(html).toContain("<svg"),
    );
  });

  test.describe.parallel("Inline mode", () => {
    test("Starts properly", async ({ page }) => {
      await startInlineMode(page);
      await clearEditor(page);
      await insertToMainEditor(page, { from: 0, insert: `# |date|\n## Test heading\ntest123` });
      await page.waitForSelector(".cm-inline-rendered-md");
    });

    test.describe("Common transforms", () => {
      test("Bold text is being rendered", async ({ page }) => {
        await startInlineMode(page);
        await clearEditor(page);
        const text = "This text should render as bold";
        await insertToMainEditor(page, { from: 0, insert: `**${text}**` });
        await expect(page.locator(".cm-inline-rendered-md strong")).toHaveText(text);
      });

      test("Italic text is being rendered", async ({ page }) => {
        await startInlineMode(page);
        await clearEditor(page);
        const text = "This text should render as italic";
        await insertToMainEditor(page, { from: 0, insert: `_${text}_` });
        await expect(page.locator(".cm-inline-rendered-md em")).toHaveText(text);
      });

      test("Strikethrough text is being rendered", async ({ page }) => {
        await startInlineMode(page);
        await clearEditor(page);
        const text = "This text should render as strikethrough";
        await insertToMainEditor(page, { from: 0, insert: `~~${text}~~` });
        await expect(page.locator(".cm-inline-rendered-md s")).toHaveText(text);
      });
    });
  });

  test.describe.parallel("Suggestions", () => {
    test("Can accept suggestions", async ({ page }) => {
      await clearEditor(page);
      await insertToMainEditor(page, { from: 0, insert: `# {~~Heading~>Better heading~~}\nThis{++ is++} some text.\nThis is some text{-- text--}.` });
      await page.waitForSelector(".cm-critic-widget");
      await page.getByTitle("Accept suggestion").first().click();
      await page.getByTitle("Accept suggestion").first().click();
      await page.getByTitle("Accept suggestion").first().click();
      await expectEditorText(page, `# Better heading\nThis is some text.\nThis is some text.`);
    });

    test("Can reject suggestions", async ({ page }) => {
      await clearEditor(page);
      await insertToMainEditor(page, { from: 0, insert: `# {~~Heading~>Better heading~~}\nThis{++ is++} some text.\nThis is some text{-- text--}.` });
      await page.waitForSelector(".cm-critic-widget");
      await page.getByTitle("Reject suggestion").first().click();
      await page.getByTitle("Reject suggestion").first().click();
      await page.getByTitle("Reject suggestion").first().click();
      await expectEditorText(page, `# Heading\nThis some text.\nThis is some text text.`);
    });

    test("Can use suggest mode", async ({ page }) => {
      await clearEditor(page);
      await insertToMainEditor(page, { from: 0, insert: `# Heading` });
      await page.locator('[name="suggest-mode"]').click();
      await insertToMainEditor(page, { from: 2, to: 9, insert: `Better heading` });
      await expect(page.locator(".cm-critic-widget")).toBeVisible();
    });

    test("A multiline suggestion doesn't delete the paragraph above", async ({ page }) => {
      await clearEditor(page);
      await insertToMainEditor(page, {
        from: 0,
        insert: `Paragraph 1 {++
      The text here shouldn't overwrite the text above++}`,
      });
      const ins = page.locator("ins").first();
      await ins.waitFor();
      await expect(ins.locator("xpath=../span").filter({ hasText: "Paragraph 1" })).toBeVisible();
    });

    test("A multiline suggestion doesn't delete the paragraph below", async ({ page }) => {
      await clearEditor(page);
      await insertToMainEditor(page, {
        from: 0,
        insert: `Paragraph 1 {++
        The text here shouldn't overwrite the text below
        ++} Paragraph 2`,
      });
      const ins = page.locator("ins").last();
      await ins.waitFor();
      await expect(ins.locator("xpath=../span").filter({ hasText: "Paragraph 2" })).toBeVisible();
    });

    test("The original type of the block is preserved when using multiline suggestions", async ({ page }) => {
      await clearEditor(page);
      await insertToMainEditor(page, {
        from: 0,
        insert: `# Heading 1 {++
      The text here shouldn't overwrite the text above++}`,
      });
      const ins = page.locator("ins").first();
      await expect(ins).toHaveJSProperty("parentElement.tagName", "H1");
    });
  });

  test("Unfinished substitution suggestions don't cause the text inside to merge into the previous block", async ({ page }) => {
    await clearEditor(page);
    await insertToMainEditor(page, {
      from: 0,
      insert: `# Heading 1 {~~
This text shouldn't merge inside the previous block~~}`,
    });
    // Check whether the heading exists and whether the line under it is rendered in a seperate block.
    await expect(page.locator("html-chunk").locator("h1").locator("..").locator("p")).toHaveCount(1);
  });
});

test.describe.parallel("With collaboration enabled", () => {
  test("Keeps the initial document if collaborative state is empty", async ({ context }) => {
    const page = await applyPageOpts(await context.newPage(), defaultCollabOpts());

    await expect(async () => {
      const editorContent = await page.evaluate((id) => window.myst_editor[id].text, id);
      expect(editorContent).toMatch(/^# This is MyST Editor/);
      expect(editorContent.indexOf(editorContent.slice(0, 20))).toBe(editorContent.lastIndexOf(editorContent.slice(0, 20))); // Assert that content isn't duplicated
    }).toPass();
  });

  test("Rejects the initial document if collaborative state is not empty", async ({ context }) => {
    const collabOpts = defaultCollabOpts();
    const pageA = await applyPageOpts(await context.newPage(), collabOpts);

    // Initialize the document from pageA
    await clearEditor(pageA);
    await insertChangesAndCheckOutput(pageA, { from: 0, insert: "Some content" }, (html) => expect(html).toContain("Some content"));
    await pageA.close();

    // Open the document as another user and verify that the initial content was ignored
    const pageB = await applyPageOpts(await context.newPage(), collabOpts);

    await expect(async () => {
      const editorContent = await pageB.evaluate((id) => window.myst_editor[id].text, id);
      expect(editorContent).not.toContain("# This is MyST Editor");
      expect(editorContent).toContain("Some content");
      expect(editorContent.indexOf("Some content")).toBe(editorContent.lastIndexOf("Some content")); // Assert that content isn't duplicated
    }).toPass();
  });

  test("Synces document between peers", async ({ context }) => {
    const collabOpts = defaultCollabOpts();
    const pageA = await applyPageOpts(await context.newPage(), collabOpts);

    // Initialize the document from pageA and add some content
    await clearEditor(pageA);
    await insertChangesAndCheckOutput(pageA, { from: 0, insert: "This is from pageA!" }, (html) => expect(html).toContain("This is from pageA!"));

    // Open the document as another user and add some content
    const pageB = await applyPageOpts(await context.newPage(), collabOpts);
    await expect(async () => {
      const currentText = await pageB.evaluate((id) => window.myst_editor[id].text, id);
      expect(currentText).toBe("This is from pageA!");

      await insertChangesAndCheckOutput(
        pageB,
        {
          from: currentText.length,
          insert: "And this is from pageB!",
        },
        (html) => {
          // Verify that both contents are present
          expect(html).toContain("This is from pageA!");
          expect(html).toContain("And this is from pageB!");
        },
      );
    }).toPass();
  });

  test.describe("Comments", () => {
    test("Positions are synced", async ({ context }) => {
      const collabOpts = defaultCollabOpts();
      const pageA = await applyPageOpts(await context.newPage(), collabOpts);
      const pageB = await applyPageOpts(await context.newPage(), collabOpts);

      // Initialize the document from pageA and add some content
      await clearEditor(pageA);
      await insertChangesAndCheckOutput(pageA, { from: 0, insert: "Line1\nLine2\nLine3\nLine4" }, (html) => expect(html).toContain("Line4"));

      await addComment(pageA, 2);

      // Confirm that comment was added
      await expect(pageA.locator(".comment-wrapper")).toHaveCount(1);
      await expect(pageB.locator(".comment-wrapper")).toHaveCount(1);

      // Remove the comment from pageB
      await getCommentBtn(pageB, 2).hover({ force: true });
      await pageB.getByText("DELETE").click();

      // Verify that comment was removed on both peers
      await expect(pageB.locator(".comment-wrapper")).toHaveCount(0);
      await expect(pageA.locator(".comment-wrapper")).toHaveCount(0);
    });

    test("Can be dragged", async ({ context }) => {
      const collabOpts = defaultCollabOpts();
      const pageA = await applyPageOpts(await context.newPage(), collabOpts);
      const pageB = await applyPageOpts(await context.newPage(), collabOpts);

      // Initialize the document from pageA and add some content
      await clearEditor(pageA);
      await insertChangesAndCheckOutput(pageA, { from: 0, insert: "Line1\nLine2\nLine3\nLine4" }, (html) => expect(html).toContain("Line4"));

      await addComment(pageA, 1);

      const initialCommentPosition = await pageA
        .locator("div:has(> .comment-wrapper)")
        .first()
        .evaluate((e) => Number(e.getAttribute("top")));

      // Drag the comment
      await getCommentBtn(pageA, 1).hover({ force: true });
      await pageA.mouse.down();
      const box = await getCommentBtn(pageA, 3).boundingBox();
      expect(box).not.toBeNull();
      await pageA.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 5 });
      await pageA.mouse.up();

      await expect(pageA.locator(".comment-wrapper")).toHaveCount(1);
      await expect(pageB.locator(".comment-wrapper")).toHaveCount(1);

      // Confirm that the comment position has changed
      await expect(async () => {
        const newCommentPosition = await pageA
          .locator("div:has(> .comment-wrapper)")
          .first()
          .evaluate((e) => Number(e.getAttribute("top")));
        expect(newCommentPosition).toBeGreaterThan(initialCommentPosition);
      }).toPass();
    });

    test("Can be resolved", async ({ context }) => {
      const collabOpts = defaultCollabOpts();
      const pageA = await applyPageOpts(await context.newPage(), collabOpts);
      const pageB = await applyPageOpts(await context.newPage(), collabOpts);

      await addComment(pageA, 1);

      // Resolve the comment
      await getCommentBtn(pageA, 1).hover({ force: true });
      await pageA.locator("#demo-editor").getByText("RESOLVE").click();

      // Verify that it disappeared from the editor
      await expect(pageA.locator(".comment-wrapper")).toHaveCount(0);

      // Verify that it appeared in the resolved comments
      await openResolvedComments(pageA);
      await pageA.waitForSelector(".resolved-comment");
      await expect(pageA.locator(".resolved-comment")).toHaveCount(1);

      // Verify that the resolved comments are synced among peers
      await openResolvedComments(pageB);
      await pageB.waitForSelector(".resolved-comment");
      await expect(pageB.locator(".resolved-comment")).toHaveCount(1);
    });

    test("Can be deleted", async ({ context }) => {
      const collabOpts = defaultCollabOpts();
      const pageA = await applyPageOpts(await context.newPage(), collabOpts);
      const pageB = await applyPageOpts(await context.newPage(), collabOpts);

      await addComment(pageA, 1);

      // Resolve the comment
      await getCommentBtn(pageA, 1).hover({ force: true });
      await pageA.locator("#demo-editor").getByText("DELETE").click();

      // Verify it is gone
      await expect(pageA.locator(".comment-wrapper")).toHaveCount(0);
      await expect(pageB.locator(".comment-wrapper")).toHaveCount(0);
    });

    test("Can be merged", async ({ context }) => {
      const collabOpts = defaultCollabOpts();
      const pageA = await applyPageOpts(await context.newPage(), collabOpts);
      const pageB = await applyPageOpts(await context.newPage(), collabOpts);

      // Initialize the document from pageA and add some content
      await clearEditor(pageA);
      await insertChangesAndCheckOutput(pageA, { from: 0, insert: "Line1\nLine2\nLine3\nLine4" }, (html) => expect(html).toContain("Line4"));

      await addComment(pageA, 1, "1");
      await addComment(pageA, 3, "2");

      // Drag the comment
      // Locator.dragTo() has issues as reported in https://github.com/microsoft/playwright/issues/20254
      await getCommentBtn(pageA, 1).hover({ force: true });
      await pageA.mouse.down();
      const box = await getCommentBtn(pageA, 3).boundingBox();
      expect(box).not.toBeNull();
      await pageA.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 5 });
      await pageA.mouse.up();

      await expect(pageA.locator(".comment-wrapper")).toHaveCount(1);
      await expect(pageB.locator(".comment-wrapper")).toHaveCount(1);

      // Confirm the comment contents are merged
      await expect(pageA.locator(".cm-comment-author-colored").first()).toContainText("2");
      await expect(pageA.locator(".cm-comment-author-colored").last()).toContainText("1");
      await expect(pageB.locator(".cm-comment-author-colored").first()).toContainText("2");
      await expect(pageB.locator(".cm-comment-author-colored").last()).toContainText("1");
    });
  });

  test.describe("Resolved Comments", () => {
    test("Can be restored", async ({ context }) => {
      const collabOpts = defaultCollabOpts();
      const pageA = await applyPageOpts(await context.newPage(), collabOpts);
      const pageB = await applyPageOpts(await context.newPage(), collabOpts);

      // Switch to resolved comments view
      await openResolvedComments(pageA);
      await openResolvedComments(pageB);

      await addComment(pageA, 1);

      // Resolve the comment
      await getCommentBtn(pageA, 1).hover({ force: true });
      await pageA.locator("#demo-editor").getByText("RESOLVE").click();

      // Restore the comment
      await pageA.locator(".myst-dropdown-toggle").first().hover({ force: true });
      await pageA.locator(".myst-restore-btn").first().click();

      // Verify it is gone from resolved comments
      await expect(pageA.locator(".resolved-comment")).toHaveCount(0);
      await expect(pageB.locator(".resolved-comment")).toHaveCount(0);

      // Verify it appeared in the editor
      await expect(pageA.locator(".comment-wrapper")).toHaveCount(1);
      await expect(pageB.locator(".comment-wrapper")).toHaveCount(1);
    });

    test("Can be occupied and restored", async ({ context }) => {
      const collabOpts = defaultCollabOpts();
      const pageA = await applyPageOpts(await context.newPage(), collabOpts);
      const pageB = await applyPageOpts(await context.newPage(), collabOpts);

      // Switch to resolved comments view
      await openResolvedComments(pageA);
      await openResolvedComments(pageB);

      await addComment(pageA, 1, "1");

      // Resolve the comment
      await getCommentBtn(pageA, 1).hover({ force: true });
      await pageA.locator("#demo-editor").getByText("RESOLVE").click();

      await addComment(pageA, 1, "2");

      // Restore the comment
      await pageA.locator(".myst-dropdown-toggle").first().hover({ force: true });
      await pageA.locator(".myst-restore-btn").first().click();

      // Verify it is gone from resolved comments
      await expect(pageA.locator(".resolved-comment")).toHaveCount(0);
      await expect(pageB.locator(".resolved-comment")).toHaveCount(0);

      // Verify it is in the editor and contains both lines
      await expect(pageA.locator(".cm-comment-author-colored").first()).toContainText("2");
      await expect(pageA.locator(".cm-comment-author-colored").last()).toContainText("1");
      await expect(pageB.locator(".cm-comment-author-colored").first()).toContainText("2");
      await expect(pageB.locator(".cm-comment-author-colored").last()).toContainText("1");
    });

    test("Can be orphaned and restored", async ({ context }) => {
      const collabOpts = defaultCollabOpts();
      const pageA = await applyPageOpts(await context.newPage(), collabOpts);
      const pageB = await applyPageOpts(await context.newPage(), collabOpts);

      // Switch to resolved comments view
      await openResolvedComments(pageA);
      await openResolvedComments(pageB);

      await addComment(pageA, 1);

      // Resolve the comment
      await getCommentBtn(pageA, 1).hover({ force: true });
      await pageA.locator("#demo-editor").getByText("RESOLVE").click();

      await clearEditor(pageA);

      // Restore comment
      await pageA.locator(".myst-dropdown-toggle").first().hover({ force: true });
      await pageA.locator(".myst-restore-btn").first().click();

      // Verify it is at the end of the document
      await expect(pageA.locator(".comment-wrapper")).toHaveCount(1);
      await expect(pageB.locator(".comment-wrapper")).toHaveCount(1);
    });

    test("Can be deleted", async ({ context }) => {
      const collabOpts = defaultCollabOpts();
      const pageA = await applyPageOpts(await context.newPage(), collabOpts);
      const pageB = await applyPageOpts(await context.newPage(), collabOpts);

      // Switch to resolved comments view
      await openResolvedComments(pageA);
      await openResolvedComments(pageB);

      await addComment(pageA, 1);

      // Resolve the comment
      await getCommentBtn(pageA, 1).hover({ force: true });
      await pageA.locator("#demo-editor").getByText("RESOLVE").click();

      // Delete the comment
      await pageA.locator(".myst-dropdown-toggle").first().hover({ force: true });
      await pageA.locator(".myst-delete-btn").first().click();

      // Verify it is gone
      await expect(pageA.locator(".resolved-comment")).toHaveCount(0);
      await expect(pageB.locator(".resolved-comment")).toHaveCount(0);
    });
  });

  test.describe("Dynamic options", () => {
    test("Can modify UI", async ({ context }) => {
      const collabOpts = defaultCollabOpts();
      const page = await applyPageOpts(await context.newPage(), collabOpts);
      await page.evaluate(() => {
        window.myst_editor.demo.state.options.title.value = "Playwright";
        const btns = window.myst_editor.demo.state.options.includeButtons.value;
        window.myst_editor.demo.state.options.includeButtons.value = [...btns, { id: "test", text: "test" }];
        window.myst_editor.demo.state.options.mode.value = "Resolved";
      });

      await expect(page.locator("#document-title")).toContainText("Playwright");
      await page.evaluate(() => {
        window.myst_editor.demo.state.options.subtitle.value = "A subtitle";
      });
      await expect(page.locator("#document-subtitle")).toContainText("A subtitle");
      await expect(page.locator("#topbar .side:last-child .btns button")).toHaveCount(2);
      await expect(page.locator("#resolved-wrapper")).toBeVisible();
    });

    test("Can change rooms", async ({ context }) => {
      const collabOpts = defaultCollabOpts();
      // A, B - room 0
      const pageA = await applyPageOpts(await context.newPage(), collabOpts);
      const pageB = await applyPageOpts(await context.newPage(), collabOpts);

      await clearEditor(pageA);
      const text0 = "this is room 0";
      await insertToMainEditor(pageA, { from: 0, insert: text0 });
      await expectEditorText(pageB, text0);

      const text1 = "this is room 1";
      const room1 = collabOpts.room + "1";
      // A - join room 1
      await changeRoom(pageA, room1);
      await clearEditor(pageA);
      await insertToMainEditor(pageA, { from: 0, insert: text1 });
      await expectEditorText(pageA, text1);

      await expectEditorText(pageB, text0);
      // B - join room 1
      await changeRoom(pageB, room1);
      await expectEditorText(pageB, text1);
    });
  });

  test("Resolved suggestions are shown", async ({ context }) => {
    const collabOpts = defaultCollabOpts();
    const pageA = await applyPageOpts(await context.newPage(), collabOpts);
    const pageB = await applyPageOpts(await context.newPage(), collabOpts);

    await clearEditor(pageA);
    await insertToMainEditor(pageA, { from: 0, insert: `# {~~Heading~>Better heading~~}\nThis{++ is++} some text.\nThis is some text{-- text--}.` });
    await pageA.waitForSelector(".cm-critic-widget");

    await openResolvedComments(pageA);
    await pageA.getByTitle("Accept suggestion").first().click();
    await pageA.getByTitle("Reject suggestion").first().click();
    await pageA.getByTitle("Accept suggestion").first().click();
    await expect(pageA.locator(".resolved-suggestion")).toHaveCount(3);

    await openResolvedComments(pageB);
    await expect(pageB.locator(".resolved-suggestion")).toHaveCount(3);
  });
});

test.describe.parallel("MystEditorGit wrapper", () => {
  test("Shows branch and commit in subtitle", async ({ context }) => {
    const page = await applyPageOpts(await context.newPage(), defaultCollabOpts(), true);
    await expect(page.locator("[data-git-branch]")).toContainText("feature");
    await expect(page.locator("[data-git-commit]")).toContainText(DEMO_FEATURE_TIP);
  });

  test("Synces document between peers", async ({ context }) => {
    const collabOpts = defaultCollabOpts();
    const pageA = await applyPageOpts(await context.newPage(), collabOpts, true);

    // Initialize the document from pageA and add some content
    await clearEditor(pageA);
    await insertChangesAndCheckOutput(pageA, { from: 0, insert: "This is from pageA!" }, (html) => expect(html).toContain("This is from pageA!"));

    // Open the document as another user and add some content
    const pageB = await applyPageOpts(await context.newPage(), collabOpts, true);
    await expect(async () => {
      const currentText = await pageB.evaluate((id) => window.myst_editor[id].text, id);
      expect(currentText).toBe("This is from pageA!");

      await insertChangesAndCheckOutput(
        pageB,
        {
          from: currentText.length,
          insert: "And this is from pageB!",
        },
        (html) => {
          // Verify that both contents are present
          expect(html).toContain("This is from pageA!");
          expect(html).toContain("And this is from pageB!");
        },
      );
    }).toPass();
  });

  test("Switches rooms", async ({ context }) => {
    const collabOpts = defaultCollabOpts();
    const page = await applyPageOpts(await context.newPage(), collabOpts, true);

    async function checkRoomSwitch(roomId: number, action: () => Promise<void>) {
      await clearEditor(page);
      await insertToMainEditor(page, { from: 0, insert: `room ${roomId}` });
      await action();
      await page.waitForSelector(".cm-content");
      await expect(async () => {
        const text = await page.evaluate((id) => window.myst_editor[id].text, id);
        expect(text).not.toContain(`room ${roomId}`);
      }).toPass();
    }

    // commits first — pick a different revision than the current tip
    await checkRoomSwitch(1, async () => {
      await page.click("[data-git-commit]");
      await page.locator("#git-commit-picker[open]").waitFor();
      await page.locator("#git-commit-picker-list li").nth(1).click();
    });
    await checkRoomSwitch(2, async () => {
      await page.click("[data-git-branch]");
      await page.locator("#git-branch-picker[open]").waitFor();
      await page.locator("#git-branch-picker-list >> text=main").click();
    });
    await checkRoomSwitch(3, async () => {
      await page.locator(".file").nth(1).click();
    });
  });

  test("Commits changes", async ({ context }) => {
    const collabOpts = defaultCollabOpts();
    const pageA = await applyPageOpts(await context.newPage(), collabOpts, true);
    await clearEditor(pageA);
    await insertToMainEditor(pageA, { from: 0, insert: `change` });

    const pageB = await applyPageOpts(await context.newPage(), collabOpts, true);

    await pageA.getByTitle("Commit").click();
    // Check if document is locked for the other user
    await pageB.getByText("A commit is being prepared").waitFor();

    // Check if text used for commit contains the changes
    await expect(async () => {
      const textA = await pageA.evaluate((id) => window.myst_editor[id].text, id);
      expect(textA).toContain("change");
      const textB = await pageB.evaluate((id) => window.myst_editor[id].text, id);
      expect(textB).toContain("change");
    }).toPass();

    // Commit
    await pageA.click("button[type=submit]");
    await pageA.waitForSelector(".cm-content");

    await expect(async () => {
      const hashA = await pageA.evaluate((id) => window.myst_editor[id].git.commit.value.hash, id);
      const hashB = await pageB.evaluate((id) => window.myst_editor[id].git.commit.value.hash, id);
      expect(hashA).toMatch(/^offline-/);
      expect(hashB).toBe(hashA);
      await expect(pageA.locator("[data-git-commit]")).toContainText(hashA);
      await expect(pageB.locator("[data-git-commit]")).toContainText(hashB);
    }).toPass();
  });
});

/**
 * Inline mode projects TextManager's chunks (rendered from a debounced signal) onto the live
 * document, so anything reshaping the document faster than the projection can follow - undo,
 * multi-line edits, a remote peer's changes - risks the projection describing a document that no
 * longer exists. These drive real keys, because list continuation and indentation come from keymaps.
 */
test.describe.parallel("Inline mode document/projection consistency", () => {
  test.beforeEach(async ({ page }) => {
    await applyPageOpts(page, { collab: "false" });
    await startInlineMode(page);
    await clearEditor(page);
    await page.locator(".cm-content").click();
  });

  test("Undoing a nested list edit does not break the editor", async ({ page }) => {
    await page.keyboard.type("* foo");
    await page.keyboard.press("Enter");
    // Tab indents (indentWithTab). The markdown keymap that would continue the list is a user
    // setting and off by default, so the document is exactly what was typed.
    await page.keyboard.press("Tab");
    await page.keyboard.type("* baz");
    await expect(page.locator(".cm-inline-rendered-md").first()).toBeVisible();
    await expectEditorText(page, "* foo\n  * baz");

    await page.keyboard.press("Control+z");
    await expectEditorText(page, "* foo\n");

    // Still editable afterwards: a thrown projection error leaves the editor dead.
    await page.keyboard.type("qux");
    await expectEditorText(page, "* foo\nqux");
  });

  test("Repeated undo/redo of multi-line edits keeps rendering", async ({ page }) => {
    // A paragraph that only ends at the blank line, then a list - both span several source lines.
    await page.keyboard.type("first line\nsecond line\nthird line\n\n* item one\n* item two");
    await expect(page.locator(".cm-inline-rendered-md").first()).toBeVisible();

    // How far each step rewinds is not asserted: history groups changes by time (500ms by default),
    // so the number of edits per undo depends on how fast the keystrokes above were delivered.
    for (let i = 0; i < 6; i++) await page.keyboard.press("Control+z");
    for (let i = 0; i < 3; i++) await page.keyboard.press("Control+y");

    // Whatever it rewound to, the editor must still accept input and render.
    await clearEditor(page);
    await page.keyboard.type("* after churn\n\nsecond block");
    await expectEditorText(page, "* after churn\n\nsecond block");
    // The caret is in the last block, which stays as source, so the first block must be rendered.
    await expect(page.locator(".cm-inline-rendered-md").first()).toBeVisible();
  });

  test("Every source line of a soft-wrapped paragraph stays a real line", async ({ page }) => {
    await page.keyboard.type("alpha\nbeta\ngamma");
    await expectEditorText(page, "alpha\nbeta\ngamma");

    // Otherwise the caret and the gutter lose track of the lines inside the paragraph.
    await expect(page.locator(".cm-content .cm-line")).toHaveCount(3);
  });

  test("A blank line under the caret is shown as source", async ({ page }) => {
    await page.keyboard.type("alpha\n\nbeta");
    await expectEditorText(page, "alpha\n\nbeta");

    await page.keyboard.press("Control+Home");
    await page.keyboard.press("ArrowDown");
    // Blank lines belong to no rendered block. Without this they keep the rendered font, so their
    // indentation is laid out at the wrong width and the caret looks misplaced.
    await expect(page.locator(".cm-content .cm-line").nth(1)).toHaveClass(/cm-inline-source-line/);
  });

  test("A line holding only indentation is shown as source", async ({ page }) => {
    await page.keyboard.type("alpha");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expectEditorText(page, "alpha\n  ");

    await expect(page.locator(".cm-content .cm-line").nth(1)).toHaveClass(/cm-inline-source-line/);
  });

  test("Extending a selection across rendered blocks keeps the anchor", async ({ page }) => {
    await page.keyboard.type("* one\n* two\n* three");
    await page.keyboard.press("Control+Home");
    for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowDown");

    const { anchor, head } = await page.evaluate((id) => {
      const sel = window.myst_editor[id].main_editor.state.selection.main;
      return { anchor: sel.anchor, head: sel.head };
    }, id);
    // Collapsed means the jump-over-widget filter dropped the anchor.
    expect(head).not.toBe(anchor);
    expect(anchor).toBe(0);
  });

  test("Moving the selection before re-project after a delete does not break the editor", async ({ page }) => {
    await page.keyboard.type("line one\nline two\n\n- [ ] task\n\ntrailing");
    await expect(page.locator(".cm-inline-rendered-md").first()).toBeVisible();

    // Covers the gap between a doc-shaping edit and the next rAF re-project — e.g. another user
    // deletes a block above your cursor and you arrow-key before inlineRefreshEffect lands.
    // Delete and move selection in one turn; yielding to Playwright would cross that window.
    await page.evaluate((id) => {
      const view = window.myst_editor[id].main_editor;
      const removed = "line one\nline two\n\n".length;
      view.dispatch({ changes: { from: 0, to: removed }, selection: { anchor: view.state.doc.length - removed } });
      view.dispatch({ selection: { anchor: 0 } });
      view.dispatch({ changes: { from: view.state.doc.length, insert: "!" } });
    }, id);

    await expectEditorText(page, "- [ ] task\n\ntrailing!");
  });
});

test.describe.parallel("Inline mode with concurrent editors", () => {
  const openPair = async (context: { newPage: () => Promise<Page> }) => {
    const collabOpts = defaultCollabOpts();
    const pageA = await applyPageOpts(await context.newPage(), collabOpts);
    const pageB = await applyPageOpts(await context.newPage(), collabOpts);
    await startInlineMode(pageA);
    await startInlineMode(pageB);
    await clearEditor(pageA);
    return { pageA, pageB };
  };

  const expectConverged = (pageA: Page, pageB: Page) =>
    expect(async () => {
      const textA = await pageA.evaluate((id) => window.myst_editor[id].text, id);
      const textB = await pageB.evaluate((id) => window.myst_editor[id].text, id);
      expect(textB).toBe(textA);
    }).toPass();

  test("One peer's undo does not break the other peer's editor", async ({ context }) => {
    const { pageA, pageB } = await openPair(context);

    await pageA.locator(".cm-content").click();
    const shared = "* shared one\n* shared two\n\nparagraph line\nsecond line";
    await pageA.keyboard.type(shared);
    await expectEditorText(pageB, shared);

    // A undoes while B types: B is re-projecting while remote changes reshape its document.
    await pageB.locator(".cm-content").click();
    await pageB.keyboard.press("Control+End");
    for (let i = 0; i < 5; i++) {
      await pageA.keyboard.press("Control+z");
      await pageB.keyboard.type("B");
    }

    // The churned-up result itself is not asserted, as it depends on how A's undos and B's inserts
    // interleave. What matters is that A still accepts input and both peers agree on the outcome -
    // convergence alone would not show the former, since two frozen editors also agree.
    await pageA.keyboard.type("A-END");
    await expectEditorText(pageA, "A-END", { exact: false });
    await expectConverged(pageA, pageB);
  });

  test("Concurrent multi-line edits converge and keep rendering", async ({ context }) => {
    const { pageA, pageB } = await openPair(context);

    await pageA.locator(".cm-content").click();
    await pageA.keyboard.type("start\n");
    await expect(async () => {
      expect(await pageB.evaluate((id) => window.myst_editor[id].text, id)).toContain("start");
    }).toPass();

    await pageB.locator(".cm-content").click();
    await pageB.keyboard.press("Control+End");
    await Promise.all([pageA.keyboard.type("\n* a1\n* a2\n\npara a"), pageB.keyboard.type("\n* b1\n* b2\n\npara b")]);

    await expectConverged(pageA, pageB);
    await expect(pageA.locator(".cm-inline-rendered-md").first()).toBeVisible();
    await expect(pageB.locator(".cm-inline-rendered-md").first()).toBeVisible();
  });
});

test("dist/MystEditor.js exports src/MystEditor.js module", async () => {
  const module = await fs.readFile("dist/MystEditor.js");
  expect(module.length).toBeGreaterThan(3000);

  const moduleContent = module.toString();

  ["spellcheckOpts", "transforms", "collaboration", "ycomments", "commentsEnabled"].forEach((s) => expect(moduleContent).toContain(s));
});

///////////////////////// UTILITY FUNCTIONS /////////////////////////

const insertToMainEditor = (page: Page, changes: ChangeSpec | null): Promise<void> /** @ts-ignore */ =>
  page.evaluate(({ changes, id }) => window.myst_editor[id].main_editor.dispatch({ changes }), { changes, id });

/**
 * Waits for the editor's text to settle on `expected` - or, with `exact: false`, to contain it.
 * Retrying is needed because the text trails the document, being updated from a debounced signal.
 */
const expectEditorText = (page: Page, expected: string, { exact = true } = {}) =>
  expect(async () => {
    const text = await page.evaluate((id) => window.myst_editor[id].text, id);
    if (exact) expect(text).toBe(expected);
    else expect(text).toContain(expected);
  }).toPass();

const clearEditor = async (page: Page) => {
  const currentText = await page.evaluate((id) => window.myst_editor[id].text, id);
  await insertToMainEditor(page, {
    from: 0,
    to: currentText.length,
    insert: "",
  });
};

const defaultCollabOpts = () => ({ collab_server: "ws://localhost:4455", room: crypto.randomUUID(), repo: `repos/${crypto.randomUUID()}` });

const collaborationReady = (page: Page) => page.waitForFunction((id) => window?.myst_editor[id]?.state?.collab?.value?.ready?.value, id);

const insertChangesAndCheckOutput = async (page: Page, changes: ChangeSpec | null, check: (html: string) => void | Promise<void>) => {
  await insertToMainEditor(page, changes);
  await expect(async () => {
    const preview = await page.locator(".myst-preview").first().innerHTML();
    check(preview);
  }).toPass();
};

const applyPageOpts = async (page: Page, opts: object, git = false) => {
  let query = new URLSearchParams();
  Object.entries(opts).forEach(([k, v]) => query.set(k, v));

  // Fail on errors
  page.on("pageerror", (err) => {
    throw new Error(`Unhandled page exception: ${err.stack || err}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      throw new Error(`Console error: ${msg.text()} ${JSON.stringify(msg.location())}`);
    }
  });

  await page.goto(`${git ? "/myst-git/git.html" : "/"}?` + query.toString());
  await page.waitForSelector(".cm-content");
  if ("collab_server" in opts) {
    await collaborationReady(page);
  }
  // Wait for initial text
  await expect(async () => {
    const text = await page.evaluate((id) => window.myst_editor[id].text, id);
    expect(text).not.toHaveLength(0);
  }).toPass();
  return page;
};

const getCommentBtn = (page: Page, lineNumber: number) =>
  page.locator(`.cm-gutters > .cm-gutter:first-child > .cm-gutterElement:nth-child(${lineNumber + 1}) .comment-gutter-icon`);

const addComment = async (page: Page, lineNumber: number, text?: string) => {
  await getCommentBtn(page, lineNumber).click();
  if (text) {
    await page.locator(`[data-comment-line="${lineNumber}"] .cm-line`).first().fill(text);
  }
  await page.mouse.move(0, 0);
};

const openResolvedComments = async (page: Page) => {
  await page.hover(".more");
  await page.click('[name="resolved"]');
};

async function changeRoom(page: Page, room: string) {
  await page.evaluate(
    ({ id, room }) => {
      const collab = window.myst_editor[id].state.options.collaboration.value;
      window.myst_editor[id].state.options.collaboration.value = { ...collab, room };
    },
    { id, room },
  );
  await page.waitForSelector(".cm-content");
  await collaborationReady(page);
  await expect(async () => {
    const text = await page.evaluate((id) => window.myst_editor[id].main_editor?.state?.doc?.toString?.(), id);
    expect(text).not.toHaveLength(0);
  }).toPass();
}

const startInlineMode = async (page: Page) => {
  await page.getByTitle("Inline Preview").click();
  await expect(page.locator("#preview-wrapper")).toHaveCSS("display", "none");
};
