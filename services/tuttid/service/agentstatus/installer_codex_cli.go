package agentstatus

import (
	"context"
	"log/slog"
	"runtime"
	"slices"
)

func (s Service) runCodexCLILatestInstaller(
	ctx context.Context,
	spec InstallerSpec,
	installDir string,
) (InstallCommandResult, error) {
	if spec.CodexCLI == nil {
		return InstallCommandResult{ExitCode: 1, Stderr: "codex CLI latest installer config is required"}, nil
	}
	resolver := s.commandResolver()
	npmPath := firstNonBlank(resolveBinaryWithResolver(resolver, []string{npmBinaryName()}, nil), npmBinaryName())
	nodeTarget := firstNonBlank(resolveBinaryWithResolver(resolver, []string{nodeBinaryName()}, nil), nodeBinaryName())
	command := joinShellCommand([]string{npmPath, "install", "-g", "@openai/codex", "--include=optional"})
	baseEnv := s.commandResolver().Env(nil)
	registries := s.agentNPMRegistries()
	var result InstallCommandResult
	var err error
	for i, registry := range registries {
		setActiveAction("codex", ActiveAction{
			ID:         ActionInstall,
			Status:     "running",
			Step:       "install",
			Registry:   registry,
			NodeTarget: nodeTarget,
		})
		attemptCtx, cancel := context.WithTimeout(ctx, perRegistryInstallTimeout)
		result, err = s.installCommand(attemptCtx, InstallCommandInput{
			Command: command,
			Env:     withAgentNPMRegistry(slices.Clone(baseEnv), registry),
			OnStdout: func(output string) {
				appendActiveActionStdout("codex", output)
			},
		})
		cancel()
		if err == nil && result.ExitCode == 0 {
			setActiveAction("codex", ActiveAction{
				ID:         ActionInstall,
				Status:     "running",
				Step:       "verify",
				Registry:   registry,
				NodeTarget: nodeTarget,
				Stdout:     result.Stdout,
			})
			return result, nil
		}
		if i < len(registries)-1 {
			slog.Warn(
				"agent provider codex npm install failed on registry, trying next",
				"registry", registry,
				"exitCode", result.ExitCode,
				"error", err,
			)
		}
	}
	return result, err
}

func nodeBinaryName() string {
	if runtime.GOOS == "windows" {
		return "node.exe"
	}
	return "node"
}

func npmBinaryName() string {
	if runtime.GOOS == "windows" {
		return "npm.cmd"
	}
	return "npm"
}
