package api

import (
	"context"
	"errors"
	"testing"

	tuttigenerated "github.com/tutti-os/tutti/services/tuttid/api/generated"
	workspaceagentbiz "github.com/tutti-os/tutti/services/tuttid/biz/workspaceagent"
	workspaceagentservice "github.com/tutti-os/tutti/services/tuttid/service/workspaceagent"
)

type gateStubWorkspaceAgentService struct{}

func (gateStubWorkspaceAgentService) List(context.Context, string) ([]workspaceagentbiz.View, error) {
	return []workspaceagentbiz.View{}, nil
}
func (gateStubWorkspaceAgentService) Get(context.Context, string, string) (workspaceagentbiz.View, error) {
	return workspaceagentbiz.View{}, nil
}
func (gateStubWorkspaceAgentService) Create(context.Context, workspaceagentservice.PutInput) (workspaceagentbiz.View, error) {
	return workspaceagentbiz.View{}, nil
}
func (gateStubWorkspaceAgentService) Update(context.Context, workspaceagentservice.PutInput) (workspaceagentbiz.View, error) {
	return workspaceagentbiz.View{}, nil
}
func (gateStubWorkspaceAgentService) Delete(context.Context, string, string) error { return nil }

func TestWorkspaceAgentsWriteGateRejectsWritesWhenFlagOff(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	workspaceID := tuttigenerated.WorkspaceID("ws-1")

	cases := []struct {
		name  string
		flags map[string]bool
		err   error
	}{
		{name: "flag explicitly false", flags: map[string]bool{WorkspaceAgentsFeatureFlag: false}},
		{name: "flag absent", flags: map[string]bool{}},
		{name: "preferences unreadable", err: errors.New("preferences store down")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			api := DaemonAPI{
				PreferencesService:    gateTestPreferences(tc.flags, tc.err),
				WorkspaceAgentService: gateStubWorkspaceAgentService{},
			}
			createResponse, err := api.CreateWorkspaceAgent(ctx, tuttigenerated.CreateWorkspaceAgentRequestObject{WorkspaceID: workspaceID})
			if err != nil {
				t.Fatalf("CreateWorkspaceAgent() error = %v", err)
			}
			rejected, ok := createResponse.(tuttigenerated.CreateWorkspaceAgent400JSONResponse)
			if !ok {
				t.Fatalf("CreateWorkspaceAgent() response = %T, want 400 rejection", createResponse)
			}
			if reason := tuttigenerated.ApiErrorResponse(rejected.InvalidRequestErrorJSONResponse).Error.Reason; reason == nil || *reason != "workspace_agents_disabled" {
				t.Fatalf("CreateWorkspaceAgent() rejection reason = %v, want workspace_agents_disabled", reason)
			}

			updateResponse, err := api.UpdateWorkspaceAgent(ctx, tuttigenerated.UpdateWorkspaceAgentRequestObject{WorkspaceID: workspaceID, WorkspaceAgentID: "workspace-agent:one"})
			if err != nil {
				t.Fatalf("UpdateWorkspaceAgent() error = %v", err)
			}
			if _, ok := updateResponse.(tuttigenerated.UpdateWorkspaceAgent400JSONResponse); !ok {
				t.Fatalf("UpdateWorkspaceAgent() response = %T, want 400 rejection", updateResponse)
			}

			deleteResponse, err := api.DeleteWorkspaceAgent(ctx, tuttigenerated.DeleteWorkspaceAgentRequestObject{WorkspaceID: workspaceID, WorkspaceAgentID: "workspace-agent:one"})
			if err != nil {
				t.Fatalf("DeleteWorkspaceAgent() error = %v", err)
			}
			if _, ok := deleteResponse.(tuttigenerated.DeleteWorkspaceAgent400JSONResponse); !ok {
				t.Fatalf("DeleteWorkspaceAgent() response = %T, want 400 rejection", deleteResponse)
			}
		})
	}
}

func TestWorkspaceAgentsWriteGateKeepsReadsWorkingWhenFlagOff(t *testing.T) {
	t.Parallel()

	api := DaemonAPI{
		PreferencesService:    gateTestPreferences(map[string]bool{}, nil),
		WorkspaceAgentService: gateStubWorkspaceAgentService{},
	}
	response, err := api.ListWorkspaceAgents(context.Background(), tuttigenerated.ListWorkspaceAgentsRequestObject{WorkspaceID: "ws-1"})
	if err != nil {
		t.Fatalf("ListWorkspaceAgents() error = %v", err)
	}
	if _, ok := response.(tuttigenerated.ListWorkspaceAgents200JSONResponse); !ok {
		t.Fatalf("ListWorkspaceAgents() response = %T, want 200 with writes gated", response)
	}
}

func TestWorkspaceAgentsWriteGateAllowsWritesWhenFlagOn(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	// Nil WorkspaceAgentService: reaching the 503 service-unavailable branch
	// proves the gate passed the request through to the handler.
	api := DaemonAPI{
		PreferencesService: gateTestPreferences(map[string]bool{WorkspaceAgentsFeatureFlag: true}, nil),
	}
	createResponse, err := api.CreateWorkspaceAgent(ctx, tuttigenerated.CreateWorkspaceAgentRequestObject{WorkspaceID: "ws-1"})
	if err != nil {
		t.Fatalf("CreateWorkspaceAgent() error = %v", err)
	}
	if _, ok := createResponse.(tuttigenerated.CreateWorkspaceAgent503JSONResponse); !ok {
		t.Fatalf("CreateWorkspaceAgent() response = %T, want 503 passthrough with flag on", createResponse)
	}
}
