function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    message: 'Ruta no encontrada'
  });
}

function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.message === 'Solo se permiten archivos .xlsx') {
    return res.status(400).json({
      ok: false,
      message: err.message
    });
  }

  res.status(err.status || 500).json({
    ok: false,
    message: err.message || 'Error interno del servidor'
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};