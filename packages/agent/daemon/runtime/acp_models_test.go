package agentruntime

import (
	"encoding/json"
	"testing"
)

func TestApplyACPModelsResultProjectsModelConfigOption(t *testing.T) {
	state := newACPLiveState()
	applyACPModelsResult(&state, json.RawMessage(`{
		"models": {
			"availableModels": [
				{"modelId":"auto-gemini-3","name":"Auto (Gemini 3)","description":"Routes automatically"},
				{"modelId":"gemini-3-pro-preview","name":"Gemini 3 Pro"}
			],
			"currentModelId":"auto-gemini-3"
		}
	}`))

	if !state.modelsAPI {
		t.Fatal("modelsAPI = false, want true")
	}
	options := extractModelOptionsFromRuntimeDescriptorsForTest(state.configOptionDescriptors)
	if len(options) != 2 {
		t.Fatalf("model options = %#v, want two", options)
	}
	if options[0]["value"] != "auto-gemini-3" || options[0]["label"] != "Auto (Gemini 3)" {
		t.Fatalf("first model option = %#v", options[0])
	}
	if state.configOptions["model"] != "auto-gemini-3" {
		t.Fatalf("current model = %#v, want auto-gemini-3", state.configOptions["model"])
	}
}

func TestApplyACPModelsResultPreservesDynamicModelMetadata(t *testing.T) {
	state := newACPLiveState()
	applyACPModelsResult(&state, json.RawMessage(`{
		"models": {
			"availableModels": [
				{
					"modelId":"reasoning-model",
					"name":"Reasoning Model",
					"supportsReasoningEffort":true,
					"reasoningEffort":"deep",
					"reasoningEfforts":[
						{"value":"brief","label":"Brief","description":"Fast"},
						{"value":"deep","label":"Deep","default":true}
					],
					"supportsImageInput":true
				},
				{
					"modelId":"plain-model",
					"name":"Plain Model",
					"_meta":{
						"supportsReasoningEffort":false,
						"reasoningEfforts":[],
						"supportsImageInput":false
					}
				}
			],
			"currentModelId":"reasoning-model"
		}
	}`))

	options := extractModelOptionsFromRuntimeDescriptorsForTest(state.configOptionDescriptors)
	if len(options) != 2 {
		t.Fatalf("model options = %#v, want two", options)
	}
	if options[0]["supportsReasoningEffort"] != true || options[0]["reasoningEffort"] != "deep" || options[0]["supportsImageInput"] != true {
		t.Fatalf("reasoning model metadata = %#v", options[0])
	}
	efforts, ok := options[0]["reasoningEfforts"].([]any)
	if !ok || len(efforts) != 2 {
		t.Fatalf("reasoning efforts = %#v, want two", options[0]["reasoningEfforts"])
	}
	brief, _ := efforts[0].(map[string]any)
	if brief["value"] != "brief" || brief["label"] != "Brief" || brief["description"] != "Fast" {
		t.Fatalf("brief effort = %#v", brief)
	}
	if options[1]["supportsReasoningEffort"] != false || options[1]["supportsImageInput"] != false {
		t.Fatalf("plain model metadata = %#v", options[1])
	}
	if efforts, ok := options[1]["reasoningEfforts"].([]any); !ok || len(efforts) != 0 {
		t.Fatalf("plain reasoning efforts = %#v, want advertised empty list", options[1]["reasoningEfforts"])
	}
}

func extractModelOptionsFromRuntimeDescriptorsForTest(descriptors []map[string]any) []map[string]any {
	for _, descriptor := range descriptors {
		if descriptor["id"] != "model" {
			continue
		}
		raw, _ := descriptor["options"].([]any)
		result := make([]map[string]any, 0, len(raw))
		for _, item := range raw {
			if option, ok := item.(map[string]any); ok {
				result = append(result, option)
			}
		}
		return result
	}
	return nil
}
