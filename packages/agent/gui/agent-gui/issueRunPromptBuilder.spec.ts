import { describe, expect, it } from "vitest";
import { buildIssueRunPrompt } from "./issueRunPromptBuilder";

const issue = {
  content: "[spec](/workspace/spec.md)",
  creatorUserId: "local",
  description: "",
  issueId: "issue-1",
  priority: "medium" as const,
  roomId: "room-1",
  status: "not_started" as const,
  title: "Port renderer"
};

describe("buildIssueRunPrompt", () => {
  it("builds English prompt copy by default", () => {
    const prompt = buildIssueRunPrompt({
      issue,
      runId: "run-1",
      taskContent: "",
      taskTitle: "Implement shell",
      workspaceRoot: "/tmp/workspace"
    });

    expect(prompt).toContain("You are handling a task.");
    expect(prompt).toContain("Task title: Implement shell");
    expect(prompt).toContain("References:");
    expect(prompt).not.toContain("你正在处理一个任务。");
  });

  it("builds Chinese prompt copy when requested", () => {
    const prompt = buildIssueRunPrompt({
      issue,
      locale: "zh-CN",
      runId: "run-1",
      taskContent: "",
      taskTitle: "Implement shell",
      workspaceRoot: "/tmp/workspace"
    });

    expect(prompt).toContain("你正在处理一个任务。");
    expect(prompt).toContain("任务标题: Implement shell");
    expect(prompt).toContain("引用资料:");
    expect(prompt).not.toContain("You are handling a task.");
  });
});
