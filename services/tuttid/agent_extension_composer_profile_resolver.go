package main

import (
	"context"
	"strings"

	agentservice "github.com/tutti-os/tutti/services/tuttid/service/agent"
	agentextensionservice "github.com/tutti-os/tutti/services/tuttid/service/agentextension"
)

type agentExtensionComposerProfileResolver struct {
	manager *agentextensionservice.Manager
}

func (r agentExtensionComposerProfileResolver) ResolveExtensionComposerProfile(
	_ context.Context,
	installationID string,
) (agentservice.ExtensionComposerProfile, error) {
	profile, err := r.manager.LoadComposerProfile(installationID)
	if err != nil {
		return agentservice.ExtensionComposerProfile{}, err
	}
	result := agentservice.ExtensionComposerProfile{
		PermissionModes: make([]agentservice.ExtensionComposerPermissionMode, 0, len(profile.PermissionModes)),
	}
	for _, mode := range profile.PermissionModes {
		result.PermissionModes = append(result.PermissionModes, agentservice.ExtensionComposerPermissionMode{
			RuntimeID: strings.TrimSpace(mode.RuntimeID),
			Semantic:  agentservice.PermissionModeSemantic(strings.TrimSpace(mode.Semantic)),
		})
	}
	if profile.Skills != nil {
		roots := make([]agentservice.ExtensionComposerSkillRoot, 0, len(profile.Skills.Roots))
		for _, root := range profile.Skills.Roots {
			roots = append(roots, agentservice.ExtensionComposerSkillRoot{
				Scope: root.Scope,
				Path:  root.Path,
			})
		}
		result.Skills = &agentservice.ExtensionComposerSkillProfile{
			Invocation:    profile.Skills.Invocation,
			TriggerPrefix: profile.Skills.TriggerPrefix,
			Roots:         roots,
		}
	}
	return result, nil
}
