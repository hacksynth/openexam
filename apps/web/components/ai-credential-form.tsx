"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { FeedbackMessage, SelectField, SubmitButton, TextField } from "@openexam/core/pixel-ui";

export type AiCredentialFormState = {
  error?: string;
  models?: { id: string; label: string }[];
  notice?: string;
};

export type AiCredentialProviderView = {
  apiMode?: string | null;
  baseUrl?: string | null;
  defaultModel?: string | null;
  label: string;
  provider: string;
};

type AiCredentialFormProps = {
  provider: AiCredentialProviderView;
  listModelsAction: (previousState: AiCredentialFormState, formData: FormData) => Promise<AiCredentialFormState>;
  saveAction: (formData: FormData) => Promise<void>;
  saveLabel: string;
  testAction: (previousState: AiCredentialFormState, formData: FormData) => Promise<AiCredentialFormState>;
};

const emptyState: AiCredentialFormState = {};

export function AiCredentialForm({
  provider,
  listModelsAction,
  saveAction,
  saveLabel,
  testAction
}: AiCredentialFormProps) {
  const [modelState, listModelsFormAction, listPending] = useActionState(listModelsAction, emptyState);
  const [testState, testFormAction, testPending] = useActionState(testAction, emptyState);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? defaultBaseUrl(provider.provider));
  const [selectedModel, setSelectedModel] = useState(provider.defaultModel ?? "");
  const fetchedModels = modelState.models ?? [];
  const models = useMemo(() => mergeModelOptions([provider.defaultModel, selectedModel], fetchedModels), [provider.defaultModel, fetchedModels, selectedModel]);
  const isManualModel = Boolean(selectedModel && modelState.models?.length && !modelState.models.some((model) => model.id === selectedModel));

  useEffect(() => {
    if (selectedModel || !models[0]) {
      return;
    }

    setSelectedModel(models[0].id);
  }, [models, selectedModel]);

  return (
    <form action={saveAction} className="grid gap-3">
      <input name="provider" type="hidden" value={provider.provider} />
      <div className="grid gap-3 lg:grid-cols-2">
        <TextField autoComplete="off" label={provider.provider === "openai" ? "API Key" : `${provider.label} Key`} name="apiKey" onChange={(event) => setApiKey(event.target.value)} placeholder={provider.provider === "openai" ? "sk-..." : "输入 provider key"} required type="password" value={apiKey} />
        <TextField label="Base URL" name="baseUrl" onChange={(event) => setBaseUrl(event.target.value)} placeholder={defaultBaseUrl(provider.provider)} required value={baseUrl} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {provider.provider === "openai" ? (
          <SelectField label="OpenAI API 模式" name="apiMode" defaultValue={provider.apiMode ?? "chat"}>
            <option value="chat">Chat Completions</option>
            <option value="responses">Responses</option>
          </SelectField>
        ) : (
          <input name="apiMode" type="hidden" value="" />
        )}
        <ModelSelector models={models} showModelPicker={fetchedModels.length > 0} selectedModel={selectedModel} setSelectedModel={setSelectedModel} />
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton className="bg-white px-4 py-2" disabled={listPending} formAction={listModelsFormAction} label={listPending ? "获取中..." : "获取模型"} />
        <SubmitButton className="bg-white px-4 py-2" disabled={testPending} formAction={testFormAction} label={testPending ? "测试中..." : "测试"} />
        <SubmitButton className="px-4 py-2" label={saveLabel} />
      </div>
      {modelState.error || modelState.notice ? <FeedbackMessage error={modelState.error} notice={modelState.notice} /> : null}
      {testState.error || testState.notice ? <FeedbackMessage error={testState.error} notice={testState.notice} /> : null}
      {isManualModel ? <p className="text-xs font-bold text-[var(--muted)]">当前模型来自手动输入或历史配置。</p> : null}
    </form>
  );
}

function ModelSelector({
  models,
  showModelPicker,
  selectedModel,
  setSelectedModel
}: {
  models: { id: string; label: string }[];
  showModelPicker: boolean;
  selectedModel: string;
  setSelectedModel: (value: string) => void;
}) {
  const selector = (
    <TextField label="默认模型" name="defaultModel" placeholder="输入模型名" required value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} />
  );

  if (!showModelPicker) {
    return selector;
  }

  return (
    <div className="grid gap-2">
      <SelectField label="模型选择" name="modelPicker" defaultValue={selectedModel || models[0]?.id} onValueChange={setSelectedModel}>
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label || model.id}
          </option>
        ))}
      </SelectField>
      {selector}
    </div>
  );
}

function mergeModelOptions(selectedModels: Array<string | null | undefined>, models: { id: string; label: string }[] | undefined) {
  const unique = new Map<string, { id: string; label: string }>();

  for (const model of models ?? []) {
    const id = model.id.trim();

    if (id) {
      unique.set(id, { id, label: model.label || id });
    }
  }

  for (const selectedModel of selectedModels) {
    const savedModel = selectedModel?.trim();

    if (savedModel && !unique.has(savedModel)) {
      unique.set(savedModel, { id: savedModel, label: savedModel });
    }
  }

  return [...unique.values()].slice(0, 100);
}

function defaultBaseUrl(provider: string) {
  if (provider === "openai") {
    return "https://api.openai.com/v1";
  }

  if (provider === "anthropic") {
    return "https://api.anthropic.com";
  }

  return "https://generativelanguage.googleapis.com/v1beta";
}
