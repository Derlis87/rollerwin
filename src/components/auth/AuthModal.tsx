'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mail, Lock, User, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (user: { id: string; email: string; name: string }) => void
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Login form
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  
  // Register form
  const [registerName, setRegisterName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('')

  const resetForm = () => {
    setLoginEmail('')
    setLoginPassword('')
    setRegisterName('')
    setRegisterEmail('')
    setRegisterPassword('')
    setRegisterConfirmPassword('')
    setError(null)
    setSuccess(null)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al iniciar sesión')
      }

      setSuccess('¡Inicio de sesión exitoso!')
      setTimeout(() => {
        onSuccess(data.user)
        onClose()
        resetForm()
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validations
    if (registerPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    if (registerPassword !== registerConfirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    if (!registerName || registerName.length < 2) {
      setError('El nombre debe tener al menos 2 caracteres')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: registerName,
          email: registerEmail,
          password: registerPassword
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al registrar')
      }

      setSuccess('¡Cuenta creada exitosamente! Ahora puedes iniciar sesión.')
      setActiveTab('login')
      setLoginEmail(registerEmail)
      setRegisterName('')
      setRegisterEmail('')
      setRegisterPassword('')
      setRegisterConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="relative">
                <button
                  onClick={onClose}
                  className="absolute right-4 top-4 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <CardTitle className="text-center text-2xl">
                  <span className="text-white">Roller</span>
                  <span className="text-amber-500">Win</span>
                </CardTitle>
                <p className="text-center text-zinc-400 text-sm mt-1">
                  Acceso exclusivo por IP única
                </p>
              </CardHeader>
              
              <CardContent>
                <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as 'login' | 'register'); setError(null); setSuccess(null); }}>
                  <TabsList className="grid w-full grid-cols-2 bg-zinc-800">
                    <TabsTrigger value="login" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">
                      Iniciar Sesión
                    </TabsTrigger>
                    <TabsTrigger value="register" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">
                      Registrarse
                    </TabsTrigger>
                  </TabsList>

                  {error && (
                    <Alert variant="destructive" className="mt-4 bg-red-500/10 border-red-500/50">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-red-400">{error}</AlertDescription>
                    </Alert>
                  )}

                  {success && (
                    <Alert className="mt-4 bg-green-500/10 border-green-500/50">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <AlertDescription className="text-green-400">{success}</AlertDescription>
                    </Alert>
                  )}

                  <TabsContent value="login" className="mt-4">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="login-email" className="text-zinc-300">Correo electrónico</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                          <Input
                            id="login-email"
                            type="email"
                            placeholder="tu@email.com"
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="login-password" className="text-zinc-300">Contraseña</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                          <Input
                            id="login-password"
                            type="password"
                            placeholder="••••••••"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                            required
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Iniciando...
                          </>
                        ) : (
                          'Iniciar Sesión'
                        )}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="register" className="mt-4">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="register-name" className="text-zinc-300">Nombre completo</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                          <Input
                            id="register-name"
                            type="text"
                            placeholder="Tu nombre"
                            value={registerName}
                            onChange={(e) => setRegisterName(e.target.value)}
                            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="register-email" className="text-zinc-300">Correo electrónico</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                          <Input
                            id="register-email"
                            type="email"
                            placeholder="tu@email.com"
                            value={registerEmail}
                            onChange={(e) => setRegisterEmail(e.target.value)}
                            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="register-password" className="text-zinc-300">Contraseña</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                          <Input
                            id="register-password"
                            type="password"
                            placeholder="Mínimo 6 caracteres"
                            value={registerPassword}
                            onChange={(e) => setRegisterPassword(e.target.value)}
                            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="register-confirm" className="text-zinc-300">Confirmar contraseña</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                          <Input
                            id="register-confirm"
                            type="password"
                            placeholder="Repite tu contraseña"
                            value={registerConfirmPassword}
                            onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                            required
                          />
                        </div>
                      </div>

                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                        <p className="text-amber-200 text-xs">
                          ⚠️ Tu cuenta estará vinculada a tu dirección IP. 
                          No podrás compartir tu cuenta con otros dispositivos.
                        </p>
                      </div>

                      <Button
                        type="submit"
                        className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Registrando...
                          </>
                        ) : (
                          'Crear Cuenta'
                        )}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
