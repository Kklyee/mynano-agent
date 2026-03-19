"use client"

import Link from 'next/link'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SettingsButton() {
  return (
    <Link href="/settings">
      <Button variant="ghost" size="icon" title="设置">
        <Settings className="h-5 w-5" />
      </Button>
    </Link>
  )
}
