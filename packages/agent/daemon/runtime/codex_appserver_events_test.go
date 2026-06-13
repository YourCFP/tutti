package agentruntime

import (
	"reflect"
	"testing"
)

// appServerUserInputAnswers is the codex-specific translation of the GUI's
// interactive answer payload into codex's requestUserInput response. The GUI
// contract (packages/agent/gui shared/agentConversation/interactiveAnswerPayload.ts)
// keys answers under answersByQuestionId; `answers` is only a flat display list.
// These cases pin that contract so the adapter can't silently drift back to
// reading the wrong field (the bug that made codex ignore the user's choice).
func TestAppServerUserInputAnswers(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		params    map[string]any
		selection pendingACPResponse
		want      map[string]any
	}{
		{
			name: "canonical single-select from answersByQuestionId",
			selection: pendingACPResponse{
				payload: map[string]any{
					"answers":             []any{"Health check"},
					"answersByQuestionId": map[string]any{"plan-kind": "Health check"},
				},
			},
			want: map[string]any{
				"plan-kind": map[string]any{"answers": []string{"Health check"}},
			},
		},
		{
			name: "multi-select values preserved",
			selection: pendingACPResponse{
				payload: map[string]any{
					"answersByQuestionId": map[string]any{"areas": []any{"A", "B"}},
				},
			},
			want: map[string]any{
				"areas": map[string]any{"answers": []string{"A", "B"}},
			},
		},
		{
			name: "legacy answers-as-map still accepted",
			selection: pendingACPResponse{
				payload: map[string]any{
					"answers": map[string]any{"q1": "postgres"},
				},
			},
			want: map[string]any{
				"q1": map[string]any{"answers": []string{"postgres"}},
			},
		},
		{
			name:   "falls back to optionId keyed by the request's questions",
			params: map[string]any{"questions": []any{map[string]any{"id": "q1"}}},
			selection: pendingACPResponse{
				optionID: "Renderer A",
				payload:  map[string]any{},
			},
			want: map[string]any{
				"q1": map[string]any{"answers": []string{"Renderer A"}},
			},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := appServerUserInputAnswers(tc.params, tc.selection)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("appServerUserInputAnswers = %#v, want %#v", got, tc.want)
			}
		})
	}
}
