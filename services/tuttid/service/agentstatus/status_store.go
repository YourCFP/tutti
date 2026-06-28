package agentstatus

import (
	"sync"
	"time"
)

// statusStore is the daemon's maintained model of each provider's environment
// status — the single source of truth. Detect probes the environment and writes
// it here; GetStatus reads it without probing. It is a package-level global for
// the same reason as activeActions (active_action.go): Service is a value type,
// copied freely, so shared daemon state cannot live on a Service field.
var statusStore = struct {
	sync.Mutex
	byProvider map[string]storedStatus
}{byProvider: map[string]storedStatus{}}

type storedStatus struct {
	// status carries the last detected environment, including Network — so a
	// later read returns a stable, non-flickering network result rather than
	// re-probing. Its ActiveAction is irrelevant; reads overlay the live one.
	status     ProviderStatus
	capturedAt time.Time
}

// putDetectedStatus records a freshly detected status for a provider. Called by
// Detect after probing.
func putDetectedStatus(provider string, status ProviderStatus, capturedAt time.Time) {
	statusStore.Lock()
	statusStore.byProvider[provider] = storedStatus{status: status, capturedAt: capturedAt}
	statusStore.Unlock()
}

// readStatuses returns the model's status for each requested provider that has
// been detected, with the live active-action overlaid, plus the newest
// capturedAt among them. It performs NO probing. Providers never detected yet
// are omitted (cold store → empty slice). An empty providers filter returns all
// stored providers.
func readStatuses(providers []string) ([]ProviderStatus, time.Time) {
	statusStore.Lock()
	defer statusStore.Unlock()

	wanted := map[string]bool{}
	for _, p := range providers {
		wanted[p] = true
	}

	statuses := make([]ProviderStatus, 0, len(statusStore.byProvider))
	var capturedAt time.Time
	for provider, stored := range statusStore.byProvider {
		if len(wanted) > 0 && !wanted[provider] {
			continue
		}
		status := stored.status
		status.ActiveAction = activeActionForProvider(provider)
		statuses = append(statuses, status)
		if stored.capturedAt.After(capturedAt) {
			capturedAt = stored.capturedAt
		}
	}
	return statuses, capturedAt
}

func resetStatusStoreForTests() {
	statusStore.Lock()
	statusStore.byProvider = map[string]storedStatus{}
	statusStore.Unlock()
}
