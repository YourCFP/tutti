package computer

import (
	"context"
	"errors"
	"os/exec"
	"runtime"
)

// ErrNotInstalled is returned when cua-driver is not found on PATH or at the
// configured entry path.
var ErrNotInstalled = errors.New(
	"cua-driver is not installed; install it from https://github.com/trycua/cua or set TUTTI_COMPUTER_MCP_ENTRY_PATH")

// CheckReady checks that cua-driver is reachable before advertising or starting
// computer-use. Actual macOS permission errors (Screen Recording,
// Accessibility) are reported by cua-driver itself at MCP initialize time.
func CheckReady() error {
	if runtime.GOOS != "darwin" {
		return errors.New("computer use requires macOS")
	}
	command := resolveComputerMCPCommand(context.TODO())
	if len(command) == 0 {
		return ErrNotInstalled
	}
	if _, err := exec.LookPath(command[0]); err != nil {
		return ErrNotInstalled
	}
	return nil
}

func validateComputerReady() error {
	return CheckReady()
}
