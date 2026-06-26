import assert from "node:assert/strict";
import test from "node:test";

import { issueManagerStatusBadgeVariant } from "./IssueManagerStatusBadge.ts";
import { resolveIssueManagerStatusPresentation } from "./IssueManagerStatusPresentation.ts";

test("issue manager statuses map to semantic badge variants", () => {
  assert.equal(issueManagerStatusBadgeVariant("not_started"), "default");
  assert.equal(issueManagerStatusBadgeVariant("running"), "accent");
  assert.equal(issueManagerStatusBadgeVariant("in_progress"), "accent");
  assert.equal(issueManagerStatusBadgeVariant("pending_acceptance"), "pending");
  assert.equal(issueManagerStatusBadgeVariant("completed"), "success");
  assert.equal(issueManagerStatusBadgeVariant("failed"), "destructive");
  assert.equal(issueManagerStatusBadgeVariant("canceled"), "muted");
});

test("issue manager statuses map to mention tones", () => {
  assert.equal(
    resolveIssueManagerStatusPresentation("not_started").mentionTone,
    "neutral"
  );
  assert.equal(
    resolveIssueManagerStatusPresentation("running").mentionTone,
    "blue"
  );
  assert.equal(
    resolveIssueManagerStatusPresentation("in_progress").mentionTone,
    "blue"
  );
  assert.equal(
    resolveIssueManagerStatusPresentation("pending_acceptance").mentionTone,
    "purple"
  );
  assert.equal(
    resolveIssueManagerStatusPresentation("completed").mentionTone,
    "green"
  );
  assert.equal(
    resolveIssueManagerStatusPresentation("failed").mentionTone,
    "red"
  );
  assert.equal(
    resolveIssueManagerStatusPresentation("canceled").mentionTone,
    "neutral"
  );
});
