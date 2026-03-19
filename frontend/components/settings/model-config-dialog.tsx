"use client"

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useSettings } from '@/providers/settings-provider'
import { ModelConfig } from '@/providers/settings-provider'

interface ModelConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  model?: ModelConfig | null
}

const COMMON_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', baseURL: 'https://api.openai.com/v1' },
  { id: 'anthropic', name: 'Anthropic', baseURL: 'https://api.anthropic.com/v1' },
  { id: 'google', name: 'Google AI', baseURL: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'ollama', name: 'Ollama', baseURL: 'http://localhost:11434/v1' },
  { id: 'custom', name: '自定义', baseURL: '' },
]

export function ModelConfigDialog({ open, onOpenChange, model }: ModelConfigDialogProps) {
  const { addModel, updateModel } = useSettings()
  
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [maxTokens, setMaxTokens] = useState([4096])
  const [temperature, setTemperature] = useState([0.7])

  const isEditing = !!model

  useEffect(() => {
    if (model) {
      setName(model.name)
      setProvider(model.provider)
      setApiKey(model.apiKey || '')
      setBaseURL(model.baseURL || '')
      setMaxTokens([model.maxTokens || 4096])
      setTemperature([model.temperature || 0.7])
    } else {
      setName('')
      setProvider('openai')
      setApiKey('')
      setBaseURL('')
      setMaxTokens([4096])
      setTemperature([0.7])
    }
  }, [model, open])

  const handleProviderChange = (value: string) => {
    setProvider(value)
    const providerConfig = COMMON_PROVIDERS.find(p => p.id === value)
    if (providerConfig && providerConfig.baseURL) {
      setBaseURL(providerConfig.baseURL)
    }
  }

  const handleSave = () => {
    const modelData = {
      name,
      provider,
      apiKey,
      baseURL,
      maxTokens: maxTokens[0],
      temperature: temperature[0],
    }

    if (isEditing && model) {
      updateModel(model.id, modelData)
    } else {
      addModel(modelData)
    }

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? '编辑模型' : '添加模型'}</DialogTitle>
          <DialogDescription>
            配置 AI 模型的连接参数。API Key 将被安全保存在本地。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">模型名称</Label>
            <Input
              id="name"
              placeholder="例如: gpt-4, claude-3-opus"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="provider">提供商</Label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger>
                <SelectValue placeholder="选择提供商" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="baseURL">Base URL</Label>
            <Input
              id="baseURL"
              placeholder="https://api.example.com/v1"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="maxTokens">最大 Tokens: {maxTokens[0]}</Label>
            <Slider
              id="maxTokens"
              min={256}
              max={32000}
              step={256}
              value={maxTokens}
              onValueChange={setMaxTokens}
              className="w-full"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="temperature">Temperature: {temperature[0]}</Label>
            <Slider
              id="temperature"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onValueChange={setTemperature}
              className="w-full"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {isEditing ? '保存' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
