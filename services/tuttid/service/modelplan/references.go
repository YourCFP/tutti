package modelplan

import (
	"context"

	modelplanbiz "github.com/tutti-os/tutti/services/tuttid/biz/modelplan"
)

// CompositeReferenceResolver aggregates plan references from several
// consumer domains (WorkspaceAgents, automation rules, legacy bindings and
// policies, and workspace apps).
type CompositeReferenceResolver []ReferenceResolver

func (resolvers CompositeReferenceResolver) ListModelPlanReferences(ctx context.Context, workspaceID string, planID string) ([]modelplanbiz.Reference, error) {
	merged := make([]modelplanbiz.Reference, 0)
	for _, resolver := range resolvers {
		if resolver == nil {
			continue
		}
		references, err := resolver.ListModelPlanReferences(ctx, workspaceID, planID)
		if err != nil {
			return nil, err
		}
		merged = append(merged, references...)
	}
	return merged, nil
}
