package agentruntime

import (
	"encoding/json"
	"strings"
)

type acpModelInfo struct {
	Description             string                     `json:"description"`
	ModelID                 string                     `json:"modelId"`
	Name                    string                     `json:"name"`
	SupportsReasoningEffort *bool                      `json:"supportsReasoningEffort"`
	ReasoningEffort         string                     `json:"reasoningEffort"`
	ReasoningEfforts        []map[string]any           `json:"reasoningEfforts"`
	SupportsImageInput      *bool                      `json:"supportsImageInput"`
	Meta                    map[string]json.RawMessage `json:"_meta"`
}

func applyACPModelsResult(state *acpLiveState, raw json.RawMessage) {
	if state == nil || len(raw) == 0 {
		return
	}
	var payload struct {
		Models *struct {
			AvailableModels []acpModelInfo `json:"availableModels"`
			CurrentModelID  string         `json:"currentModelId"`
		} `json:"models"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil || payload.Models == nil {
		return
	}
	state.modelsAPI = true
	options := make([]any, 0, len(payload.Models.AvailableModels))
	for _, model := range payload.Models.AvailableModels {
		modelID := strings.TrimSpace(model.ModelID)
		if modelID == "" {
			continue
		}
		label := strings.TrimSpace(model.Name)
		if label == "" {
			label = modelID
		}
		option := map[string]any{"value": modelID, "label": label}
		if description := strings.TrimSpace(model.Description); description != "" {
			option["description"] = description
		}
		applyACPModelMetadata(option, model)
		options = append(options, option)
	}
	if len(options) == 0 {
		return
	}
	descriptor := map[string]any{
		"id":           "model",
		"name":         "Model",
		"currentValue": strings.TrimSpace(payload.Models.CurrentModelID),
		"options":      options,
	}
	descriptors := cloneConfigOptionDescriptors(state.configOptionDescriptors)
	replaced := false
	for index := range descriptors {
		if strings.TrimSpace(asString(descriptors[index]["id"])) == "model" {
			descriptors[index] = descriptor
			replaced = true
			break
		}
	}
	if !replaced {
		descriptors = append(descriptors, descriptor)
	}
	applyACPConfigOptionDescriptors(state, descriptors)
}

func applyACPModelMetadata(option map[string]any, model acpModelInfo) {
	metadata := model.Meta
	supportsReasoning := model.SupportsReasoningEffort
	if supportsReasoning == nil {
		supportsReasoning = rawJSONBool(metadata["supportsReasoningEffort"])
	}
	if supportsReasoning != nil {
		option["supportsReasoningEffort"] = *supportsReasoning
	}
	reasoningEffort := strings.TrimSpace(model.ReasoningEffort)
	if reasoningEffort == "" {
		reasoningEffort = rawJSONString(metadata["reasoningEffort"])
	}
	if reasoningEffort != "" {
		option["reasoningEffort"] = reasoningEffort
	}
	reasoningEfforts := model.ReasoningEfforts
	if reasoningEfforts == nil {
		_ = json.Unmarshal(metadata["reasoningEfforts"], &reasoningEfforts)
	}
	if reasoningEfforts != nil {
		option["reasoningEfforts"] = normalizeACPReasoningEfforts(reasoningEfforts)
	}
	supportsImage := model.SupportsImageInput
	if supportsImage == nil {
		supportsImage = rawJSONBool(metadata["supportsImageInput"])
	}
	if supportsImage != nil {
		option["supportsImageInput"] = *supportsImage
	}
}

func normalizeACPReasoningEfforts(values []map[string]any) []any {
	result := make([]any, 0, len(values))
	seen := map[string]struct{}{}
	for _, raw := range values {
		value := strings.TrimSpace(firstNonEmptyString(asString(raw["value"]), asString(raw["id"])))
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		entry := map[string]any{"value": value}
		if label := strings.TrimSpace(firstNonEmptyString(asString(raw["label"]), asString(raw["name"]))); label != "" {
			entry["label"] = label
		}
		if description := strings.TrimSpace(asString(raw["description"])); description != "" {
			entry["description"] = description
		}
		if isDefault, ok := raw["default"].(bool); ok {
			entry["default"] = isDefault
		}
		result = append(result, entry)
	}
	return result
}

func rawJSONBool(raw json.RawMessage) *bool {
	if len(raw) == 0 {
		return nil
	}
	var value bool
	if json.Unmarshal(raw, &value) != nil {
		return nil
	}
	return &value
}

func rawJSONString(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return ""
	}
	return strings.TrimSpace(value)
}

func acpModelReasoningEffort(state acpLiveState, modelID string, requested string) (string, bool) {
	modelID = strings.TrimSpace(modelID)
	requested = strings.TrimSpace(requested)
	for _, descriptor := range state.configOptionDescriptors {
		if strings.TrimSpace(asString(descriptor["id"])) != "model" {
			continue
		}
		for _, model := range configOptionEntries(descriptor["options"]) {
			if strings.TrimSpace(asString(model["value"])) != modelID {
				continue
			}
			supported, supportKnown := model["supportsReasoningEffort"].(bool)
			_, effortsAdvertised := model["reasoningEfforts"]
			defaultEffort := strings.TrimSpace(asString(model["reasoningEffort"]))
			if supportKnown && !supported {
				return "", true
			}
			if !supportKnown && !effortsAdvertised && defaultEffort == "" {
				return "", false
			}
			first := ""
			defaultSupported := false
			for _, effort := range configOptionEntries(model["reasoningEfforts"]) {
				value := strings.TrimSpace(firstNonEmptyString(asString(effort["value"]), asString(effort["id"])))
				if value == "" {
					continue
				}
				if first == "" {
					first = value
				}
				if value == requested {
					return requested, true
				}
				if defaultEffort == "" && effort["default"] == true {
					defaultEffort = value
				}
				if value == defaultEffort {
					defaultSupported = true
				}
			}
			if defaultSupported {
				return defaultEffort, true
			}
			return first, true
		}
	}
	return "", false
}

func (a *standardACPAdapter) sessionModelReasoningEffort(
	agentSessionID string,
	modelID string,
	requested string,
) (string, bool) {
	if a == nil {
		return "", false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	session := a.sessions[strings.TrimSpace(agentSessionID)]
	if session == nil {
		return "", false
	}
	return acpModelReasoningEffort(session.acpLiveState, modelID, requested)
}

func (a *standardACPAdapter) sessionCurrentModelID(agentSessionID string) string {
	if a == nil {
		return ""
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	session := a.sessions[strings.TrimSpace(agentSessionID)]
	if session == nil {
		return ""
	}
	return strings.TrimSpace(asString(session.configOptions["model"]))
}
