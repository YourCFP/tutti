package agentsidecar

import (
	"strings"
)

func tuttiCLIPolicy(input PrepareInput) string {
	return strings.TrimSpace(renderProviderSkillTemplate(
		"policy_templates/tutti-runtime.md",
		map[string]string{
			"{{COMMAND_GUIDE}}":    commandGuide(input),
			"{{CLI_COMMAND}}":      normalizeCLICommandName(input.CLICommand),
			"{{AGENT_SESSION_ID}}": strings.TrimSpace(input.AgentSessionID),
			"{{PROVIDER}}":         strings.TrimSpace(input.Provider),
		},
	)) + "\n\n" + strings.TrimSpace(renderProviderSkillTemplate("policy_templates/host-app-context.md", nil))
}

func commandGuide(input PrepareInput) string {
	guide := strings.TrimSpace(input.CommandGuide)
	if guide == "" {
		return fallbackCommandGuide(input.CLICommand)
	}
	return guide
}
