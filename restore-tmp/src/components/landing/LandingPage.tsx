'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  ChevronRight, 
  Calendar, 
  BarChart3, 
  Users, 
  Check, 
  Facebook, 
  Instagram, 
  Youtube,
  Menu,
  X,
  MonitorPlay,
  LineChart,
  Target,
  Shield,
  Zap,
  Clock,
  LogOut
} from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/app-store'
import { AuthModal } from '@/components/auth/AuthModal'

export function LandingPage() {
  const { setCurrentView, user, isAuthenticated, logout } = useAppStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth/me')
        const data = await response.json()
        if (data.success && data.authenticated) {
          useAppStore.getState().setUser(data.user)
        }
      } catch (error) {
        console.log('No active session')
      }
    }
    checkSession()
  }, [])

  const handleStartNow = () => {
    if (isAuthenticated && user) {
      setCurrentView('dashboard-live')
    } else {
      setShowAuthModal(true)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/me', { method: 'DELETE' })
      logout()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const handleAuthSuccess = (userData: { id: string; email: string; name: string }) => {
    useAppStore.getState().setUser(userData)
    setShowAuthModal(false)
    setTimeout(() => {
      setCurrentView('dashboard-live')
    }, 500)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-sm border-b border-white/10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Image 
              src="/assets/img/landing/logo-dark.png" 
              alt="RollerWin Logo" 
              width={50} 
              height={50}
              className="rounded-lg"
            />
            <span className="text-xl font-bold text-amber-500">ROLLERWIN</span>
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-6">
            <a href="#beneficios" className="text-white/80 hover:text-white transition-colors">Beneficios</a>
            <a href="#como-funciona" className="text-white/80 hover:text-white transition-colors">Cómo Funciona</a>
            <a href="#precios" className="text-white/80 hover:text-white transition-colors">Precios</a>
            
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <span className="text-amber-500 text-sm">Hola, {user.name}</span>
                <Button 
                  onClick={() => setCurrentView('dashboard-live')}
                  className="bg-amber-500 hover:bg-amber-400 text-black rounded-full px-6"
                >
                  Ir al Dashboard
                </Button>
                <Button 
                  variant="ghost"
                  onClick={handleLogout}
                  className="text-white/60 hover:text-white"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button 
                onClick={handleStartNow}
                className="bg-red-600 hover:bg-red-700 text-white rounded-full px-6"
              >
                Iniciar Ahora
              </Button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden bg-black/95 border-b border-white/10 px-4 py-4"
          >
            <div className="flex flex-col gap-4">
              <a href="#beneficios" className="text-white/80 hover:text-white transition-colors py-2">Beneficios</a>
              <a href="#como-funciona" className="text-white/80 hover:text-white transition-colors py-2">Cómo Funciona</a>
              <a href="#precios" className="text-white/80 hover:text-white transition-colors py-2">Precios</a>
              
              {isAuthenticated && user ? (
                <>
                  <span className="text-amber-500 text-sm">Hola, {user.name}</span>
                  <Button 
                    onClick={() => { setCurrentView('dashboard-live'); setMobileMenuOpen(false); }}
                    className="bg-amber-500 hover:bg-amber-400 text-black rounded-full px-6 w-full"
                  >
                    Ir al Dashboard
                  </Button>
                  <Button 
                    variant="ghost"
                    onClick={handleLogout}
                    className="text-white/60 hover:text-white w-full"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Cerrar Sesión
                  </Button>
                </>
              ) : (
                <Button 
                  onClick={() => { handleStartNow(); setMobileMenuOpen(false); }}
                  className="bg-red-600 hover:bg-red-700 text-white rounded-full px-6 w-full"
                >
                  Iniciar Ahora
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        <div className="absolute inset-0 z-0">
          <Image
            src="/assets/img/landing/roulette-hero.png"
            alt="Hero Background"
            fill
            className="object-cover opacity-40"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black" />
        </div>
        
        <div className="container mx-auto px-4 z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-6"
          >
            <span className="inline-block text-amber-500 text-lg md:text-xl font-semibold uppercase tracking-wider">
              Software Profesional
            </span>
            
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold uppercase tracking-tight">
              <span className="text-white">Roller</span>
              <span className="text-amber-500">Win</span>
            </h1>
            
            <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto">
              Software de análisis de ruleta rápido, fácil de usar y eficaz que te da la probabilidad de ganar.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button 
                onClick={handleStartNow}
                size="lg"
                className="bg-red-600 hover:bg-red-700 text-white rounded-full px-8 py-6 text-lg font-semibold group"
              >
                Iniciar Ahora
                <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              
              <Button 
                variant="outline"
                size="lg"
                className="border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black rounded-full px-8 py-6 text-lg font-semibold"
              >
                Ver Demo
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="beneficios" className="py-20 bg-gradient-to-b from-black to-zinc-900">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-bold uppercase text-white/80 mb-4">
              Nuestros Beneficios
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Calendar,
                title: 'Al Mes',
                subtitle: 'Acceso Total',
                description: 'Disfruta de acceso completo a todas las funcionalidades del software durante todo el mes.'
              },
              {
                icon: BarChart3,
                title: 'Constante',
                subtitle: 'Análisis',
                description: 'Análisis en tiempo real con actualizaciones constantes para maximizar tus probabilidades.'
              },
              {
                icon: Users,
                title: '100%',
                subtitle: 'Interactivo',
                description: 'Interfaz intuitiva y fácil de usar, perfecta tanto para principiantes como expertos.'
              }
            ].map((benefit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                className="bg-zinc-800/50 rounded-2xl p-8 text-center hover:bg-zinc-800 transition-colors border border-zinc-700/50"
              >
                <benefit.icon className="w-14 h-14 mx-auto text-amber-500 mb-4" />
                <h3 className="text-2xl font-bold text-white mb-1">{benefit.title}</h3>
                <p className="text-xl text-amber-500 font-semibold mb-4">{benefit.subtitle}</p>
                <p className="text-white/70">{benefit.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="como-funciona" className="py-20 bg-zinc-900">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <span className="text-amber-500 font-semibold uppercase tracking-wider">Proceso</span>
            <h2 className="text-3xl md:text-5xl font-bold uppercase text-white mt-2 mb-4">
              ¿Cómo Funciona?
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              Sigue estos simples pasos para comenzar a usar RollerWin y maximizar tus probabilidades
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: MonitorPlay,
                step: '01',
                title: 'Crea tu Cuenta',
                description: 'Regístrate con tu correo. Tu cuenta estará vinculada a tu IP por seguridad.'
              },
              {
                icon: Target,
                step: '02',
                title: 'Selecciona Plataforma',
                description: 'Elige entre Azure, Bet365 o Evolution según tu casino preferido.'
              },
              {
                icon: LineChart,
                step: '03',
                title: 'Ingresa Números',
                description: 'Registra los números que van saliendo en la ruleta en tiempo real.'
              },
              {
                icon: Zap,
                step: '04',
                title: 'Obtén Predicciones',
                description: 'El sistema analiza y te muestra los números con mayor probabilidad.'
              }
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
                className="relative bg-zinc-800/50 rounded-2xl p-6 border border-zinc-700/50 hover:border-amber-500/50 transition-all"
              >
                <div className="absolute -top-3 -left-3 w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center font-bold text-black text-sm">
                  {item.step}
                </div>
                <item.icon className="w-10 h-10 text-amber-500 mb-4 mt-2" />
                <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                <p className="text-white/60 text-sm">{item.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Detailed explanation */}
          <div className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-12">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <h3 className="text-2xl md:text-3xl font-bold text-white">
                Análisis Estadístico Avanzado
              </h3>
              <div className="space-y-4">
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold">Detección de Patrones</h4>
                    <p className="text-white/60 text-sm">El algoritmo identifica números calientes y fríos basándose en la frecuencia histórica.</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold">Análisis en Tiempo Real</h4>
                    <p className="text-white/60 text-sm">Las predicciones se actualizan automáticamente con cada número ingresado.</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Target className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold">Nivel de Confianza</h4>
                    <p className="text-white/60 text-sm">Cada predicción muestra un porcentaje de confianza basado en los datos.</p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <h3 className="text-2xl md:text-3xl font-bold text-white">
                Seguridad Garantizada
              </h3>
              <div className="space-y-4">
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-green-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold">Una Cuenta por IP</h4>
                    <p className="text-white/60 text-sm">Tu cuenta está vinculada a tu dirección IP. No se puede compartir.</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-green-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold">Datos Protegidos</h4>
                    <p className="text-white/60 text-sm">Tus datos y sesiones están protegidos con encriptación de grado militar.</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-green-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold">Uso Exclusivo</h4>
                    <p className="text-white/60 text-sm">Solo tú puedes acceder a tu cuenta desde tu IP registrada.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* What is RollerWin */}
      <section className="py-20 bg-black">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <h2 className="text-3xl md:text-5xl font-bold uppercase text-white">
                ¿Qué es RollerWin?
              </h2>
              <p className="text-lg text-white/80 leading-relaxed">
                Es un software profesional para el análisis de ruleta, rápido, fácil de usar y eficaz, 
                que te da la probabilidad de ganar y te brinda todo lo necesario mediante el análisis 
                de datos de sistemas de ruleta usados comúnmente.
              </p>
              <ul className="space-y-3">
                {['Análisis en tiempo real', 'Predicciones precisas', 'Interfaz intuitiva'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/80">
                    <Check className="text-amber-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <Image
                src="/assets/img/landing/dashboard.png"
                alt="Dashboard Preview"
                width={800}
                height={500}
                className="rounded-2xl shadow-2xl"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* How it was born */}
      <section className="py-20 bg-zinc-900">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="order-2 lg:order-1 relative"
            >
              <Image
                src="/assets/img/landing/roulette-hero.png"
                alt="Roulette Analysis"
                width={800}
                height={500}
                className="rounded-2xl shadow-2xl"
              />
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="order-1 lg:order-2 space-y-6"
            >
              <h2 className="text-3xl md:text-5xl font-bold uppercase text-white">
                ¿Cómo nace RollerWin?
              </h2>
              <p className="text-lg text-white/80 leading-relaxed">
                Debido a la necesidad de muchas personas de tener una mayor probabilidad de éxito, 
                convirtiendo el uso de la ruleta en una inversión estratégica y no solo un simple entretenimiento.
              </p>
              <p className="text-lg text-white/80 leading-relaxed">
                Nuestro software utiliza algoritmos avanzados de análisis estadístico para identificar 
                patrones y tendencias, dándote una ventaja informada en cada sesión.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Supported Platforms */}
      <section className="py-20 bg-black">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <span className="text-amber-500 font-semibold uppercase tracking-wider">
              Vive la experiencia
            </span>
            <h2 className="text-3xl md:text-5xl font-bold uppercase text-white">
              Contamos con análisis de 3 plataformas
            </h2>
            
            <div className="flex flex-wrap justify-center gap-8 pt-8">
              {['Azure', 'Bet365', 'Evolution'].map((platform, index) => (
                <motion.div
                  key={platform}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className="flex items-center gap-3 bg-zinc-800 rounded-full px-6 py-3"
                >
                  <Check className="text-amber-500" />
                  <span className="text-white font-semibold">{platform}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="precios" className="py-20 bg-zinc-900">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-lg mx-auto text-center"
          >
            <span className="text-amber-500 font-semibold uppercase tracking-wider">Paquete</span>
            <h2 className="text-3xl md:text-5xl font-bold uppercase text-white mt-4 mb-6">
              RollerWin Pro
            </h2>
            
            <div className="bg-gradient-to-b from-zinc-800 to-zinc-900 rounded-3xl p-8 border border-zinc-700">
              <div className="mb-6">
                <span className="text-5xl font-bold text-white">$80.00</span>
                <span className="text-white/60 ml-2">/mes</span>
              </div>
              
              <ul className="space-y-4 mb-8 text-left">
                {[
                  'Capacitación personalizada',
                  'Acceso total cada mes',
                  'Análisis constante',
                  'Módulo gráficas avanzadas',
                  'Módulo cartillas para principiantes',
                  '100% interactivo',
                  'Soporte 24/7',
                  'Cuenta vinculada a tu IP'
                ].map((feature, index) => (
                  <li key={index} className="flex items-center gap-3 text-white/80">
                    <Check className="text-amber-500 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              
              <Button 
                onClick={handleStartNow}
                size="lg"
                className="w-full bg-red-600 hover:bg-red-700 text-white rounded-full py-6 text-lg font-semibold group"
              >
                Iniciar Ahora
                <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-black border-t border-zinc-800">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Image 
                src="/assets/img/landing/logo-dark.png" 
                alt="RollerWin Logo" 
                width={40} 
                height={40}
                className="rounded-lg"
              />
              <span className="text-lg font-bold text-amber-500">ROLLERWIN</span>
            </div>
            
            <div className="flex items-center gap-4">
              <a href="#" className="text-white/60 hover:text-white transition-colors">
                <Facebook className="w-6 h-6" />
              </a>
              <a href="#" className="text-white/60 hover:text-white transition-colors">
                <Instagram className="w-6 h-6" />
              </a>
              <a href="#" className="text-white/60 hover:text-white transition-colors">
                <Youtube className="w-6 h-6" />
              </a>
            </div>
            
            <p className="text-white/40 text-sm">
              © 2024 RollerWin. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  )
}
