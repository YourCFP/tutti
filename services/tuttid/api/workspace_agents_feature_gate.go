package api

import (
	"context"

	tuttigenerated "github.com/tutti-os/tutti/services/tuttid/api/generated"
	"github.com/tutti-os/tutti/services/tuttid/apierrors"
)

// WorkspaceAgentsFeatureFlag is the lab flag that gates workspace agent
// write routes while the feature rolls out.
const WorkspaceAgentsFeatureFlag = "lab.workspaceAgents"

// workspaceAgentsWritesEnabled reports whether workspace agent write routes
// are enabled. The lab flag defaults off: writes are rejected unless the
// flag is explicitly true, while reads and already-created agents keep
// working. Mirrors modelPlansWritesEnabled.
func (api DaemonAPI) workspaceAgentsWritesEnabled(ctx context.Context) bool {
	if api.PreferencesService == nil {
		return false
	}
	preferences, err := api.PreferencesService.Get(ctx)
	if err != nil {
		return false
	}
	return preferences.FeatureFlags[WorkspaceAgentsFeatureFlag]
}

func workspaceAgentsWriteDisabledError() tuttigenerated.InvalidRequestErrorJSONResponse {
	return invalidRequestError(apierrors.InvalidRequest(
		"workspace_agents_disabled",
		apierrors.WithDeveloperMessage("workspace agent writes require the lab.workspaceAgents feature flag"),
	))
}
