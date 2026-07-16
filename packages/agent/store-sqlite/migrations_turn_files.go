package storesqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

func (s *Store) applyWorkspaceAgentTurnFilesV1(ctx context.Context) error {
	applied, err := s.hasMigration(ctx, schemaMigrationWorkspaceAgentTurnFilesV1)
	if err != nil {
		return err
	}
	if applied {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin workspace agent turn files migration: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	if _, err := tx.ExecContext(ctx, `
CREATE TABLE IF NOT EXISTS workspace_agent_turn_files (
  workspace_id TEXT NOT NULL,
  agent_session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  normalized_path TEXT NOT NULL,
  change_kind TEXT NOT NULL,
  changed_at_unix_ms INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, agent_session_id, turn_id, normalized_path),
  FOREIGN KEY (workspace_id, agent_session_id, turn_id)
    REFERENCES workspace_agent_turns(workspace_id, agent_session_id, turn_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_turn_files_session_recent
  ON workspace_agent_turn_files(
    workspace_id,
    agent_session_id,
    changed_at_unix_ms DESC,
    normalized_path
  );

CREATE INDEX IF NOT EXISTS idx_workspace_agent_turn_files_path_recent
  ON workspace_agent_turn_files(
    workspace_id,
    normalized_path,
    changed_at_unix_ms DESC,
    agent_session_id,
    turn_id
  );
`); err != nil {
		return fmt.Errorf("create workspace agent turn files projection: %w", err)
	}

	turns, err := turnsWithCanonicalFileChangesTx(ctx, tx)
	if err != nil {
		return err
	}
	for _, turn := range turns {
		if err := replaceTurnFileProjectionTx(ctx, tx, turn); err != nil {
			return err
		}
	}
	if err := recordMigrationTx(ctx, tx, schemaMigrationWorkspaceAgentTurnFilesV1); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit workspace agent turn files migration: %w", err)
	}
	committed = true
	return nil
}

func turnsWithCanonicalFileChangesTx(ctx context.Context, tx *sql.Tx) ([]Turn, error) {
	rows, err := tx.QueryContext(ctx, `
SELECT workspace_id, agent_session_id, turn_id, file_changes_json, updated_at_unix_ms
FROM workspace_agent_turns
WHERE file_changes_json IS NOT NULL
  AND TRIM(file_changes_json) NOT IN ('', '{}', 'null')
`)
	if err != nil {
		return nil, fmt.Errorf("list canonical turn file changes for projection backfill: %w", err)
	}
	defer rows.Close()

	turns := make([]Turn, 0)
	for rows.Next() {
		var turn Turn
		var fileChangesJSON string
		if err := rows.Scan(
			&turn.WorkspaceID,
			&turn.AgentSessionID,
			&turn.TurnID,
			&fileChangesJSON,
			&turn.UpdatedAtUnixMS,
		); err != nil {
			return nil, fmt.Errorf("scan canonical turn file changes for projection backfill: %w", err)
		}
		fileChanges, err := unmarshalJSONMap(strings.TrimSpace(fileChangesJSON))
		if err != nil {
			return nil, fmt.Errorf("decode canonical turn file changes for projection backfill: %w", err)
		}
		turn.FileChanges = fileChanges
		turns = append(turns, turn)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate canonical turn file changes for projection backfill: %w", err)
	}
	return turns, nil
}
