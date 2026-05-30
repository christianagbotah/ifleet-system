'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Bot, X, Send, Minimize2, Maximize2, Trash2, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/lib/store/auth'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// Floating AI chat panel — like Intercom/Drift widget
export function AiChatPanel() {
  const { isAuthenticated, getToken } = useAuthStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, isMinimized])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const sendMessage = useCallback(async () => {
    const trimmed = inputValue.trim()
    if (!trimmed || isLoading) return

    setError(null)

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    // Build conversation history for the API (exclude timestamps)
    const conversationHistory = [...messages, userMessage].map(m => ({
      role: m.role,
      content: m.content,
    }))

    abortControllerRef.current = new AbortController()

    try {
      const token = getToken()
      const controller = new AbortController()
      abortControllerRef.current = controller

      // 90-second timeout for AI response (LLM calls can be slow)
      const timeoutId = setTimeout(() => controller.abort(), 90000)

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: trimmed,
          conversationHistory,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get AI response')
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.response || 'No response received.',
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('AI response timed out. Please try again.')
        return
      }
      const message = err instanceof Error ? err.message : 'Something went wrong'
      // Provide more helpful error messages for common failures
      if (message.includes('Failed to fetch') || message.includes('Unable to connect') || message.includes('NetworkError')) {
        setError('Unable to reach AI service. The service may be starting up — please try again in a moment.')
      } else {
        setError(message)
      }
    } finally {
      setIsLoading(false)
    }
  }, [inputValue, isLoading, messages])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    },
    [sendMessage]
  )

  const clearChat = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  // Don't render if not authenticated
  if (!isAuthenticated) return null

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          >
            <Button
              size="lg"
              onClick={() => setIsOpen(true)}
              className="h-14 w-14 rounded-full shadow-xl bg-amber-500 hover:bg-amber-600 text-white"
              aria-label="Open AI Chat"
            >
              <Bot className="h-6 w-6" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={`fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 ${
              isMinimized ? 'w-64' : 'w-[380px] max-w-[calc(100vw-2rem)]'
            }`}
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          >
            <div className="rounded-2xl shadow-2xl border border-border bg-card overflow-hidden flex flex-col">
              {/* ── Header ── */}
              <div className="flex items-center justify-between px-4 py-3 bg-amber-500 text-white">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  <div>
                    <h3 className="text-sm font-semibold leading-tight">iFleet AI Assistant</h3>
                    <p className="text-xs opacity-80">Fleet management help</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white hover:bg-white/20"
                    onClick={() => setIsMinimized(!isMinimized)}
                    aria-label={isMinimized ? 'Expand chat' : 'Minimize chat'}
                  >
                    {isMinimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
                  </Button>
                  {messages.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-white hover:bg-white/20"
                      onClick={clearChat}
                      aria-label="Clear chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white hover:bg-white/20"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close chat"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* ── Body (hidden when minimized) ── */}
              {!isMinimized && (
                <>
                  {/* Messages area */}
                  <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-3 space-y-3"
                    style={{ height: '360px' }}
                  >
                    {messages.length === 0 && !isLoading && (
                      <div className="flex flex-col items-center justify-center h-full text-center px-4">
                        <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-3">
                          <Bot className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                        </div>
                        <h4 className="text-sm font-medium text-foreground">Hello! I&apos;m your AI assistant</h4>
                        <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                          Ask me about trips, fuel, maintenance, routes, or any fleet operations question.
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
                          {[
                            'How do I check fuel logs?',
                            'Schedule a trip',
                            'Maintenance status',
                            'Route optimization tips',
                          ].map(suggestion => (
                            <button
                              key={suggestion}
                              className="text-xs px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                              onClick={() => {
                                setInputValue(suggestion)
                                inputRef.current?.focus()
                              }}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {messages.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-amber-500 text-white rounded-br-md'
                              : 'bg-muted text-foreground rounded-bl-md'
                          }`}
                        >
                          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                        </div>
                      </div>
                    ))}

                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-2xl rounded-bl-md px-3.5 py-2.5">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                            <span className="text-sm text-muted-foreground">Thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="flex justify-center">
                        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg px-3 py-2 text-xs max-w-[90%]">
                          {error}
                          <button
                            className="ml-2 underline font-medium"
                            onClick={sendMessage}
                          >
                            Retry
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Input area ── */}
                  <div className="border-t p-3">
                    <div className="flex gap-2">
                      <Input
                        ref={inputRef}
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about fleet operations..."
                        disabled={isLoading}
                        className="flex-1 h-10 rounded-full text-sm pl-4 pr-2"
                      />
                      <Button
                        size="icon"
                        onClick={sendMessage}
                        disabled={!inputValue.trim() || isLoading}
                        className="h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shrink-0"
                        aria-label="Send message"
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                      AI may not always be accurate. Verify important information.
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
