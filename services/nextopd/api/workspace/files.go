package workspace

import (
	workspacefiles "github.com/tutti-os/tutti/packages/workspace/files"
	nextopgenerated "github.com/tutti-os/tutti/services/nextopd/api/generated"
)

func GeneratedFileDirectoryResponseFromDomain(
	listing workspacefiles.DirectoryListing,
) nextopgenerated.WorkspaceFileDirectoryResponse {
	return nextopgenerated.WorkspaceFileDirectoryResponse{
		WorkspaceId:   listing.WorkspaceID,
		Root:          listing.Root.String(),
		DirectoryPath: listing.DirectoryPath.String(),
		Entries:       GeneratedFileEntriesFromDomain(listing.Entries),
	}
}

func GeneratedFileTreeSnapshotResponseFromDomain(
	snapshot workspacefiles.DirectoryTreeSnapshot,
) nextopgenerated.WorkspaceFileTreeSnapshotResponse {
	return nextopgenerated.WorkspaceFileTreeSnapshotResponse{
		BudgetExceeded:   snapshot.BudgetExceeded,
		Directory:        generatedFileTreeDirectoryFromDomain(snapshot.Directory),
		PrefetchBudgetMs: snapshot.PrefetchBudgetMs,
		PrefetchDepth:    snapshot.PrefetchDepth,
		Root:             snapshot.Root.String(),
		WorkspaceId:      snapshot.WorkspaceID,
	}
}

func GeneratedFileEntryResponseFromDomain(
	workspaceID string,
	root workspacefiles.LogicalPath,
	entry workspacefiles.FileEntry,
) nextopgenerated.WorkspaceFileEntryResponse {
	return nextopgenerated.WorkspaceFileEntryResponse{
		WorkspaceId: workspaceID,
		Root:        root.String(),
		Entry:       GeneratedFileEntryFromDomain(entry),
	}
}

func GeneratedFileEntriesFromDomain(items []workspacefiles.FileEntry) []nextopgenerated.WorkspaceFileEntry {
	if len(items) == 0 {
		return []nextopgenerated.WorkspaceFileEntry{}
	}

	result := make([]nextopgenerated.WorkspaceFileEntry, 0, len(items))
	for _, item := range items {
		result = append(result, GeneratedFileEntryFromDomain(item))
	}
	return result
}

func GeneratedFileEntryFromDomain(item workspacefiles.FileEntry) nextopgenerated.WorkspaceFileEntry {
	return nextopgenerated.WorkspaceFileEntry{
		Path:          item.Path.String(),
		Name:          item.Name,
		Kind:          generatedFileEntryKind(item.Kind),
		HasChildren:   item.HasChildren,
		SizeBytes:     item.SizeBytes,
		MtimeMs:       item.MtimeMs,
		CreatedTimeMs: item.CreatedTimeMs,
		LastOpenedMs:  item.LastOpenedMs,
	}
}

func GeneratedFileSearchResponseFromDomain(
	result workspacefiles.SearchResult,
) nextopgenerated.WorkspaceFileSearchResponse {
	entries := make([]nextopgenerated.WorkspaceFileSearchEntry, 0, len(result.Entries))
	for _, entry := range result.Entries {
		entries = append(entries, nextopgenerated.WorkspaceFileSearchEntry{
			Path:          entry.Path.String(),
			Name:          entry.Name,
			Kind:          generatedFileEntryKind(entry.Kind),
			DirectoryPath: entry.DirectoryPath.String(),
			MatchIndices:  searchMatchIndicesToGenerated(entry.MatchIndices),
			MatchTarget:   generatedSearchMatchTarget(entry.MatchTarget),
			Score:         entry.Score,
		})
	}

	return nextopgenerated.WorkspaceFileSearchResponse{
		WorkspaceId: result.WorkspaceID,
		Root:        result.Root.String(),
		Entries:     entries,
	}
}

func generatedFileTreeDirectoryFromDomain(
	directory workspacefiles.DirectoryTreeDirectory,
) nextopgenerated.WorkspaceFileTreeDirectory {
	result := nextopgenerated.WorkspaceFileTreeDirectory{
		DirectoryPath: directory.DirectoryPath.String(),
		Entries:       generatedFileTreeEntriesFromDomain(directory.Entries),
		PrefetchState: generatedFileTreePrefetchState(directory.PrefetchState),
	}
	if directory.PrefetchReason != workspacefiles.DirectoryTreePrefetchReasonNone {
		reason := generatedFileTreePrefetchReason(directory.PrefetchReason)
		result.PrefetchReason = &reason
	}
	return result
}

func generatedFileTreeEntriesFromDomain(
	entries []workspacefiles.DirectoryTreeEntry,
) []nextopgenerated.WorkspaceFileTreeEntry {
	if len(entries) == 0 {
		return []nextopgenerated.WorkspaceFileTreeEntry{}
	}

	result := make([]nextopgenerated.WorkspaceFileTreeEntry, 0, len(entries))
	for _, entry := range entries {
		item := nextopgenerated.WorkspaceFileTreeEntry{
			CreatedTimeMs: entry.CreatedTimeMs,
			HasChildren:   entry.HasChildren,
			Kind:          generatedFileEntryKind(entry.Kind),
			LastOpenedMs:  entry.LastOpenedMs,
			MtimeMs:       entry.MtimeMs,
			Name:          entry.Name,
			Path:          entry.Path.String(),
			SizeBytes:     entry.SizeBytes,
		}
		if entry.PrefetchState != "" {
			state := generatedFileTreePrefetchState(entry.PrefetchState)
			item.PrefetchState = &state
		}
		if entry.PrefetchReason != workspacefiles.DirectoryTreePrefetchReasonNone {
			reason := generatedFileTreePrefetchReason(entry.PrefetchReason)
			item.PrefetchReason = &reason
		}
		if entry.PrefetchedDirectory != nil {
			directory := generatedFileTreeDirectoryFromDomain(*entry.PrefetchedDirectory)
			item.PrefetchedDirectory = &directory
		}
		result = append(result, item)
	}
	return result
}

func searchMatchIndicesToGenerated(indices []int) []int {
	if len(indices) == 0 {
		return []int{}
	}
	result := make([]int, len(indices))
	copy(result, indices)
	return result
}

func GeneratedFileUploadResponseFromDomain(
	result workspacefiles.UploadResult,
) nextopgenerated.UploadWorkspaceFilesResponse {
	return nextopgenerated.UploadWorkspaceFilesResponse{
		WorkspaceId:         result.WorkspaceID,
		Root:                result.Root.String(),
		TargetDirectoryPath: result.TargetDirectoryPath.String(),
		Entries:             GeneratedFileEntriesFromDomain(result.Entries),
	}
}

func GeneratedFilePreflightUploadResponseFromDomain(
	result workspacefiles.PreflightUploadResult,
) nextopgenerated.PreflightUploadWorkspaceFilesResponse {
	conflicts := make([]nextopgenerated.WorkspaceFileUploadConflict, 0, len(result.Conflicts))
	for _, conflict := range result.Conflicts {
		conflicts = append(conflicts, nextopgenerated.WorkspaceFileUploadConflict{
			DestinationKind: generatedFileEntryKind(conflict.DestinationKind),
			DestinationPath: conflict.DestinationPath.String(),
			Kind:            generatedUploadConflictKind(conflict.Kind),
			Name:            conflict.Name,
			SourcePath:      conflict.SourcePath,
		})
	}

	return nextopgenerated.PreflightUploadWorkspaceFilesResponse{
		WorkspaceId:         result.WorkspaceID,
		Root:                result.Root.String(),
		TargetDirectoryPath: result.TargetDirectoryPath.String(),
		Conflicts:           conflicts,
	}
}

func DomainEntryKindFromGenerated(
	kind *nextopgenerated.WorkspaceFileFilterKind,
) workspacefiles.EntryKind {
	if kind == nil {
		return ""
	}
	switch *kind {
	case nextopgenerated.WorkspaceFileFilterKindFile:
		return workspacefiles.EntryKindFile
	case nextopgenerated.WorkspaceFileFilterKindDirectory:
		return workspacefiles.EntryKindDirectory
	default:
		return workspacefiles.EntryKindUnknown
	}
}

func DomainSearchKindsFromGenerated(
	kinds *nextopgenerated.WorkspaceFileSearchKinds,
) []workspacefiles.EntryKind {
	if kinds == nil || len(*kinds) == 0 {
		return nil
	}

	result := make([]workspacefiles.EntryKind, 0, len(*kinds))
	for _, kind := range *kinds {
		switch kind {
		case nextopgenerated.WorkspaceFileFilterKindFile:
			result = append(result, workspacefiles.EntryKindFile)
		case nextopgenerated.WorkspaceFileFilterKindDirectory:
			result = append(result, workspacefiles.EntryKindDirectory)
		default:
			result = append(result, workspacefiles.EntryKindUnknown)
		}
	}
	return result
}

func generatedFileEntryKind(kind workspacefiles.EntryKind) nextopgenerated.WorkspaceFileEntryKind {
	switch kind {
	case workspacefiles.EntryKindFile:
		return nextopgenerated.WorkspaceFileEntryKindFile
	case workspacefiles.EntryKindDirectory:
		return nextopgenerated.WorkspaceFileEntryKindDirectory
	default:
		return nextopgenerated.WorkspaceFileEntryKindUnknown
	}
}

func generatedFileTreePrefetchState(
	state workspacefiles.DirectoryTreePrefetchState,
) nextopgenerated.WorkspaceFileTreePrefetchState {
	return nextopgenerated.WorkspaceFileTreePrefetchState(state)
}

func generatedFileTreePrefetchReason(
	reason workspacefiles.DirectoryTreePrefetchReason,
) nextopgenerated.WorkspaceFileTreePrefetchReason {
	return nextopgenerated.WorkspaceFileTreePrefetchReason(reason)
}

func generatedUploadConflictKind(
	kind workspacefiles.UploadConflictKind,
) nextopgenerated.WorkspaceFileUploadConflictKind {
	switch kind {
	case workspacefiles.UploadConflictKindTypeMismatch:
		return nextopgenerated.TypeMismatch
	default:
		return nextopgenerated.Replaceable
	}
}

func generatedSearchMatchTarget(
	target workspacefiles.SearchMatchTarget,
) nextopgenerated.WorkspaceFileSearchMatchTarget {
	switch target {
	case workspacefiles.SearchMatchTargetPath:
		return nextopgenerated.Path
	default:
		return nextopgenerated.Basename
	}
}
