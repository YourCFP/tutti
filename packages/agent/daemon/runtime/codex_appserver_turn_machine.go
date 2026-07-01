package agentruntime

import (
	"fmt"
	"log/slog"
	"strings"
)

type codexAppServerTurnKind string

const (
	codexAppServerTurnKindNormal  codexAppServerTurnKind = "normal"
	codexAppServerTurnKindCompact codexAppServerTurnKind = "compact"
)

type codexAppServerTurnPhase string

const (
	codexAppServerTurnPhaseIdle         codexAppServerTurnPhase = "idle"
	codexAppServerTurnPhaseRunning      codexAppServerTurnPhase = "running"
	codexAppServerTurnPhaseCompacting   codexAppServerTurnPhase = "compacting"
	codexAppServerTurnPhaseInterrupting codexAppServerTurnPhase = "interrupting"
	codexAppServerTurnPhaseCompleted    codexAppServerTurnPhase = "completed"
	codexAppServerTurnPhaseFailed       codexAppServerTurnPhase = "failed"
	codexAppServerTurnPhaseCanceled     codexAppServerTurnPhase = "canceled"
)

type codexAppServerTurnTerminal struct {
	turn  map[string]any
	err   error
	phase codexAppServerTurnPhase
}

func (phase codexAppServerTurnPhase) terminal() bool {
	switch phase {
	case codexAppServerTurnPhaseCompleted,
		codexAppServerTurnPhaseFailed,
		codexAppServerTurnPhaseCanceled:
		return true
	default:
		return false
	}
}

func (a *CodexAppServerAdapter) transitionActiveTurnPhase(
	agentSessionID string,
	turn *codexAppServerActiveTurn,
	phase codexAppServerTurnPhase,
) {
	if a == nil || turn == nil || phase == "" {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	appSession := a.sessions[strings.TrimSpace(agentSessionID)]
	if appSession == nil || appSession.activeTurn != turn || turn.phase.terminal() {
		return
	}
	if phase == codexAppServerTurnPhaseCompacting {
		turn.kind = codexAppServerTurnKindCompact
	}
	turn.phase = phase
}

// completeActiveTurn transitions the reducer-owned turn projection to a
// terminal phase after the `turn/completed` notification or an already-terminal
// initial turn snapshot. The blocking Exec wrapper observes the terminal
// channel; it no longer owns terminal classification.
func (a *CodexAppServerAdapter) completeActiveTurn(agentSessionID string, turn map[string]any) {
	if a == nil {
		return
	}
	terminal := codexAppServerTurnTerminal{turn: turn}
	var activeTurn *codexAppServerActiveTurn
	a.mu.Lock()
	appSession := a.sessions[strings.TrimSpace(agentSessionID)]
	if appSession != nil {
		activeTurn = appSession.activeTurn
		if activeTurn != nil && a.activeTurnMatchesProviderTurnLocked(appSession, turn) {
			terminal.phase = appServerProjectedTurnTerminalPhase(turn, activeTurn.forceCanceled)
			activeTurn.phase = terminal.phase
			appSession.activeTurnID = ""
			appServerLogTurnTerminalShadowMismatch(agentSessionID, turn, terminal.phase)
		} else {
			activeTurn = nil
		}
	}
	a.mu.Unlock()
	if activeTurn == nil {
		return
	}
	select {
	case activeTurn.terminal <- terminal:
	default:
	}
}

func (a *CodexAppServerAdapter) failActiveTurnFromAppServerError(agentSessionID string, params map[string]any) {
	if a == nil {
		return
	}
	turnID := strings.TrimSpace(asString(params["turnId"]))
	err := appServerNotificationError(params)
	terminal := codexAppServerTurnTerminal{
		err:   err,
		phase: codexAppServerTurnPhaseFailed,
	}
	var activeTurn *codexAppServerActiveTurn
	a.mu.Lock()
	appSession := a.sessions[strings.TrimSpace(agentSessionID)]
	if appSession != nil {
		activeTurn = appSession.activeTurn
		if activeTurn != nil && a.activeTurnMatchesProviderTurnIDLocked(appSession, turnID) {
			activeTurn.phase = codexAppServerTurnPhaseFailed
			appSession.activeTurnID = ""
		} else {
			activeTurn = nil
		}
	}
	a.mu.Unlock()
	if activeTurn == nil {
		return
	}
	select {
	case activeTurn.terminal <- terminal:
	default:
	}
}

func (a *CodexAppServerAdapter) activeTurnMatchesProviderTurnLocked(
	appSession *codexAppServerSession,
	turn map[string]any,
) bool {
	return a.activeTurnMatchesProviderTurnIDLocked(appSession, asString(turn["id"]))
}

func (a *CodexAppServerAdapter) activeTurnMatchesProviderTurnIDLocked(
	appSession *codexAppServerSession,
	providerTurnID string,
) bool {
	if appSession == nil || appSession.activeTurn == nil {
		return false
	}
	expected := strings.TrimSpace(appSession.activeTurnID)
	actual := strings.TrimSpace(providerTurnID)
	return expected == "" || actual == "" || expected == actual
}

func appServerProjectedTurnTerminalPhase(turn map[string]any, forceCanceled bool) codexAppServerTurnPhase {
	if forceCanceled {
		return codexAppServerTurnPhaseCanceled
	}
	switch strings.TrimSpace(asString(turn["status"])) {
	case "failed":
		return codexAppServerTurnPhaseFailed
	case "interrupted", "canceled":
		return codexAppServerTurnPhaseCanceled
	default:
		return codexAppServerTurnPhaseCompleted
	}
}

func appServerLegacyTurnTerminalPhase(turn map[string]any) codexAppServerTurnPhase {
	switch strings.TrimSpace(asString(turn["status"])) {
	case "failed":
		return codexAppServerTurnPhaseFailed
	case "interrupted", "canceled":
		return codexAppServerTurnPhaseCanceled
	default:
		return codexAppServerTurnPhaseCompleted
	}
}

func appServerLogTurnTerminalShadowMismatch(
	agentSessionID string,
	turn map[string]any,
	projected codexAppServerTurnPhase,
) {
	legacy := appServerLegacyTurnTerminalPhase(turn)
	if projected == legacy {
		return
	}
	slog.Warn("agent session app-server turn projection terminal mismatch",
		"event", "agent_session.app_server.turn_projection.shadow_mismatch",
		"agent_session_id", agentSessionID,
		"provider_turn_id", asString(turn["id"]),
		"status", asString(turn["status"]),
		"projected_phase", string(projected),
		"legacy_phase", string(legacy),
	)
}

func appServerNotificationError(params map[string]any) error {
	turnError := payloadObject(params["error"])
	message := strings.TrimSpace(asStringRaw(turnError["message"]))
	if message == "" {
		message = strings.TrimSpace(asStringRaw(params["message"]))
	}
	if message == "" {
		return fmt.Errorf("codex app-server turn failed")
	}
	return fmt.Errorf("%s", message)
}
