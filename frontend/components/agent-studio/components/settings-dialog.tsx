"use client";

import { useState } from "react";
import {
  CheckIcon,
  Edit3Icon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  StarIcon,
  SunIcon,
  Trash2Icon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useSettings, type ModelConfig } from "@/providers/settings-provider";
import { useTheme } from "@/providers/theme-provider";
import { MODEL_PROVIDER_PRESETS } from "@/constants/agent-studio";

export function SettingsDialog({
  apiBaseUrl,
  onOpenChange,
  onResetWorkspace,
  open,
}: {
  apiBaseUrl: string;
  onOpenChange: (open: boolean) => void;
  onResetWorkspace: () => void;
  open: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const { addModel, getDefaultModel, removeModel, setDefaultModel, settings, updateModel } =
    useSettings();
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftProvider, setDraftProvider] = useState("openai");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [draftBaseUrl, setDraftBaseUrl] = useState("https://api.openai.com/v1");
  const [draftMaxTokens, setDraftMaxTokens] = useState([4096]);
  const [draftTemperature, setDraftTemperature] = useState([0.7]);
  const defaultModel = getDefaultModel();

  const resetEditor = () => {
    setEditorMode(null);
    setEditingModelId(null);
    setDraftName("");
    setDraftProvider("openai");
    setDraftApiKey("");
    setDraftBaseUrl("https://api.openai.com/v1");
    setDraftMaxTokens([4096]);
    setDraftTemperature([0.7]);
  };

  const applyProviderPreset = (providerId: string) => {
    setDraftProvider(providerId);
    const provider = MODEL_PROVIDER_PRESETS.find((item) => item.id === providerId);
    if (provider) setDraftBaseUrl(provider.baseURL);
  };

  const beginCreateModel = () => {
    resetEditor();
    setEditorMode("create");
  };

  const beginEditModel = (model: ModelConfig) => {
    setEditorMode("edit");
    setEditingModelId(model.id);
    setDraftName(model.name);
    setDraftProvider(model.provider);
    setDraftApiKey(model.apiKey ?? "");
    setDraftBaseUrl(model.baseURL ?? "");
    setDraftMaxTokens([model.maxTokens ?? 4096]);
    setDraftTemperature([model.temperature ?? 0.7]);
  };

  const saveModel = () => {
    const payload = {
      name: draftName.trim(),
      provider: draftProvider,
      apiKey: draftApiKey.trim(),
      baseURL: draftBaseUrl.trim(),
      maxTokens: draftMaxTokens[0] ?? 4096,
      temperature: draftTemperature[0] ?? 0.7,
    };
    if (!payload.name) return;
    if (editorMode === "edit" && editingModelId) {
      updateModel(editingModelId, payload);
    } else {
      addModel(payload);
    }
    resetEditor();
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) resetEditor();
      }}
      open={open}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>管理外观、工作区连接和本地模型配置。</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* 外观主题 */}
          <section className="space-y-3 rounded-2xl border p-4">
            <div>
              <div className="text-sm font-medium text-foreground">外观主题</div>
              <div className="text-xs text-muted-foreground">切换当前工作台的显示模式。</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                onClick={() => setTheme("light")}
                variant={theme === "light" ? "default" : "outline"}
              >
                <SunIcon className="h-4 w-4" />
                浅色
              </Button>
              <Button
                onClick={() => setTheme("dark")}
                variant={theme === "dark" ? "default" : "outline"}
              >
                <MoonIcon className="h-4 w-4" />
                深色
              </Button>
              <Button
                onClick={() => setTheme("system")}
                variant={theme === "system" ? "default" : "outline"}
              >
                <MonitorIcon className="h-4 w-4" />
                系统
              </Button>
            </div>
          </section>

          {/* 工作区连接 */}
          <section className="space-y-3 rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">工作区连接</div>
                <div className="text-xs text-muted-foreground">
                  当前前端会直接访问这个后端地址。
                </div>
              </div>
              <Badge variant="outline">Runtime</Badge>
            </div>
            <Input readOnly value={apiBaseUrl} />
            <Button onClick={onResetWorkspace} variant="outline">
              清空当前会话
            </Button>
          </section>

          {/* 模型配置 */}
          <section className="space-y-4 rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">模型配置</div>
                <div className="text-xs text-muted-foreground">
                  这些设置保存在浏览器本地，用于后续接入模型偏好。
                </div>
              </div>
              <Button onClick={beginCreateModel} size="sm" variant="outline">
                <PlusIcon className="h-4 w-4" />
                添加模型
              </Button>
            </div>

            {defaultModel ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <StarIcon className="h-4 w-4 text-primary" />
                  默认模型
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {defaultModel.name} · {defaultModel.provider}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                还没有模型配置。你可以先添加一个常用模型作为默认偏好。
              </div>
            )}

            {settings.models.length > 0 && (
              <div className="space-y-2">
                {settings.models.map((model) => {
                  const isDefault = model.id === settings.defaultModelId;
                  return (
                    <div
                      className="flex items-center justify-between gap-3 rounded-2xl border p-3"
                      key={model.id}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-medium text-foreground">
                            {model.name}
                          </div>
                          <Badge variant="outline">{model.provider}</Badge>
                          {isDefault && <Badge>默认</Badge>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {model.baseURL || "未设置 Base URL"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!isDefault && (
                          <Button
                            onClick={() => setDefaultModel(model.id)}
                            size="icon-sm"
                            variant="ghost"
                          >
                            <StarIcon className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          onClick={() => beginEditModel(model)}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <Edit3Icon className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => removeModel(model.id)}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {editorMode && (
              <div className="space-y-4 rounded-2xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">
                    {editorMode === "edit" ? "编辑模型" : "新增模型"}
                  </div>
                  <Button onClick={resetEditor} size="sm" variant="ghost">
                    取消
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    模型名称
                  </div>
                  <Input
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="例如 gpt-4.1 / claude-sonnet"
                    value={draftName}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    提供商
                  </div>
                  <Select onValueChange={applyProviderPreset} value={draftProvider}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择提供商" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_PROVIDER_PRESETS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    API Key
                  </div>
                  <Input
                    onChange={(e) => setDraftApiKey(e.target.value)}
                    placeholder="sk-..."
                    type="password"
                    value={draftApiKey}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Base URL
                  </div>
                  <Input
                    onChange={(e) => setDraftBaseUrl(e.target.value)}
                    placeholder="https://api.example.com/v1"
                    value={draftBaseUrl}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Max Tokens</span>
                    <span>{draftMaxTokens[0] ?? 4096}</span>
                  </div>
                  <Slider
                    max={32000}
                    min={256}
                    onValueChange={setDraftMaxTokens}
                    step={256}
                    value={draftMaxTokens}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Temperature</span>
                    <span>{(draftTemperature[0] ?? 0.7).toFixed(1)}</span>
                  </div>
                  <Slider
                    max={2}
                    min={0}
                    onValueChange={setDraftTemperature}
                    step={0.1}
                    value={draftTemperature}
                  />
                </div>

                <Button className="w-full" disabled={!draftName.trim()} onClick={saveModel}>
                  <CheckIcon className="h-4 w-4" />
                  保存模型
                </Button>
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
