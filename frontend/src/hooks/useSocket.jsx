import React, { createContext, useContext, useEffect, useState } from 'react'
import io from 'socket.io-client'

const SocketContext = createContext()

export const useSocket = () => {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket debe usarse dentro de SocketProvider')
  }
  return context
}

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null)
  const [conectado, setConectado] = useState(false)

  useEffect(() => {
    const nuevoSocket = io('http://localhost:4018', {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000
    })

    nuevoSocket.on('connect', () => {
      console.log('[SOCKET] Conectado al servidor')
      setConectado(true)
    })

    nuevoSocket.on('connect_error', (error) => {
      console.log('[SOCKET] Error de conexión:', error.message)
      setConectado(false)
    })

    nuevoSocket.on('disconnect', (reason) => {
      console.log('[SOCKET] Desconectado:', reason)
      setConectado(false)
    })

    setSocket(nuevoSocket)

    return () => {
      if (nuevoSocket) {
        nuevoSocket.disconnect()
        nuevoSocket.close()
      }
    }
  }, [])

  const joinSession = (sessionId) => {
    if (socket && conectado) {
      socket.emit('join-session', sessionId)
    }
  }

  const emitScan = (data) => {
    if (socket && conectado) {
      socket.emit('scan', data)
    }
  }

  const onScanUpdate = (callback) => {
    if (socket) {
      socket.on('scan-update', callback)
      return () => socket.off('scan-update', callback)
    }
    return () => {}
  }

  return (
    <SocketContext.Provider value={{ 
      socket, 
      conectado, 
      joinSession, 
      emitScan, 
      onScanUpdate 
    }}>
      {children}
    </SocketContext.Provider>
  )
}