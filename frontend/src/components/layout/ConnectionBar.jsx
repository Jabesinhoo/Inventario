// src/components/layout/ConnectionBar.jsx
import { useState, useEffect } from 'react';
import { Wifi, WifiOff, CloudSync } from 'lucide-react';
import { isOnline, syncAllPendingScans, getPendingStats } from '../../services/offlineStorage';
import api from '../../services/api';

export default function ConnectionBar() {
  const [online, setOnline] = useState(isOnline());
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const loadPendingCount = async () => {
    try {
      const stats = await getPendingStats();
      setPendingCount(stats.total);
    } catch (error) {
      console.error('Error cargando pendientes:', error);
      setPendingCount(0);
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncAllPendingScans(api, (progress) => {
        console.log(`Sincronizando escaneos: ${progress.sincronizados}/${progress.total}`);
        loadPendingCount();
      });
    } catch (error) {
      console.error('Error en sincronización:', error);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      handleSync();
    };
    const handleOffline = () => setOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    loadPendingCount();
    
    // Sincronizar cada 30 segundos si está online
    const interval = setInterval(() => {
      if (isOnline() && pendingCount > 0 && !syncing) {
        handleSync();
      }
    }, 30000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className={`connection-bar-global ${online ? 'online' : 'offline'}`}>
      {online ? (
        <>
          <Wifi size={14} />
          <span>Online</span>
          {pendingCount > 0 && (
            <button className="btn-sync" onClick={handleSync} disabled={syncing}>
              <CloudSync size={14} />
              {syncing ? 'Sincronizando...' : `${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}`}
            </button>
          )}
        </>
      ) : (
        <>
          <WifiOff size={14} />
          <span>Offline - Los escaneos se guardarán localmente</span>
          {pendingCount > 0 && (
            <span className="pending-badge">{pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}</span>
          )}
        </>
      )}
    </div>
  );
}