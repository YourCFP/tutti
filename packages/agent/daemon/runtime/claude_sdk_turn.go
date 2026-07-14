package agentruntime

import (
	"sort"
	"strings"

	activityshared "github.com/tutti-os/tutti/packages/agent/daemon/activity/events"
)

// ensureClaudeSDKTurnNormalizerLocked returns the turn lifecycle owner for
// turnID, creating it on first use. Caller must hold the adapter mutex.
func (s *claudeSDKAdapterSession) ensureClaudeSDKTurnNormalizerLocked(turnID string) *acpTurnNormalizer {
	turnID = strings.TrimSpace(turnID)
	if s == nil || turnID == "" {
		return nil
	}
	if s.turnNormalizers == nil {
		s.turnNormalizers = make(map[string]*acpTurnNormalizer)
	}
	if normalizer := s.turnNormalizers[turnID]; normalizer != nil {
		return normalizer
	}
	normalizer := newACPTurnNormalizer()
	s.turnNormalizers[turnID] = normalizer
	return normalizer
}

// trackClaudeSDKTurnCallEvents records call.started/completed/failed against
// the shared ACP turn normalizer so Claude turns close open tools the same way
// Codex/ACP do on FinishInterrupted/FinishFailed/FinishCompleted.
func (a *ClaudeCodeSDKAdapter) trackClaudeSDKTurnCallEvents(
	adapterSession *claudeSDKAdapterSession,
	events []activityshared.Event,
) {
	if a == nil || adapterSession == nil || len(events) == 0 {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, event := range events {
		switch event.Type {
		case activityshared.EventCallStarted,
			activityshared.EventCallCompleted,
			activityshared.EventCallFailed:
			turnID := strings.TrimSpace(event.Payload.TurnID)
			if turnID == "" {
				continue
			}
			normalizer := adapterSession.ensureClaudeSDKTurnNormalizerLocked(turnID)
			if normalizer == nil {
				continue
			}
			normalizer.trackToolCallEvent(event)
		}
	}
}

// takeClaudeSDKTurnNormalizerLocked removes and returns the turn lifecycle
// owner for turnID. Caller must hold the adapter mutex.
func (s *claudeSDKAdapterSession) takeClaudeSDKTurnNormalizerLocked(turnID string) *acpTurnNormalizer {
	turnID = strings.TrimSpace(turnID)
	if s == nil || turnID == "" || len(s.turnNormalizers) == 0 {
		return nil
	}
	normalizer := s.turnNormalizers[turnID]
	delete(s.turnNormalizers, turnID)
	return normalizer
}

type claudeSDKTurnFinishKind string

const (
	claudeSDKTurnFinishCompleted   claudeSDKTurnFinishKind = "completed"
	claudeSDKTurnFinishFailed      claudeSDKTurnFinishKind = "failed"
	claudeSDKTurnFinishInterrupted claudeSDKTurnFinishKind = "interrupted"
)

// finishClaudeSDKTurnLifecycle closes the Claude turn's event lifecycle:
// dangling tool calls (and any normalizer-owned streams) are settled before the
// caller emits the turn terminal event. Idempotent once the normalizer is taken.
func (a *ClaudeCodeSDKAdapter) finishClaudeSDKTurnLifecycle(
	adapterSession *claudeSDKAdapterSession,
	session Session,
	turnID string,
	kind claudeSDKTurnFinishKind,
	reason string,
) []activityshared.Event {
	if a == nil || adapterSession == nil {
		return nil
	}
	turnID = strings.TrimSpace(turnID)
	if turnID == "" {
		return nil
	}
	a.mu.Lock()
	normalizer := adapterSession.takeClaudeSDKTurnNormalizerLocked(turnID)
	a.mu.Unlock()
	if normalizer == nil {
		return nil
	}
	switch kind {
	case claudeSDKTurnFinishCompleted:
		return normalizer.FinishCompleted(session, turnID)
	case claudeSDKTurnFinishFailed:
		return normalizer.FinishFailed(session, turnID)
	default:
		return normalizer.FinishInterrupted(session, turnID, firstNonEmpty(strings.TrimSpace(reason), "interrupted"))
	}
}

// finishAllClaudeSDKTurnLifecycles settles every still-open Claude turn
// lifecycle (for example when the sidecar reader dies).
func (a *ClaudeCodeSDKAdapter) finishAllClaudeSDKTurnLifecycles(
	adapterSession *claudeSDKAdapterSession,
	session Session,
	kind claudeSDKTurnFinishKind,
	reason string,
) []activityshared.Event {
	if a == nil || adapterSession == nil {
		return nil
	}
	a.mu.Lock()
	turnIDs := make([]string, 0, len(adapterSession.turnNormalizers))
	for turnID := range adapterSession.turnNormalizers {
		turnIDs = append(turnIDs, turnID)
	}
	a.mu.Unlock()
	if len(turnIDs) == 0 {
		return nil
	}
	sort.Strings(turnIDs)
	events := make([]activityshared.Event, 0, len(turnIDs))
	for _, turnID := range turnIDs {
		events = append(events, a.finishClaudeSDKTurnLifecycle(adapterSession, session, turnID, kind, reason)...)
	}
	return events
}
