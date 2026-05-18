'use client'

import { useEffect } from 'react'

/**
 * /install — Redirect to the .user.js file.
 * When the user clicks "Instalar Userscript" from the dashboard,
 * they land here and are redirected to the actual userscript file.
 * Tampermonkey sees the .user.js extension and triggers installation.
 */
export default function InstallPage() {
  useEffect(() => {
    window.location.href = '/rollerwin-capture.user.js'
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-zinc-400 text-sm">Redirigiendo a la instalacion del userscript...</p>
        <p className="text-zinc-600 text-xs">
          Si Tampermonkey no abre automaticamente,{' '}
          <a
            href="/rollerwin-capture.user.js"
            className="text-amber-400 underline hover:text-amber-300"
          >
            hace click aca
          </a>
        </p>
      </div>
    </div>
  )
}
