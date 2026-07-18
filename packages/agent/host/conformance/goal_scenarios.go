package conformance

import (
	"context"
	"errors"
	"fmt"

	agenthost "github.com/tutti-os/tutti/packages/agent/host"
	storesqlite "github.com/tutti-os/tutti/packages/agent/store-sqlite"
	"github.com/tutti-os/tutti/packages/agent/store-sqlite/canonical"
)

func runGoalActionLifecycle(ctx context.Context, driver Driver) error {
	if err := driver.Reset(ctx, liveSessionFixture("session-goal-actions", "")); err != nil {
		return err
	}
	ref := agenthost.GoalControlInput{WorkspaceID: "workspace-1", AgentSessionID: "session-goal-actions"}
	for index, command := range []struct{ action, objective, status string }{
		{action: "set", objective: "ship it", status: "active"},
		{action: "pause", status: "paused"},
		{action: "resume", status: "active"},
		{action: "clear"},
	} {
		ref.Action, ref.Objective = command.action, command.objective
		result, err := driver.GoalControl(ctx, ref)
		if err != nil {
			return fmt.Errorf("goal %s: %w", command.action, err)
		}
		if result.Revision != int64(index+1) {
			return fmt.Errorf("goal %s revision=%d", command.action, result.Revision)
		}
		if command.action == "clear" && result.Goal != nil {
			return fmt.Errorf("clear goal=%#v", result.Goal)
		}
		if command.status != "" && metadataString(result.Goal, "status") != command.status {
			return fmt.Errorf("goal %s result=%#v", command.action, result)
		}
		if result.PendingOperationID != "" || result.SyncStatus != storesqlite.GoalSyncStatusSynced {
			return fmt.Errorf("goal %s did not durably commit provider confirmation: %#v", command.action, result)
		}
	}
	if driver.Metrics().GoalControlCalls != 4 {
		return fmt.Errorf("goal control calls=%d", driver.Metrics().GoalControlCalls)
	}
	return nil
}

func runGoalReconcileObservation(ctx context.Context, driver Driver) error {
	if err := driver.Reset(ctx, liveSessionFixture("session-goal-reconcile", "")); err != nil {
		return err
	}
	if _, err := driver.GoalControl(ctx, agenthost.GoalControlInput{WorkspaceID: "workspace-1", AgentSessionID: "session-goal-reconcile", Action: "set", Objective: "reconcile me"}); err != nil {
		return err
	}
	result, err := driver.ReconcileGoal(ctx, agenthost.SessionRef{WorkspaceID: "workspace-1", AgentSessionID: "session-goal-reconcile"})
	if err != nil {
		return fmt.Errorf("reconcile goal: %w", err)
	}
	if metadataString(result.Goal, "objective") != "reconcile me" || driver.Metrics().GoalReconcileCalls == 0 {
		return fmt.Errorf("reconcile result=%#v metrics=%#v", result, driver.Metrics())
	}
	return nil
}

func runGoalRevisionActorFence(ctx context.Context, driver Driver) error {
	if err := driver.Reset(ctx, liveSessionFixture("session-goal-fence", "")); err != nil {
		return err
	}
	inputs := []agenthost.GoalControlInput{
		{WorkspaceID: "workspace-1", AgentSessionID: "session-goal-fence", Action: "set", Objective: "first"},
		{WorkspaceID: "workspace-1", AgentSessionID: "session-goal-fence", Action: "clear"},
	}
	errs := make(chan error, len(inputs))
	for _, input := range inputs {
		input := input
		go func() { _, err := driver.GoalControl(ctx, input); errs <- err }()
	}
	for range inputs {
		if err := <-errs; err != nil {
			return fmt.Errorf("concurrent goal control: %w", err)
		}
	}
	state, err := driver.GetGoalState(ctx, agenthost.SessionRef{WorkspaceID: "workspace-1", AgentSessionID: "session-goal-fence"})
	if err != nil {
		return err
	}
	if state.Revision != 2 || driver.Metrics().GoalControlCalls != 2 {
		return fmt.Errorf("goal fence state=%#v", state)
	}
	return nil
}

func runGoalInboxConsumerPreflight(ctx context.Context, driver Driver) error {
	fixture := liveSessionFixture("session-goal-no-consumer", "")
	fixture.DisableGoalInbox = true
	if err := driver.Reset(ctx, fixture); err != nil {
		return err
	}
	if err := driver.Recover(ctx); !errors.Is(err, agenthost.ErrGoalConsumerUnavailable) {
		return fmt.Errorf("missing goal consumer error=%v", err)
	}
	if steps := driver.Metrics().RecoverySteps; len(steps) != 0 {
		return fmt.Errorf("missing goal consumer ran recovery before preflight failure: %v", steps)
	}
	return nil
}

func runRuntimeCommitObserverFailure(ctx context.Context, driver Driver) error {
	fixture := liveSessionFixture("session-observer-runtime", "turn-observer-runtime")
	fixture.Turn = &TurnSeed{TurnID: "turn-observer-runtime", Phase: canonical.TurnPhaseWaiting}
	fixture.Interaction = &InteractionSeed{
		RequestID: "request-observer-runtime", TurnID: "turn-observer-runtime",
		Kind: canonical.InteractionKindQuestion, Status: canonical.InteractionStatusPending,
	}
	fixture.FailCommitObserver = true
	if err := driver.Reset(ctx, fixture); err != nil {
		return err
	}
	optionID := "approve"
	if _, err := driver.SubmitInteractive(ctx,
		agenthost.SessionRef{WorkspaceID: "workspace-1", AgentSessionID: "session-observer-runtime"},
		"request-observer-runtime", agenthost.SubmitInteractiveInput{TurnID: "turn-observer-runtime", OptionID: &optionID},
	); err != nil {
		return fmt.Errorf("observer failure escaped committed runtime command: %w", err)
	}
	if commits := driver.Metrics().RuntimeOperationCommits; commits < 2 {
		return fmt.Errorf("runtime committed deltas=%d, want prepare and completion", commits)
	}
	return nil
}

func runGoalOperationCommittedDeltas(ctx context.Context, driver Driver) error {
	fixture := liveSessionFixture("session-observer-goal", "")
	if err := driver.Reset(ctx, fixture); err != nil {
		return err
	}
	result, err := driver.GoalControl(ctx, agenthost.GoalControlInput{
		WorkspaceID: "workspace-1", AgentSessionID: "session-observer-goal",
		Action: "set", Objective: "observe durable goal",
	})
	if err != nil {
		return fmt.Errorf("goal control: %w", err)
	}
	metrics := driver.Metrics()
	if result.SyncStatus != storesqlite.GoalSyncStatusSynced || metrics.GoalOperationCommits < 3 {
		return fmt.Errorf("goal result=%#v committed deltas=%d, want prepare/dispatch/complete", result, metrics.GoalOperationCommits)
	}
	return nil
}

func metadataString(value map[string]any, key string) string {
	text, _ := value[key].(string)
	return text
}

func liveSessionFixture(sessionID, activeTurnID string) Fixture {
	return Fixture{Session: &SessionSeed{
		WorkspaceID: "workspace-1", AgentSessionID: sessionID, Provider: "codex",
		ProviderSessionID: "provider-" + sessionID, Cwd: "/workspace", Title: "Session title",
		ActiveTurnID: activeTurnID, InitialTitleEstablished: true, Live: true,
	}}
}
