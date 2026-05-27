// src/components/escaneo/ModalErrorLectura.jsx
import { useEffect, useRef } from 'react';
import { X, AlertTriangle, ScanLine } from 'lucide-react';

export default function ModalErrorLectura({ 
  isOpen, 
  onClose, 
  codigoRechazado, 
  ultimoCodigoExitoso,
  motivo 
}) {
  const audioErrorRef = useRef(null);

  useEffect(() => {
    if (isOpen && audioErrorRef.current) {
      audioErrorRef.current.currentTime = 0;
      audioErrorRef.current.play().catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const motivos = {
    formato_invalido: 'El código no tiene el formato válido (5-6 dígitos numéricos)',
    ronda_inactiva: 'La ronda no está activa o no tiene grupo asignado',
    producto_en_otra_zona: 'El producto pertenece a otra zona',
    codigo_no_registrado_base_datos: 'Este código no está registrado en la base de datos',
    error_servidor: 'Error de comunicación con el servidor',
    duplicado_rapido: 'Escaneo duplicado muy rápido (menos de 300ms)',
    offline: 'Sin conexión a internet'
  };

  return (
    <>
      <audio ref={audioErrorRef} src="/error-beep.mp3" preload="auto" />
      <div className="modal-overlay error-modal-overlay" onClick={onClose}>
        <div className="modal modal-error" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header error">
            <AlertTriangle size={24} color="#dc2626" />
            <h3>Lectura no registrada</h3>
            <button className="icon-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <div className="modal-body">
            <div className="error-codigos">
              <div className="codigo-box ultimo">
                <ScanLine size={16} />
                <span className="label">Último código exitoso</span>
                <strong>{ultimoCodigoExitoso || 'Ninguno'}</strong>
              </div>
              <div className="codigo-box actual error">
                <AlertTriangle size={16} />
                <span className="label">Código rechazado</span>
                <strong>{codigoRechazado || 'Desconocido'}</strong>
              </div>
            </div>
            <div className="error-motivo">
              <p className="motivo-texto">{motivos[motivo] || motivo || 'No se pudo registrar el código'}</p>
            </div>
            <div className="error-sugerencia">
              <p><strong>Sugerencia:</strong></p>
              <ul>
                <li>Verifica que el código sea correcto (5-6 dígitos numéricos)</li>
                <li>Asegúrate de que la ronda esté activa</li>
                <li>Espera al menos 0.5 segundos entre lecturas del mismo código</li>
                <li>Si el error persiste, verifica tu conexión a internet</li>
              </ul>
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={onClose}>
              Entendido
            </button>
          </div>
        </div>
      </div>
    </>
  );
}