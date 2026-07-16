package storesqlite

import (
	"context"
	"fmt"
	"testing"
)

func BenchmarkStoreListWorkspaceGeneratedFiles(b *testing.B) {
	projects := make([]string, 10)
	for index := range projects {
		projects[index] = fmt.Sprintf("/workspace/project-%02d", index)
	}
	store := New(openTestDB(b), testOptions(&staticProjectPaths{paths: projects}))
	ctx := context.Background()
	if err := store.Migrate(ctx); err != nil {
		b.Fatalf("Migrate() error = %v", err)
	}
	const workspaceID = "ws-agent-generated-files-bench"
	seedGeneratedFileBenchmarkTurns(b, ctx, store, workspaceID, 100, 50)
	sectionKey := RailSectionKeyForProject(projects[0])

	for _, test := range []struct {
		name  string
		query string
	}{
		{name: "empty-query-limit-30"},
		{name: "miss-query-limit-30", query: "definitely-no-match"},
	} {
		b.Run(test.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_, ok, err := store.ListWorkspaceGeneratedFiles(ctx, ListWorkspaceGeneratedFilesInput{
					WorkspaceID: workspaceID,
					SectionKey:  sectionKey,
					Query:       test.query,
					Limit:       30,
				})
				if err != nil || !ok {
					b.Fatalf("ListWorkspaceGeneratedFiles() ok=%v error=%v", ok, err)
				}
			}
		})
	}
}

func seedGeneratedFileBenchmarkTurns(
	b *testing.B,
	ctx context.Context,
	store *Store,
	workspaceID string,
	sessionCount int,
	turnsPerSession int,
) {
	b.Helper()
	for sessionIndex := 0; sessionIndex < sessionCount; sessionIndex++ {
		sessionID := fmt.Sprintf("session-%03d", sessionIndex)
		cwd := fmt.Sprintf("/workspace/project-%02d", sessionIndex%10)
		if _, err := store.ReportSessionState(ctx, SessionStateReport{
			WorkspaceID: workspaceID, AgentSessionID: sessionID, Origin: "runtime",
			Provider: "codex", Cwd: cwd, Status: "active", OccurredAtUnixMS: int64(1000 + sessionIndex),
		}); err != nil {
			b.Fatalf("ReportSessionState(%s) error = %v", sessionID, err)
		}
		for turnIndex := 0; turnIndex < turnsPerSession; turnIndex++ {
			turnID := fmt.Sprintf("turn-%03d-%03d", sessionIndex, turnIndex)
			if _, accepted, err := store.RecordTurnTransition(ctx, TurnTransition{
				WorkspaceID: workspaceID, AgentSessionID: sessionID, TurnID: turnID,
				Phase: TurnPhaseSettled, Outcome: TurnOutcomeCompleted, Origin: TurnOriginLegacyUnknown,
				FileChanges: map[string]any{"files": []any{map[string]any{
					"path": fmt.Sprintf("generated/file-%03d-%03d.md", sessionIndex, turnIndex), "change": "added",
				}}},
				OccurredAtUnixMS: int64(10_000 + sessionIndex*turnsPerSession + turnIndex),
			}); err != nil || !accepted {
				b.Fatalf("RecordTurnTransition(%s) accepted=%v error=%v", turnID, accepted, err)
			}
		}
	}
}
