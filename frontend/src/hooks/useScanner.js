import { useState, useCallback, useRef } from 'react'

export const useScanner = (onScan, options = {}) => {
  const [isScanning, setIsScanning] = useState(false)
  const [lastScanned, setLastScanned] = useState(null)
  const inputRef = useRef(null)

  const handleScan = useCallback((barcode) => {
    if (!barcode || barcode.trim() === '') return
    
    setLastScanned({
      barcode,
      timestamp: new Date(),
    })
    
    if (onScan) {
      onScan(barcode.trim())
    }
  }, [onScan])

  const startScanning = useCallback(() => {
    setIsScanning(true)
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const stopScanning = useCallback(() => {
    setIsScanning(false)
  }, [])

  const clearLastScanned = useCallback(() => {
    setLastScanned(null)
  }, [])

  return {
    inputRef,
    isScanning,
    lastScanned,
    handleScan,
    startScanning,
    stopScanning,
    clearLastScanned,
  }
}