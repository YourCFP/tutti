import { describe, expect, it } from "vitest";
import { buildAgentComposerDraft } from "../model/agentComposerDraft";
import type { SubmittedDraftSnapshot } from "../model/agentGuiNodeTypes";
import {
  areAgentComposerDraftsEqual,
  clearSubmittedDraftIfUnchanged
} from "./agentGuiController.draftMessageHelpers";

describe("submitted composer draft cleanup", () => {
  const sourceScopeKey = "session:session-1";
  const submittedDraft = buildAgentComposerDraft({
    prompt: "Review this",
    images: [
      {
        id: "image-1",
        name: "screen.png",
        mimeType: "image/png",
        attachmentId: "attachment-1",
        previewUrl: "blob:image-1"
      }
    ],
    files: [
      {
        id: "file-1",
        name: "notes.md",
        path: "/workspace/notes.md"
      }
    ],
    largeTexts: [
      {
        id: "paste-1",
        name: "pasted-text.txt",
        text: "large pasted body",
        path: "/archive/paste-1.txt"
      }
    ]
  });
  const snapshot: SubmittedDraftSnapshot = {
    sourceScopeKey,
    content: submittedDraft.map((block) => ({ ...block }))
  };

  it("clears the entire source scope when its full content still matches", () => {
    const drafts = { [sourceScopeKey]: submittedDraft };
    const result = clearSubmittedDraftIfUnchanged({ drafts, snapshot });

    expect(result).not.toBe(drafts);
    expect(result[sourceScopeKey]).toEqual([{ type: "text", text: "" }]);
  });

  it("retains the entire current draft when text changes during submission", () => {
    const editedDraft = buildAgentComposerDraft({
      prompt: "Review this and the follow-up",
      images: [
        {
          id: "image-1",
          name: "screen.png",
          mimeType: "image/png",
          attachmentId: "attachment-1",
          previewUrl: "blob:image-1"
        }
      ]
    });
    const drafts = { [sourceScopeKey]: editedDraft };

    expect(clearSubmittedDraftIfUnchanged({ drafts, snapshot })).toBe(drafts);
  });

  it("treats attachment upload metadata as part of the atomic content", () => {
    const current = submittedDraft.map((block) =>
      block.type === "image" ? { ...block, uploading: true } : { ...block }
    );

    expect(areAgentComposerDraftsEqual(current, submittedDraft)).toBe(false);
    const drafts = { [sourceScopeKey]: current };
    expect(clearSubmittedDraftIfUnchanged({ drafts, snapshot })).toBe(drafts);
  });

  it("does not clear a different project or session scope", () => {
    const otherScopeKey = "session:session-2";
    const drafts = {
      [sourceScopeKey]: submittedDraft,
      [otherScopeKey]: buildAgentComposerDraft({ prompt: "Keep me" })
    };

    const result = clearSubmittedDraftIfUnchanged({ drafts, snapshot });
    expect(result[otherScopeKey]).toBe(drafts[otherScopeKey]);
  });
});
