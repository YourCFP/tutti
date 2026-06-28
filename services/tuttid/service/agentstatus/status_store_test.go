package agentstatus

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"testing"
	"time"
)

func TestStatusStorePutThenRead(t *testing.T) {
	resetStatusStoreForTests()
	now := time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC)
	putDetectedStatus("codex", ProviderStatus{
		Provider: "codex",
		CLI:      CLIStatus{Installed: true, Version: "1.2.3"},
	}, now)

	statuses, capturedAt := readStatuses([]string{"codex"})
	if len(statuses) != 1 {
		t.Fatalf("readStatuses len = %d, want 1", len(statuses))
	}
	if statuses[0].Provider != "codex" || !statuses[0].CLI.Installed {
		t.Fatalf("read status = %#v, want codex installed", statuses[0])
	}
	if !capturedAt.Equal(now) {
		t.Fatalf("capturedAt = %s, want %s", capturedAt, now)
	}
}

func TestStatusStoreColdReadIsEmpty(t *testing.T) {
	resetStatusStoreForTests()
	statuses, _ := readStatuses([]string{"codex"})
	if len(statuses) != 0 {
		t.Fatalf("cold read len = %d, want 0", len(statuses))
	}
}

func TestStatusStoreFiltersByProvider(t *testing.T) {
	resetStatusStoreForTests()
	now := time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC)
	putDetectedStatus("codex", ProviderStatus{Provider: "codex"}, now)
	putDetectedStatus("claude-code", ProviderStatus{Provider: "claude-code"}, now)

	statuses, _ := readStatuses([]string{"claude-code"})
	if len(statuses) != 1 || statuses[0].Provider != "claude-code" {
		t.Fatalf("filtered read = %#v, want only claude-code", statuses)
	}
}

func TestStatusStoreReadOverlaysLiveActiveAction(t *testing.T) {
	resetStatusStoreForTests()
	now := time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC)
	// Stored status has no active-action; the live one is overlaid on read.
	putDetectedStatus("codex", ProviderStatus{Provider: "codex"}, now)

	ctx := withActiveActionToken(context.Background(), nextActiveActionToken())
	claimActiveAction(ctx, "codex", ActiveAction{ID: ActionInstall, Status: "running", Step: "adapter"})
	t.Cleanup(func() { clearActiveAction(ctx, "codex") })

	statuses, _ := readStatuses([]string{"codex"})
	if len(statuses) != 1 || statuses[0].ActiveAction == nil {
		t.Fatalf("read = %#v, want live active-action overlaid", statuses)
	}
	if statuses[0].ActiveAction.Step != "adapter" {
		t.Fatalf("active-action step = %q, want adapter", statuses[0].ActiveAction.Step)
	}
}

func TestGetStatusReadsModelWithoutProbing(t *testing.T) {
	resetStatusStoreForTests()
	now := time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC)
	putDetectedStatus("codex", ProviderStatus{
		Provider: "codex",
		Network: &NetworkStatus{
			Registry: NetworkEndpointStatus{Reachable: true, Endpoint: "https://registry.npmjs.org"},
		},
	}, now)

	// A transport that records any network call — GetStatus must make none.
	var networkCalls int
	service := Service{
		Now: func() time.Time { return now },
		HTTPClient: &http.Client{Transport: networkRoundTripFunc(func(*http.Request) (*http.Response, error) {
			networkCalls++
			return &http.Response{StatusCode: http.StatusNoContent, Body: http.NoBody}, nil
		})},
		ResolveProxy: func(*http.Request) (*url.URL, error) { return nil, nil },
	}

	snapshot, err := service.GetStatus(ListInput{Providers: []string{"codex"}})
	if err != nil {
		t.Fatalf("GetStatus() error = %v", err)
	}
	if networkCalls != 0 {
		t.Fatalf("GetStatus probed the network %d times, want 0", networkCalls)
	}
	if len(snapshot.Providers) != 1 || snapshot.Providers[0].Network == nil {
		t.Fatalf("GetStatus snapshot = %#v, want codex with cached network", snapshot.Providers)
	}
	if !snapshot.Providers[0].Network.Registry.Reachable {
		t.Fatal("GetStatus did not return the cached (stable) network result")
	}
}

func TestDetectWritesModel(t *testing.T) {
	resetStatusStoreForTests()
	service := testService(func(_ string) (string, error) {
		return "", errors.New("not found")
	}, map[string]bool{})

	// Before any detect, the model is cold.
	if pre, _ := service.GetStatus(ListInput{Providers: []string{"codex"}}); len(pre.Providers) != 0 {
		t.Fatalf("GetStatus before Detect = %#v, want empty", pre.Providers)
	}

	if _, err := service.Detect(context.Background(), ListInput{Providers: []string{"codex"}}); err != nil {
		t.Fatalf("Detect() error = %v", err)
	}

	// After Detect, GetStatus returns the detected provider from the model.
	post, err := service.GetStatus(ListInput{Providers: []string{"codex"}})
	if err != nil {
		t.Fatalf("GetStatus() error = %v", err)
	}
	if len(post.Providers) != 1 || post.Providers[0].Provider != "codex" {
		t.Fatalf("GetStatus after Detect = %#v, want codex from model", post.Providers)
	}
}
