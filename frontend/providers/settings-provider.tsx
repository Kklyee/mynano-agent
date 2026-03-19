"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'

export interface ModelConfig {
  id: string
  name: string
  provider: string
  apiKey?: string
  baseURL?: string
  maxTokens?: number
  temperature?: number
}

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  models: ModelConfig[]
  defaultModelId?: string
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  models: [],
}

interface SettingsContextType {
  settings: Settings
  updateSettings: (updates: Partial<Settings>) => void
  addModel: (model: Omit<ModelConfig, 'id'>) => void
  updateModel: (id: string, updates: Partial<ModelConfig>) => void
  removeModel: (id: string) => void
  setDefaultModel: (id: string) => void
  getDefaultModel: () => ModelConfig | undefined
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [mounted, setMounted] = useState(false)

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('agent-settings')
      if (saved) {
        setSettings(JSON.parse(saved))
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
    setMounted(true)
  }, [])

  // Save settings to localStorage when they change
  useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem('agent-settings', JSON.stringify(settings))
      } catch (error) {
        console.error('Failed to save settings:', error)
      }
    }
  }, [settings, mounted])

  const updateSettings = (updates: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...updates }))
  }

  const addModel = (model: Omit<ModelConfig, 'id'>) => {
    const newModel: ModelConfig = {
      ...model,
      id: `model-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }
    setSettings(prev => ({
      ...prev,
      models: [...prev.models, newModel],
    }))
    return newModel.id
  }

  const updateModel = (id: string, updates: Partial<ModelConfig>) => {
    setSettings(prev => ({
      ...prev,
      models: prev.models.map(m => 
        m.id === id ? { ...m, ...updates } : m
      ),
    }))
  }

  const removeModel = (id: string) => {
    setSettings(prev => ({
      ...prev,
      models: prev.models.filter(m => m.id !== id),
      defaultModelId: prev.defaultModelId === id ? undefined : prev.defaultModelId,
    }))
  }

  const setDefaultModel = (id: string) => {
    setSettings(prev => ({
      ...prev,
      defaultModelId: id,
    }))
  }

  const getDefaultModel = (): ModelConfig | undefined => {
    if (settings.defaultModelId) {
      return settings.models.find(m => m.id === settings.defaultModelId)
    }
    return settings.models[0]
  }

  const value = {
    settings,
    updateSettings,
    addModel,
    updateModel,
    removeModel,
    setDefaultModel,
    getDefaultModel,
  }

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return <>{children}</>
  }

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
