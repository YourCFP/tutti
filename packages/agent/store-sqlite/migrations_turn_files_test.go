package storesqlite

import (
	"context"
	"testing"
)

func TestWorkspaceAgentTurnFilesMigrationBackfillsCanonicalTurnsIdempotently(t *testing.T) {
	t.Parallel()

	store := openTestStore(t, testOptions(&staticProjectPaths{paths: []string{"/workspace/project"}}))
	ctx := context.Background()
	const workspaceID = "workspace-turn-file-migration"
	const sessionID = "session-1"

	seedGeneratedFileSession(t, ctx, store, workspaceID, sessionID, testTargetIDCodex, "/workspace/project/apps/web")
	recordGeneratedFileTurn(t, ctx, store, workspaceID, sessionID, "turn-1", 100, []any{
		map[string]any{"path": "src/report.md", "change": "added"},
		map[string]any{"path": "/workspace/outside.md", "change": "added"},
	})

	if _, err := store.db.ExecContext(ctx, `
DELETE FROM workspace_agent_turn_files;
DELETE FROM agent_store_schema_migrations WHERE id = ?;
`, schemaMigrationWorkspaceAgentTurnFilesV1); err != nil {
		t.Fatalf("reset turn files projection migration: %v", err)
	}
	if err := store.Migrate(ctx); err != nil {
		t.Fatalf("Migrate(backfill) error = %v", err)
	}

	assertProjectedTurnFileCount(t, ctx, store, 1)
	result, ok, err := store.ListWorkspaceGeneratedFiles(ctx, ListWorkspaceGeneratedFilesInput{
		WorkspaceID: workspaceID,
		SectionKey:  RailSectionKeyForProject("/workspace/project"),
		Limit:       10,
	})
	if err != nil || !ok {
		t.Fatalf("ListWorkspaceGeneratedFiles(backfill) ok=%v error=%v", ok, err)
	}
	if len(result.Files) != 1 || result.Files[0].Path != "/workspace/project/apps/web/src/report.md" {
		t.Fatalf("backfilled files = %#v, want the canonical in-project turn file", result.Files)
	}

	if _, err := store.db.ExecContext(ctx, `DELETE FROM agent_store_schema_migrations WHERE id = ?`, schemaMigrationWorkspaceAgentTurnFilesV1); err != nil {
		t.Fatalf("reset turn files projection migration for rerun: %v", err)
	}
	if err := store.Migrate(ctx); err != nil {
		t.Fatalf("Migrate(rerun) error = %v", err)
	}
	assertProjectedTurnFileCount(t, ctx, store, 1)
}

func assertProjectedTurnFileCount(t *testing.T, ctx context.Context, store *Store, want int) {
	t.Helper()
	var got int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_agent_turn_files`).Scan(&got); err != nil {
		t.Fatalf("count projected turn files: %v", err)
	}
	if got != want {
		t.Fatalf("projected turn files = %d, want %d", got, want)
	}
}
