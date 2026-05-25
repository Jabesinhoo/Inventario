// src/hooks/useRobustScanner.js
import { useCallback, useRef, useState } from 'react';

export function useRobustScanner({ 
  onValidScan, 
  onInvalidScan,
  minDelay = 150,      // Delay mínimo entre escaneos del mismo código (ms)
  maxQueueSize = 10,   // Tamaño máximo de cola de procesamiento
  debounceTime = 50    // Tiempo para agrupar lecturas rápidas
}) {
  const [processing, setProcessing] = useState(false);
  const lastScanRef = useRef({ code: '', time: 0 });
  const pendingQueueRef = useRef([]);
  const processingTimerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Validación de formato
  const isValidFormat = useCallback((code) => {
    return /^\d{5,6}$/.test(code);
  }, []);

  // Limpiar y normalizar código
  const normalizeCode = useCallback((rawCode) => {
    // Eliminar cualquier caracter no numérico
    let clean = String(rawCode).replace(/[^0-9]/g, '');
    
    // Limitar a máximo 6 dígitos
    if (clean.length > 6) clean = clean.slice(0, 6);
    
    return clean;
  }, []);

  // Procesar la cola de pendientes
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
      
      // Procesar cada código único
      for (const code of uniqueCodes) {
        await processSingleCode(code);
      }
      
      processingTimerRef.current = null;
      
      // Si entraron más códigos mientras procesábamos, procesarlos
      if (pendingQueueRef.current.length > 0) {
        processQueue();
      }
    }, debounceTime);
  }, [debounceTime]);

  // Procesar un código individual
  const processSingleCode = useCallback(async (code) => {
    const now = Date.now();
    const lastScan = lastScanRef.current;
    
    // Verificar duplicado muy rápido (mismo código)
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
      setProcessing(false);
      let motivo = 'error_servidor';
      if (error.response?.status === 409) motivo = 'producto_en_otra_zona';
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
    
    // Agregar a la cola
    pendingQueueRef.current.push(cleanCode);
    
    // Limitar tamaño de cola
    if (pendingQueueRef.current.length > maxQueueSize) {
      pendingQueueRef.current = pendingQueueRef.current.slice(-maxQueueSize);
    }
    
    processQueue();
  }, [normalizeCode, maxQueueSize, processQueue]);

  // Reset del escáner (útil para cambios de ronda)
  const resetScanner = useCallback(() => {
    lastScanRef.current = { code: '', time: 0 };
    pendingQueueRef.current = [];
    if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setProcessing(false);
  }, []);

  return {
    addCode,
    processing,
    resetScanner,
    isValidFormat: isValidFormat
  };
}