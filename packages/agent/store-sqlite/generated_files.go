package storesqlite

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
)

const defaultWorkspaceGeneratedFilesLimit = 30
const maxWorkspaceGeneratedFilesLimit = 100

func (s *Store) ListWorkspaceGeneratedFiles(
	ctx context.Context,
	input ListWorkspaceGeneratedFilesInput,
) (GeneratedFileList, bool, error) {
	if s == nil || s.db == nil {
		return GeneratedFileList{}, false, fmt.Errorf("workspace database is not initialized")
	}
	workspaceID := strings.TrimSpace(input.WorkspaceID)
	sectionKey := strings.TrimSpace(input.SectionKey)
	if workspaceID == "" {
		return GeneratedFileList{}, false, nil
	}
	if err := s.ensureWorkspaceExists(ctx, workspaceID); err != nil {
		return GeneratedFileList{}, false, err
	}
	if sectionKey == "" || sectionKey == PinnedSessionPageKey {
		return GeneratedFileList{}, false, nil
	}
	limit := input.Limit
	if limit <= 0 {
		limit = defaultWorkspaceGeneratedFilesLimit
	}
	if limit > maxWorkspaceGeneratedFilesLimit {
		limit = maxWorkspaceGeneratedFilesLimit
	}
	query := strings.ToLower(strings.TrimSpace(input.Query))
	agentTargetIDs := uniqueNonBlankStrings(input.AgentTargetIDs)
	queryArgs := []any{workspaceID, sectionKey}
	agentTargetFilter := ""
	if len(agentTargetIDs) > 0 {
		agentTargetFilter = "\n    AND sessions.agent_target_id IN (" + strings.TrimSuffix(strings.Repeat("?,", len(agentTargetIDs)), ",") + ")"
		for _, agentTargetID := range agentTargetIDs {
			queryArgs = append(queryArgs, agentTargetID)
		}
	}
	queryArgs = append(queryArgs, query, query, limit)

	rows, err := s.db.QueryContext(ctx, `
WITH scoped_files AS (
  SELECT files.normalized_path,
         files.change_kind,
         files.changed_at_unix_ms,
         files.agent_session_id,
         files.turn_id,
         ROW_NUMBER() OVER (
           PARTITION BY files.normalized_path
           ORDER BY files.changed_at_unix_ms DESC,
                    files.turn_id DESC,
                    files.agent_session_id DESC
         ) AS path_rank
  FROM workspace_agent_turn_files AS files
  JOIN workspace_agent_sessions AS sessions
    ON sessions.workspace_id = files.workspace_id
   AND sessions.agent_session_id = files.agent_session_id
  WHERE files.workspace_id = ?
    AND sessions.rail_section_key = ?
    AND sessions.deleted_at_unix_ms = 0`+agentTargetFilter+`
)
SELECT normalized_path
FROM scoped_files
WHERE path_rank = 1
  AND change_kind <> 'deleted'
  AND (? = '' OR INSTR(LOWER(normalized_path), ?) > 0)
ORDER BY changed_at_unix_ms DESC, turn_id DESC, agent_session_id DESC, normalized_path ASC
LIMIT ?
`, queryArgs...)
	if err != nil {
		return GeneratedFileList{}, false, fmt.Errorf("list workspace agent generated files from turns: %w", err)
	}
	defer rows.Close()

	files := make([]GeneratedFile, 0, limit)
	for rows.Next() {
		var normalizedPath string
		if err := rows.Scan(&normalizedPath); err != nil {
			return GeneratedFileList{}, false, fmt.Errorf("scan workspace agent generated file: %w", err)
		}
		files = append(files, GeneratedFile{
			Path:  normalizedPath,
			Label: generatedFileLabel(normalizedPath),
		})
	}
	if err := rows.Err(); err != nil {
		return GeneratedFileList{}, false, fmt.Errorf("iterate workspace agent generated files: %w", err)
	}
	return GeneratedFileList{WorkspaceID: workspaceID, Files: files}, true, nil
}

func generatedFileLabel(filePath string) string {
	label := filepath.Base(strings.TrimSpace(filePath))
	if label == "" || label == "." || label == string(filepath.Separator) {
		return strings.TrimSpace(filePath)
	}
	return label
}
