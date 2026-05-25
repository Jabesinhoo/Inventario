// src/hooks/useRobustScanner.js
import { useCallback, useRef, useState } from 'react';

export function useRobustScanner({ 
  onValidScan, 
  onInvalidScan,
  minDelay = 150,
  maxQueueSize = 10,
  debounceTime = 50
}) {
  const [processing, setProcessing] = useState(false);
  const lastScanRef = useRef({ code: '', time: 0 });
  const pendingQueueRef = useRef([]);
  const processingTimerRef = useRef(null);

  // Validación de formato - MÁS FLEXIBLE
  const isValidFormat = useCallback((code) => {
    // Acepta cualquier código que tenga al menos 3 dígitos numéricos
    // Esto es temporal para que puedas probar
    const cleanCode = String(code).replace(/[^0-9]/g, '');
    return cleanCode.length >= 3 && cleanCode.length <= 20;
  }, []);

  // Limpiar y normalizar código
  const normalizeCode = useCallback((rawCode) => {
    let clean = String(rawCode).replace(/[^0-9]/g, '');
    return clean;
  }, []);

  // Procesar la cola
  const processQueue = useCallback(async () => {
    if (processingTimerRef.current) return;
    if (pendingQueueRef.current.length === 0) return;

    processingTimerRef.current = setTimeout(async () => {
      const codesToProcess = [...pendingQueueRef.current];
      pendingQueueRef.current = [];
      
      // Eliminar duplicados consecutivos
      const uniqueCodes = [];
      for (const code of codesToProcess) {
        if (uniqueCodes[uniqueCodes.length - 1] !== code) {
          uniqueCodes.push(code);
        }
      }
      
      for (const code of uniqueCodes) {
        await processSingleCode(code);
      }
      
      processingTimerRef.current = null;
      
      if (pendingQueueRef.current.length > 0) {
        processQueue();
      }
    }, debounceTime);
  }, [debounceTime]);

  // Procesar un código individual
  const processSingleCode = useCallback(async (code) => {
    const now = Date.now();
    const lastScan = lastScanRef.current;
    
    // Verificar duplicado muy rápido
    if (lastScan.code === code && (now - lastScan.time) < minDelay) {
      onInvalidScan?.(code, 'duplicado_rapido', lastScan.code);
      return false;
    }
    
    // Verificar formato
    if (!isValidFormat(code)) {
      onInvalidScan?.(code, 'formato_invalido', lastScan.code);
      return false;
    }
    
    setProcessing(true);
    
    try {
      const result = await onValidScan(code);
      lastScanRef.current = { code, time: now };
      setProcessing(false);
      return result;
    } catch (error) {
      console.error('Error en escaneo:', error);
      setProcessing(false);
      let motivo = 'error_servidor';
      if (error.message === 'ronda_inactiva') motivo = 'ronda_inactiva';
      if (error.message === 'producto_en_otra_zona') motivo = 'producto_en_otra_zona';
      if (!navigator.onLine) motivo = 'offline';
      onInvalidScan?.(code, motivo, lastScan.code);
      return false;
    }
  }, [minDelay, isValidFormat, onValidScan, onInvalidScan]);

  // Función principal para agregar código al queue
  const addCode = useCallback((rawCode) => {
    if (!rawCode) return;
    
    const cleanCode = normalizeCode(rawCode);
    if (!cleanCode) return;
    
    console.log('📦 Código encolado:', cleanCode); // Para debug
    
    pendingQueueRef.current.push(cleanCode);
    
    if (pendingQueueRef.current.length > maxQueueSize) {
      pendingQueueRef.current = pendingQueueRef.current.slice(-maxQueueSize);
    }
    
    processQueue();
  }, [normalizeCode, maxQueueSize, processQueue]);

  const resetScanner = useCallback(() => {
    lastScanRef.current = { code: '', time: 0 };
    pendingQueueRef.current = [];
    if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
    setProcessing(false);
  }, []);

  return {
    addCode,
    processing,
    resetScanner,
    isValidFormat: isValidFormat
  };
}