"use client"

import React from 'react'
import { useSettings } from '@/providers/settings-provider'
import { useTheme } from '@/providers/theme-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ModelConfigDialog } from '@/components/settings/model-config-dialog'
import { 
  Settings as SettingsIcon,
  Sun,
  Moon,
  Monitor,
  Plus,
  Edit2,
  Trash2,
  Star,
  Check,
  AlertCircle,
} from 'lucide-react'

export default function SettingsPage() {
  const { settings, removeModel, setDefaultModel, getDefaultModel } = useSettings()
  const { theme, setTheme } = useTheme()
  
  const [showModelDialog, setShowModelDialog] = React.useState(false)
  const [editingModel, setEditingModel] = React.useState<any>(null)
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null)

  const handleEditModel = (model: any) => {
    setEditingModel(model)
    setShowModelDialog(true)
  }

  const handleDeleteModel = (id: string) => {
    if (deleteConfirmId === id) {
      removeModel(id)
      setDeleteConfirmId(null)
    } else {
      setDeleteConfirmId(id)
    }
  }

  const defaultModel = getDefaultModel()

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-8 w-8" />
          设置
        </h1>
        <p className="text-muted-foreground">
          配置应用偏好和模型设置
        </p>
      </div>

      {/* Theme Settings */}
      <Card>
        <CardHeader>
          <CardTitle>外观设置</CardTitle>
          <CardDescription>
            自定义应用的外观和主题
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>主题模式</Label>
            <div className="flex gap-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => setTheme('light')}
                className="flex-1"
              >
                <Sun className="h-4 w-4 mr-2" />
                浅色
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => setTheme('dark')}
                className="flex-1"
              >
                <Moon className="h-4 w-4 mr-2" />
                深色
              </Button>
              <Button
                variant={theme === 'system' ? 'default' : 'outline'}
                onClick={() => setTheme('system')}
                className="flex-1"
              >
                <Monitor className="h-4 w-4 mr-2" />
                跟随系统
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Model Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle>模型配置</CardTitle>
              <CardDescription>
                管理可用的 AI 模型及其参数
              </CardDescription>
            </div>
            <Button onClick={() => {
              setEditingModel(null)
              setShowModelDialog(true)
            }}>
              <Plus className="h-4 w-4 mr-2" />
              添加模型
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {settings.models.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">暂无模型</h3>
              <p className="text-muted-foreground mb-4 max-w-sm">
                添加一个 AI 模型开始使用。支持 OpenAI、Anthropic、Ollama 和其他兼容的提供商。
              </p>
              <Button onClick={() => {
                setEditingModel(null)
                setShowModelDialog(true)
              }}>
                <Plus className="h-4 w-4 mr-2" />
                添加第一个模型
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {settings.models.map((model) => {
                const isDefault = model.id === settings.defaultModelId
                return (
                  <div
                    key={model.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{model.name}</h4>
                        <Badge variant="outline">{model.provider}</Badge>
                        {isDefault && (
                          <Badge variant="default" className="gap-1">
                            <Star className="h-3 w-3" />
                            默认
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {model.baseURL}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isDefault && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDefaultModel(model.id)}
                          title="设为默认"
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditModel(model)}
                        title="编辑"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteModel(model.id)}
                        title={deleteConfirmId === model.id ? "确认删除" : "删除"}
                        className={
                          deleteConfirmId === model.id
                            ? "text-destructive bg-destructive/10 hover:bg-destructive/20"
                            : ""
                        }
                      >
                        {deleteConfirmId === model.id ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Default Model Info */}
      {defaultModel && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">当前默认模型</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Star className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{defaultModel.name}</div>
                <div className="text-sm text-muted-foreground">
                  {defaultModel.provider} · Max: {defaultModel.maxTokens} · Temp: {defaultModel.temperature}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ModelConfigDialog
        open={showModelDialog}
        onOpenChange={setShowModelDialog}
        model={editingModel}
      />
    </div>
  )
}
