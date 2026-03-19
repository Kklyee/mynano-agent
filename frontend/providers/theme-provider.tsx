"use client"

import * as React from "react"

const ThemeProviderContext = React.createContext<
  | {
      theme: string
      setTheme: (theme: string) => void
    }
  | undefined
>(undefined)

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  attribute,
  disableTransitionOnChange,
  enableSystem,
}: React.PropsWithChildren<{
  attribute?: string
  defaultTheme?: string
  disableTransitionOnChange?: boolean
  enableSystem?: boolean
  storageKey?: string
}>) {
  const [theme, setThemeState] = React.useState(defaultTheme)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    const root = window.document.documentElement
    const savedTheme = localStorage.getItem(storageKey)

    if (savedTheme) {
      setThemeState(savedTheme)
      root.classList.remove("light", "dark")
      root.classList.add(savedTheme === "system" ? getSystemTheme() : savedTheme)
    } else {
      root.classList.add(defaultTheme === "system" ? getSystemTheme() : defaultTheme)
    }
  }, [defaultTheme, storageKey])

  const getSystemTheme = () => {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }

  const setTheme = React.useCallback(
    (newTheme: string) => {
      const root = window.document.documentElement
      root.classList.remove("light", "dark")

      const themeToApply = newTheme === "system" ? getSystemTheme() : newTheme
      root.classList.add(themeToApply)

      localStorage.setItem(storageKey, newTheme)
      setThemeState(newTheme)
    },
    [storageKey]
  )

  // Prevent flash of wrong theme
  if (!mounted) {
    return <>{children}</>
  }

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
