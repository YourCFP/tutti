package agent

import (
	"context"
	"strings"
)

func (s *Service) clampReasoningEffortForModel(
	ctx context.Context,
	provider string,
	model string,
	selected string,
) string {
	selected = strings.TrimSpace(selected)
	// Catalog-backed values are open-ended provider capabilities. Apply the
	// legacy provider normalization only when no authoritative model effort list
	// is available.
	if !composerOptionsProviderUsesModelCatalog(provider) {
		return normalizeReasoningEffortForProvider(provider, selected)
	}
	catalogOptions, ok := composerModelOptionsFromCatalog(ctx, s.ModelCatalog, provider, model)
	if !ok || !catalogOptions.ReasoningEffortsAdvertised {
		return normalizeReasoningEffortForProvider(provider, selected)
	}
	return resolveAdvertisedReasoningEffort(
		provider,
		selected,
		catalogOptions.DefaultReasoningEffort,
		catalogOptions.ReasoningEfforts,
	)
}

func (s *Service) clampReasoningEffortPointerForModel(
	ctx context.Context,
	provider string,
	model string,
	selected *string,
) *string {
	if selected == nil {
		return nil
	}
	clamped := s.clampReasoningEffortForModel(ctx, provider, model, *selected)
	return &clamped
}

func (s *Service) UpdateSettings(ctx context.Context, workspaceID string, agentSessionID string, settings ComposerSettingsPatch) (Session, error) {
	ensured, err := s.ensureRuntimeSessionResult(ctx, workspaceID, agentSessionID)
	if err != nil {
		return Session{}, err
	}
	provider := strings.TrimSpace(ensured.Session.Provider)
	selectedModel := ""
	selectedReasoningEffort := ""
	if ensured.Session.Settings != nil {
		selectedModel = ensured.Session.Settings.Model
		selectedReasoningEffort = ensured.Session.Settings.ReasoningEffort
	}
	if settings.Model != nil {
		selectedModel = strings.TrimSpace(*settings.Model)
	}
	if settings.ReasoningEffort != nil {
		selectedReasoningEffort = *settings.ReasoningEffort
	}
	if settings.Model != nil || settings.ReasoningEffort != nil {
		clampedReasoningEffort := s.clampReasoningEffortForModel(
			ctx,
			provider,
			selectedModel,
			selectedReasoningEffort,
		)
		if settings.ReasoningEffort != nil || clampedReasoningEffort != selectedReasoningEffort {
			settings.ReasoningEffort = &clampedReasoningEffort
		}
	}
	if settings.Speed != nil {
		normalizedSpeed := normalizeSpeedForProvider(provider, *settings.Speed)
		settings.Speed = &normalizedSpeed
	}
	if err := s.controller().UpdateSettings(ctx, RuntimeUpdateSettingsInput{
		WorkspaceID:    workspaceID,
		AgentSessionID: agentSessionID,
		Settings:       settings,
	}); err != nil {
		return Session{}, normalizeRuntimeError(err)
	}
	if err := s.persistUpdatedRuntimeSettings(ctx, workspaceID, agentSessionID); err != nil {
		return Session{}, err
	}
	session, err := s.Get(ctx, workspaceID, agentSessionID)
	if err != nil {
		return Session{}, err
	}
	return session, nil
}
