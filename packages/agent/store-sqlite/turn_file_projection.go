package storesqlite

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"
)

type turnFileProjectionScope struct {
	CWD             string
	RailSectionKind string
	RailProjectPath string
}

type turnFileProjectionEntry struct {
	Path       string
	ChangeKind string
}

func replaceTurnFileProjectionTx(ctx context.Context, tx *sql.Tx, turn Turn) error {
	workspaceID := strings.TrimSpace(turn.WorkspaceID)
	agentSessionID := strings.TrimSpace(turn.AgentSessionID)
	turnID := strings.TrimSpace(turn.TurnID)
	if workspaceID == "" || agentSessionID == "" || turnID == "" {
		return fmt.Errorf("workspace id, agent session id, and turn id are required for file projection")
	}
	if _, err := tx.ExecContext(ctx, `
DELETE FROM workspace_agent_turn_files
WHERE workspace_id = ? AND agent_session_id = ? AND turn_id = ?
`, workspaceID, agentSessionID, turnID); err != nil {
		return fmt.Errorf("clear workspace agent turn file projection: %w", err)
	}
	if len(turn.FileChanges) == 0 {
		return nil
	}

	scope, found, err := turnFileProjectionScopeTx(ctx, tx, workspaceID, agentSessionID)
	if err != nil {
		return err
	}
	if !found {
		return nil
	}
	for _, entry := range turnFileProjectionEntries(turn.FileChanges, scope) {
		if _, err := tx.ExecContext(ctx, `
INSERT INTO workspace_agent_turn_files (
  workspace_id, agent_session_id, turn_id, normalized_path, change_kind, changed_at_unix_ms
) VALUES (?, ?, ?, ?, ?, ?)
`, workspaceID, agentSessionID, turnID, entry.Path, entry.ChangeKind, turn.UpdatedAtUnixMS); err != nil {
			return fmt.Errorf("insert workspace agent turn file projection: %w", err)
		}
	}
	return nil
}

func turnFileProjectionScopeTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	agentSessionID string,
) (turnFileProjectionScope, bool, error) {
	var scope turnFileProjectionScope
	err := tx.QueryRowContext(ctx, `
SELECT cwd, rail_section_kind, rail_project_path
FROM workspace_agent_sessions
WHERE workspace_id = ? AND agent_session_id = ? AND deleted_at_unix_ms = 0
`, workspaceID, agentSessionID).Scan(&scope.CWD, &scope.RailSectionKind, &scope.RailProjectPath)
	if err == sql.ErrNoRows {
		return turnFileProjectionScope{}, false, nil
	}
	if err != nil {
		return turnFileProjectionScope{}, false, fmt.Errorf("get workspace agent turn file projection scope: %w", err)
	}
	return scope, true, nil
}

func turnFileProjectionEntries(
	fileChanges map[string]any,
	scope turnFileProjectionScope,
) []turnFileProjectionEntry {
	rawFiles, ok := fileChanges["files"].([]any)
	if !ok || len(rawFiles) == 0 {
		return nil
	}
	byPath := make(map[string]turnFileProjectionEntry, len(rawFiles))
	order := make([]string, 0, len(rawFiles))
	for _, rawFile := range rawFiles {
		file, ok := rawFile.(map[string]any)
		if !ok {
			continue
		}
		rawPath, _ := file["path"].(string)
		normalizedPath := normalizeTurnFileProjectionPath(rawPath, scope.CWD)
		if normalizedPath == "" {
			continue
		}
		if scope.RailSectionKind == RailSectionKindProject &&
			!agentSessionRailPathContains(scope.RailProjectPath, normalizedPath) {
			continue
		}
		if _, exists := byPath[normalizedPath]; !exists {
			order = append(order, normalizedPath)
		}
		byPath[normalizedPath] = turnFileProjectionEntry{
			Path:       normalizedPath,
			ChangeKind: normalizeTurnFileProjectionChange(file["change"]),
		}
	}
	entries := make([]turnFileProjectionEntry, 0, len(order))
	for _, normalizedPath := range order {
		entries = append(entries, byPath[normalizedPath])
	}
	return entries
}

func normalizeTurnFileProjectionPath(rawPath string, cwd string) string {
	rawPath = strings.TrimSpace(rawPath)
	if rawPath == "" || strings.HasPrefix(rawPath, "{") || strings.HasPrefix(rawPath, "[") {
		return ""
	}
	if !filepath.IsAbs(rawPath) {
		cwd = strings.TrimSpace(cwd)
		if cwd == "" {
			return ""
		}
		rawPath = filepath.Join(cwd, rawPath)
	}
	return NormalizeProjectPath(rawPath)
}

func normalizeTurnFileProjectionChange(value any) string {
	raw, _ := value.(string)
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "add", "added", "create", "created":
		return "added"
	case "delete", "deleted", "remove", "removed":
		return "deleted"
	case "move", "moved", "rename", "renamed":
		return "moved"
	default:
		return "modified"
	}
}
