package storesqlite

import (
	"context"
	"testing"
)

func TestListWorkspaceGeneratedFilesUsesCanonicalTurnProjection(t *testing.T) {
	t.Parallel()

	store := openTestStore(t, testOptions(&staticProjectPaths{paths: []string{
		"/workspace/project-a",
		"/workspace/project-b",
	}}))
	ctx := context.Background()
	const workspaceID = "workspace-generated-files"

	seedGeneratedFileSession(t, ctx, store, workspaceID, "wanted-session", testTargetIDCodex, "/workspace/project-a/apps/web")
	seedGeneratedFileSession(t, ctx, store, workspaceID, "other-target-session", testTargetIDClaude, "/workspace/project-a")
	seedGeneratedFileSession(t, ctx, store, workspaceID, "other-project-session", testTargetIDCodex, "/workspace/project-b")

	recordGeneratedFileTurn(t, ctx, store, workspaceID, "wanted-session", "turn-wanted", 100, []any{
		map[string]any{"path": "src/report.md", "change": "added"},
		map[string]any{"path": "/workspace/outside.md", "change": "added"},
	})
	recordGeneratedFileTurn(t, ctx, store, workspaceID, "other-target-session", "turn-other-target", 200, []any{
		map[string]any{"path": "other-target.md", "change": "added"},
	})
	recordGeneratedFileTurn(t, ctx, store, workspaceID, "other-project-session", "turn-other-project", 300, []any{
		map[string]any{"path": "other-project.md", "change": "added"},
	})

	result, ok, err := store.ListWorkspaceGeneratedFiles(ctx, ListWorkspaceGeneratedFilesInput{
		WorkspaceID:    workspaceID,
		SectionKey:     RailSectionKeyForProject("/workspace/project-a"),
		AgentTargetIDs: []string{testTargetIDCodex},
		Query:          "report",
		Limit:          10,
	})
	if err != nil || !ok {
		t.Fatalf("ListWorkspaceGeneratedFiles() ok=%v error=%v", ok, err)
	}
	if len(result.Files) != 1 || result.Files[0].Path != "/workspace/project-a/apps/web/src/report.md" {
		t.Fatalf("files = %#v, want only the selected section and target file", result.Files)
	}
}

func TestListWorkspaceGeneratedFilesUsesLatestPathState(t *testing.T) {
	t.Parallel()

	store := openTestStore(t, testOptions(&staticProjectPaths{paths: []string{"/workspace/project"}}))
	ctx := context.Background()
	const workspaceID = "workspace-generated-file-latest"
	const sessionID = "session-1"
	seedGeneratedFileSession(t, ctx, store, workspaceID, sessionID, testTargetIDCodex, "/workspace/project")

	recordGeneratedFileTurn(t, ctx, store, workspaceID, sessionID, "turn-added", 100, []any{
		map[string]any{"path": "report.md", "change": "added"},
	})
	recordGeneratedFileTurn(t, ctx, store, workspaceID, sessionID, "turn-deleted", 200, []any{
		map[string]any{"path": "report.md", "change": "deleted"},
	})

	input := ListWorkspaceGeneratedFilesInput{
		WorkspaceID: workspaceID,
		SectionKey:  RailSectionKeyForProject("/workspace/project"),
		Limit:       10,
	}
	result, ok, err := store.ListWorkspaceGeneratedFiles(ctx, input)
	if err != nil || !ok {
		t.Fatalf("ListWorkspaceGeneratedFiles(deleted) ok=%v error=%v", ok, err)
	}
	if len(result.Files) != 0 {
		t.Fatalf("deleted files = %#v, want none", result.Files)
	}

	recordGeneratedFileTurn(t, ctx, store, workspaceID, sessionID, "turn-readded", 300, []any{
		map[string]any{"path": "report.md", "change": "added"},
	})
	result, ok, err = store.ListWorkspaceGeneratedFiles(ctx, input)
	if err != nil || !ok {
		t.Fatalf("ListWorkspaceGeneratedFiles(readded) ok=%v error=%v", ok, err)
	}
	if len(result.Files) != 1 || result.Files[0].Path != "/workspace/project/report.md" {
		t.Fatalf("readded files = %#v, want report.md", result.Files)
	}
}

func seedGeneratedFileSession(
	t *testing.T,
	ctx context.Context,
	store *Store,
	workspaceID string,
	sessionID string,
	agentTargetID string,
	cwd string,
) {
	t.Helper()
	if _, err := store.ReportSessionState(ctx, SessionStateReport{
		WorkspaceID:      workspaceID,
		AgentSessionID:   sessionID,
		Origin:           "runtime",
		AgentTargetID:    agentTargetID,
		Provider:         "codex",
		Cwd:              cwd,
		Status:           "active",
		OccurredAtUnixMS: 10,
	}); err != nil {
		t.Fatalf("ReportSessionState(%s) error = %v", sessionID, err)
	}
}

func recordGeneratedFileTurn(
	t *testing.T,
	ctx context.Context,
	store *Store,
	workspaceID string,
	sessionID string,
	turnID string,
	occurredAt int64,
	files []any,
) {
	t.Helper()
	if _, accepted, err := store.RecordTurnTransition(ctx, TurnTransition{
		WorkspaceID:      workspaceID,
		AgentSessionID:   sessionID,
		TurnID:           turnID,
		Phase:            TurnPhaseSettled,
		Outcome:          TurnOutcomeCompleted,
		Origin:           TurnOriginLegacyUnknown,
		FileChanges:      map[string]any{"files": files},
		OccurredAtUnixMS: occurredAt,
	}); err != nil || !accepted {
		t.Fatalf("RecordTurnTransition(%s) accepted=%v error=%v", turnID, accepted, err)
	}
}
