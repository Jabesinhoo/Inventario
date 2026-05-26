import api from './api';
import * as XLSX from 'xlsx';

// Formato estándar de columnas (mismo que Melissa)
const COLUMNAS_EXCEL = [
    { header: 'Empresa', key: 'empresa', width: 30 },
    { header: 'Tipo Documento', key: 'tipoDocumento', width: 15 },
    { header: 'Documento Número', key: 'documentoNumero', width: 20 },
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Elaborado', key: 'elaborado', width: 20 },
    { header: 'Destino', key: 'destino', width: 25 },
    { header: 'Nota', key: 'nota', width: 35 },
    { header: 'Verificado', key: 'verificado', width: 12 },
    { header: 'Anulado', key: 'anulado', width: 10 },
    { header: 'Producto', key: 'producto', width: 20 },
    { header: 'Descripción', key: 'descripcion', width: 60 },
    { header: 'Unidad De Medida', key: 'unidadMedida', width: 15 },
    { header: 'Cantidad Físico', key: 'cantidadFisico', width: 18 },
    { header: 'Cantidad Sistema', key: 'cantidadSistema', width: 15 },
    { header: 'IVA', key: 'iva', width: 10 },
    { header: 'Valor Unitario', key: 'valorUnitario', width: 15 },
    { header: 'Descuento', key: 'descuento', width: 10 },
    { header: 'Vencimiento', key: 'vencimiento', width: 12 },
    { header: 'Lote', key: 'lote', width: 15 },
    { header: 'Talla', key: 'talla', width: 10 },
    { header: 'Color', key: 'color', width: 15 }
];

const EMPRESA_NOMBRE = 'TECNOCOMPUTER MELISSA SANDOVAL';

function getArrayFromResponse(response) {
    if (Array.isArray(response?.data?.data)) return response.data.data;
    if (Array.isArray(response?.data)) return response.data;
    return [];
}

function normalizarSku(value) {
    return String(value || '').trim();
}

function getCantidadProducto(producto) {
    return Number(
        producto?.cantidadTotal ??
        producto?.cantidadTotalEnOtraZona ??
        producto?.cantidad ??
        producto?.total ??
        producto?.cantidadInicial ??
        producto?.cantidadFisico ??
        0
    );
}

function getDescripcionProducto(producto) {
    return (
        producto?.descripcionSnapshot ||
        producto?.descripcion ||
        producto?.nombre ||
        producto?.nombreGenerico ||
        'Sin descripción'
    );
}

function getElaboradoPor() {
    try {
        const rawUser =
            localStorage.getItem('inventario_user') ||
            localStorage.getItem('user') ||
            localStorage.getItem('usuario');

        if (rawUser) {
            const parsed = JSON.parse(rawUser);
            return parsed?.nombre || parsed?.email || 'Supervisor';
        }
    } catch (_) {
        // Ignorar errores de parseo de localStorage.
    }

    return localStorage.getItem('userName') || 'Supervisor';
}

function safeSheetName(name) {
    return String(name || 'Hoja')
        .replace(/[\\/?*[\]:]/g, '_')
        .slice(0, 31);
}


function getUniqueSheetName(workbook, baseName) {
  const cleanBase = safeSheetName(baseName || 'Hoja');
  const existingNames = new Set(workbook.SheetNames || []);

  if (!existingNames.has(cleanBase)) {
    return cleanBase;
  }

  let counter = 2;

  while (true) {
    const suffix = `_${counter}`;
    const maxBaseLength = 31 - suffix.length;
    const candidate = `${cleanBase.slice(0, maxBaseLength)}${suffix}`;

    if (!existingNames.has(candidate)) {
      return candidate;
    }

    counter += 1;
  }
}

function safeFileName(name) {
    return String(name || 'exportacion')
        .replace(/[^a-z0-9_\-]/gi, '_')
        .replace(/_+/g, '_');
}

function aplicarAnchosColumnas(ws, columnas = COLUMNAS_EXCEL) {
    ws['!cols'] = columnas.map((col) => ({ wch: col.width || 15 }));
}

function crearFilaMelissa({
    producto,
    cantidad,
    fechaStr,
    elaboradoPor,
    destino,
    nota,
    valorUnitario = 0
}) {
    return [
        EMPRESA_NOMBRE,
        'AI',
        '',
        fechaStr,
        elaboradoPor,
        destino || 'SIN GRUPO',
        nota || '',
        -1,
        0,
        normalizarSku(producto?.sku) || 'N/A',
        getDescripcionProducto(producto),
        producto?.unidadMedida || 'Und.',
        Number(cantidad || 0),
        0,
        0,
        Number(valorUnitario || 0),
        0,
        fechaStr,
        producto?.lote || '',
        producto?.talla || '',
        producto?.color || ''
    ];
}

function descargarWorkbook(workbook, nombreArchivo) {
    XLSX.writeFile(workbook, nombreArchivo);
    return { ok: true, message: 'Exportación completada', archivo: nombreArchivo };
}

function deduplicarProductosPorSku(productos) {
    const map = new Map();

    for (const producto of productos || []) {
        const sku = normalizarSku(producto?.sku);
        if (!sku) continue;

        if (!map.has(sku)) {
            map.set(sku, {
                sku,
                descripcionSnapshot: getDescripcionProducto(producto),
                cantidadInicial: getCantidadProducto(producto),
                cantidad: getCantidadProducto(producto),
                unidadMedida: producto?.unidadMedida || 'Und.',
                grupoNombre: producto?.grupoNombre || producto?.grupo || 'SIN GRUPO',
                precioCoste: Number(producto?.precioCoste || producto?.valorUnitario || 0),
                cantidadBodega: Number(producto?.cantidadBodega || 0),
                cantidadExhibicion: Number(producto?.cantidadExhibicion || 0),
                zona: producto?.zona || 'N/A',
                origen: producto?.origen || producto?.origenArchivo || 'N/A'
            });
        } else {
            const actual = map.get(sku);
            actual.cantidadInicial += getCantidadProducto(producto);
            actual.cantidad += getCantidadProducto(producto);
            actual.cantidadBodega += Number(producto?.cantidadBodega || 0);
            actual.cantidadExhibicion += Number(producto?.cantidadExhibicion || 0);

            if (
                actual.descripcionSnapshot === 'Sin descripción' &&
                getDescripcionProducto(producto) !== 'Sin descripción'
            ) {
                actual.descripcionSnapshot = getDescripcionProducto(producto);
            }
        }
    }

    return Array.from(map.values()).sort((a, b) => a.sku.localeCompare(b.sku));
}

// Obtiene productos base desde la ruta real del backend.
// Antes estaba usando /conteo-inicial-detalle, pero esa ruta no existe en tus routes.
async function obtenerProductosBase(inventarioId) {
    try {
        const response = await api.get('/conteo-inicial/resumen', {
            params: { inventarioId }
        });

        const rows = getArrayFromResponse(response);

        const productos = deduplicarProductosPorSku(
            rows.map((item) => ({
                sku: item.sku,
                descripcionSnapshot: item.descripcion,
                cantidadInicial: Number(item.total || item.cantidadTotal || 0),
                cantidad: Number(item.total || item.cantidadTotal || 0),
                cantidadBodega: Number(item.cantidadBodega || 0),
                cantidadExhibicion: Number(item.cantidadExhibicion || 0),
                unidadMedida: item.unidadMedida || 'Und.',
                grupoNombre: item.grupo || item.grupoNombre || 'SIN GRUPO',
                precioCoste: Number(item.precioCoste || item.valorUnitario || 0),
                zona: item.zona || 'N/A',
                origen: item.origen || item.origenArchivo || 'Conteo Inicial'
            }))
        );

        console.log('Productos base desde /conteo-inicial/resumen:', productos.length);

        if (productos.length > 0) {
            return productos;
        }
    } catch (error) {
        console.warn(
            'No se pudo obtener /conteo-inicial/resumen. Intentando fallback desde /lecturas/resumen.',
            error?.response?.data || error?.message || error
        );
    }

    // Fallback: productos que ya tengan lecturas válidas.
    try {
        const response = await api.get('/lecturas/resumen', {
            params: { inventarioId }
        });

        const rows = getArrayFromResponse(response);

        const productos = deduplicarProductosPorSku(
            rows.map((item) => ({
                sku: item.sku,
                descripcionSnapshot: item.descripcionSnapshot || item.descripcion,
                cantidadInicial: 0,
                cantidad: Number(item.cantidadTotal || item.total || 0),
                unidadMedida: item.unidadMedida || 'Und.',
                grupoNombre: item.grupoNombre || item.grupo || 'SIN GRUPO',
                precioCoste: Number(item.precioCoste || item.valorUnitario || 0)
            }))
        );

        console.log('Productos base desde /lecturas/resumen:', productos.length);
        return productos;
    } catch (error) {
        console.error(
            'Error obteniendo productos base desde fallback /lecturas/resumen:',
            error?.response?.data || error?.message || error
        );
        return [];
    }
}

// Obtener rondas reales desde la ruta que sí existe: /rondas
async function obtenerRondasInventario(inventarioId) {
    try {
        const response = await api.get('/rondas', {
            params: { inventarioId }
        });

        const rows = getArrayFromResponse(response);

        const rondasMap = new Map();

        for (const ronda of rows) {
            if (!ronda?.id) continue;

            const id = Number(ronda.id);

            if (!rondasMap.has(id)) {
                rondasMap.set(id, {
                    id,
                    numeroRonda: ronda.numeroRonda,
                    tipoRonda: ronda.tipoRonda || 'completa',
                    estado: ronda.estado || 'N/A',
                    zona: ronda.zona?.nombre || ronda.zonaNombre || 'N/A',
                    totalEscaneos: Number(ronda.totalEscaneos || 0),
                    fechaInicio: ronda.tiempoInicio || ronda.createdAt || null,
                    fechaFin: ronda.tiempoFin || ronda.updatedAt || null,
                    grupos: []
                });
            }

            const item = rondasMap.get(id);

            const grupoNombre =
                ronda.asignacion?.grupo?.nombre ||
                ronda.grupo?.nombre ||
                ronda.grupoNombre ||
                'SIN GRUPO';

            if (!item.grupos.some((g) => g.nombre === grupoNombre)) {
                item.grupos.push({
                    nombre: grupoNombre,
                    zona: ronda.zona?.nombre || ronda.zonaNombre || 'N/A',
                    totalEscaneos: Number(ronda.totalEscaneos || 0),
                    lider: ronda.lider || ''
                });
            }
        }

        const rondas = Array.from(rondasMap.values()).sort(
            (a, b) =>
                Number(a.numeroRonda || 0) - Number(b.numeroRonda || 0) ||
                Number(a.id || 0) - Number(b.id || 0)
        );

        console.log('Rondas encontradas desde /rondas:', rondas.length);
        return rondas;
    } catch (error) {
        console.error(
            'Error obteniendo rondas desde /rondas:',
            error?.response?.data || error?.message || error
        );
        return [];
    }
}

// Función para obtener escaneos de una ronda específica
async function obtenerEscaneosPorRonda(rondaId) {
    try {
        const response = await api.get('/lecturas/resumen', {
            params: { rondaId }
        });

        const productos = getArrayFromResponse(response);
        const escaneosMap = {};

        productos.forEach((producto) => {
            const sku = normalizarSku(producto.sku);
            if (!sku) return;

            escaneosMap[sku] = getCantidadProducto(producto);
        });

        return escaneosMap;
    } catch (error) {
        console.error(
            `Error obteniendo escaneos de ronda ${rondaId}:`,
            error?.response?.data || error?.message || error
        );
        return {};
    }
}

// Función principal: Exportar todas las rondas de un inventario
export async function exportarTodasLasRondasExcel(inventarioId, dashboardData = null) {
    try {
        console.log('=== EXPORTANDO RONDAS DEL INVENTARIO ===');
        console.log('Inventario ID:', inventarioId);

        if (!inventarioId) {
            throw new Error('inventarioId es requerido para exportar');
        }

        let grupos = [];
        let nombreInventario = `Inventario_${inventarioId}`;

        // El dashboard se usa solo para nombre y resumen por grupo.
        // Las rondas se obtienen desde /rondas porque dashboard supervisor no trae ronda_id.
        let dashboard = dashboardData;

        if (!dashboard) {
            try {
                const dashboardResponse = await api.get('/supervisor/dashboard', {
                    params: { inventarioId }
                });
                dashboard = dashboardResponse.data.data || dashboardResponse.data;
            } catch (error) {
                console.warn(
                    'No se pudo obtener dashboard supervisor. Se continuará con /rondas y /conteo-inicial/resumen.',
                    error?.response?.data || error?.message || error
                );
            }
        }

        if (dashboard) {
            grupos = dashboard.grupos || [];
            nombreInventario =
                dashboard.inventario?.nombre ||
                dashboard.nombreInventario ||
                `Inventario_${inventarioId}`;
        }

        const productosBase = await obtenerProductosBase(inventarioId);

        if (productosBase.length === 0) {
            throw new Error(
                'No hay productos disponibles para exportar. Verifica que exista conteo inicial importado o lecturas registradas.'
            );
        }

        const rondas = await obtenerRondasInventario(inventarioId);

        for (const ronda of rondas) {
            const escaneosMap = await obtenerEscaneosPorRonda(ronda.id);
            ronda.escaneosMap = escaneosMap;
            ronda.totalEscaneados = Object.values(escaneosMap).reduce(
                (sum, val) => sum + Number(val || 0),
                0
            );
            ronda.productosEscaneados = Object.keys(escaneosMap).length;
        }

        console.log('Productos base:', productosBase.length);
        console.log('Rondas encontradas:', rondas.length);
        console.log('Grupos encontrados:', grupos.length);

        const workbook = XLSX.utils.book_new();
        const fechaActual = new Date();
        const fechaStr = fechaActual.toISOString().slice(0, 10);
        const fechaArchivo = fechaActual.toISOString().slice(0, 19).replace(/:/g, '-');
        const mesActual = fechaActual.toLocaleString('es', { month: 'long' });
        const elaboradoPor = getElaboradoPor();

        // ==================== HOJA 1: RESUMEN GENERAL ====================
        const resumenData = [
            ['RESUMEN GENERAL DE RONDAS'],
            [''],
            ['Empresa:', EMPRESA_NOMBRE],
            ['Inventario:', nombreInventario],
            ['Fecha Exportación:', fechaActual.toLocaleString()],
            ['Elaborado Por:', elaboradoPor],
            [''],
            ['ESTADÍSTICAS GENERALES'],
            ['Total Productos en Inventario:', productosBase.length],
            ['Total Rondas:', rondas.length],
            ['Total Grupos Participantes:', grupos.length],
            [
                'Total Unidades Escaneadas General:',
                rondas.reduce((sum, ronda) => sum + Number(ronda.totalEscaneados || 0), 0)
            ],
            [''],
            ['RESUMEN POR RONDA'],
            ['Ronda', 'Tipo', 'Estado', 'Productos Escaneados', 'Unidades Escaneadas', 'Grupos Participantes']
        ];

        rondas.forEach((ronda) => {
            resumenData.push([
                `Ronda ${ronda.numeroRonda || ronda.id}`,
                ronda.tipoRonda === 'reconteo' ? 'Reconteo' : 'Completa',
                ronda.estado,
                ronda.productosEscaneados || 0,
                ronda.totalEscaneados || 0,
                ronda.grupos?.length || 0
            ]);
        });

        const hojaResumen = XLSX.utils.aoa_to_sheet(resumenData);
        hojaResumen['!cols'] = [
            { wch: 34 },
            { wch: 28 },
            { wch: 20 },
            { wch: 22 },
            { wch: 22 },
            { wch: 22 }
        ];
        XLSX.utils.book_append_sheet(workbook, hojaResumen, 'Resumen General');

        // ==================== HOJAS POR RONDA (Formato Melissa) ====================
        for (const ronda of rondas) {
            console.log(`Generando hoja para Ronda ${ronda.numeroRonda || ronda.id}...`);

            const sheetData = [COLUMNAS_EXCEL.map((col) => col.header)];

            let totalUnidadesRonda = 0;
            let valorTotalRonda = 0;
            let productosConEscaneo = 0;

            const productosOrdenados = [...productosBase].sort((a, b) => {
                const escaneoA = Number(ronda.escaneosMap?.[a.sku] || 0);
                const escaneoB = Number(ronda.escaneosMap?.[b.sku] || 0);
                return escaneoB - escaneoA;
            });

            for (const producto of productosOrdenados) {
                const sku = normalizarSku(producto.sku);
                const cantidadEscaneada = Number(ronda.escaneosMap?.[sku] || 0);

                if (cantidadEscaneada <= 0) continue;

                productosConEscaneo++;
                totalUnidadesRonda += cantidadEscaneada;

                const valorUnitario = Number(producto.precioCoste || producto.valorUnitario || 0);
                const subtotal = cantidadEscaneada * valorUnitario;
                valorTotalRonda += subtotal;

                const destino =
                    ronda.grupos?.find((grupo) => Number(grupo.totalEscaneos || 0) > 0)?.nombre ||
                    ronda.grupos?.[0]?.nombre ||
                    'SIN GRUPO';

                sheetData.push(
                    crearFilaMelissa({
                        producto,
                        cantidad: cantidadEscaneada,
                        fechaStr,
                        elaboradoPor,
                        destino,
                        nota: `Ronda ${ronda.numeroRonda || ronda.id} - ${mesActual}`,
                        valorUnitario
                    })
                );
            }

            if (productosConEscaneo === 0) {
                sheetData.push([
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    'No hay productos escaneados en esta ronda',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    ''
                ]);
            }

            sheetData.push([]);
            sheetData.push([
                'RESUMEN RONDA',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                ''
            ]);
            sheetData.push(['Total Productos Escaneados:', productosConEscaneo]);
            sheetData.push(['Total Unidades:', totalUnidadesRonda]);
            sheetData.push(['Valor Total:', valorTotalRonda]);

            const ws = XLSX.utils.aoa_to_sheet(sheetData);
            aplicarAnchosColumnas(ws);

            const nombreHoja = getUniqueSheetName(
                workbook,
                `Ronda_${ronda.numeroRonda || ronda.id}_${ronda.id}`
            );

            XLSX.utils.book_append_sheet(workbook, ws, nombreHoja);
        }

        // ==================== HOJA: PRODUCTOS SIN ESCANEAR ====================
        const todosLosEscaneados = new Set();

        rondas.forEach((ronda) => {
            Object.keys(ronda.escaneosMap || {}).forEach((sku) => {
                if (Number(ronda.escaneosMap[sku] || 0) > 0) {
                    todosLosEscaneados.add(sku);
                }
            });
        });

        const productosNoEscaneados = productosBase.filter(
            (producto) => !todosLosEscaneados.has(normalizarSku(producto.sku))
        );

        if (productosNoEscaneados.length > 0) {
            const noEscaneadosData = [
                ['PRODUCTOS NO ESCANEADOS EN NINGUNA RONDA'],
                [''],
                ['SKU', 'DESCRIPCIÓN', 'CANTIDAD BASE', 'UNIDAD', 'GRUPO/DESTINO', 'VALOR UNITARIO']
            ];

            productosNoEscaneados.forEach((producto) => {
                noEscaneadosData.push([
                    producto.sku || 'N/A',
                    getDescripcionProducto(producto).substring(0, 100),
                    Number(producto.cantidadInicial || producto.cantidad || 0),
                    producto.unidadMedida || 'Und.',
                    producto.grupoNombre || 'SIN GRUPO',
                    Number(producto.precioCoste || producto.valorUnitario || 0)
                ]);
            });

            const wsNoEscaneados = XLSX.utils.aoa_to_sheet(noEscaneadosData);
            wsNoEscaneados['!cols'] = [
                { wch: 15 },
                { wch: 60 },
                { wch: 15 },
                { wch: 15 },
                { wch: 25 },
                { wch: 15 }
            ];
            XLSX.utils.book_append_sheet(workbook, wsNoEscaneados, 'Productos No Escaneados');
        }

        // ==================== HOJA: RESUMEN POR GRUPO ====================
        const gruposData = [
            ['RESUMEN POR GRUPO'],
            [''],
            ['GRUPO', 'ZONA', 'LÍDER', 'ESTADO', 'RONDA ASIGNADA', 'TOTAL ESCANEOS', 'PRODUCTOS', 'ÚLTIMA ACTIVIDAD']
        ];

        grupos.forEach((grupo) => {
            gruposData.push([
                grupo.nombre || 'N/A',
                grupo.zona || grupo.zona_nombre || 'N/A',
                grupo.lider || 'N/A',
                grupo.estado_actividad || 'N/A',
                grupo.numeroRonda || grupo.numero_ronda ? `Ronda ${grupo.numeroRonda || grupo.numero_ronda}` : 'N/A',
                Number(grupo.total_escaneos || grupo.totalEscaneos || 0),
                Number(grupo.productos_distintos || grupo.productosDistintos || 0),
                grupo.ultima_actividad || grupo.ultimaActividad
                    ? new Date(grupo.ultima_actividad || grupo.ultimaActividad).toLocaleString()
                    : 'N/A'
            ]);
        });

        const wsGrupos = XLSX.utils.aoa_to_sheet(gruposData);
        wsGrupos['!cols'] = [
            { wch: 25 },
            { wch: 20 },
            { wch: 20 },
            { wch: 15 },
            { wch: 15 },
            { wch: 15 },
            { wch: 12 },
            { wch: 22 }
        ];
        XLSX.utils.book_append_sheet(workbook, wsGrupos, 'Resumen Grupos');

        // ==================== HOJA: DESTINOS (PARA IMPORTAR A MELISSA) ====================
        const destinosData = [
            ['DESTINOS - PARA IMPORTAR A MELISSA'],
            [''],
            ['SKU', 'DESCRIPCIÓN', 'CANTIDAD TOTAL', 'DESTINO (GRUPO)', 'VALOR UNITARIO', 'SUBTOTAL']
        ];

        const totalesPorSku = new Map();

        rondas.forEach((ronda) => {
            Object.entries(ronda.escaneosMap || {}).forEach(([sku, cantidad]) => {
                const current = Number(totalesPorSku.get(sku) || 0);
                totalesPorSku.set(sku, current + Number(cantidad || 0));
            });
        });

        const totalesArray = Array.from(totalesPorSku.entries())
            .filter(([, cantidad]) => Number(cantidad || 0) > 0)
            .sort((a, b) => Number(b[1]) - Number(a[1]));

        let granTotalUnidades = 0;
        let granTotalValor = 0;

        for (const [sku, cantidad] of totalesArray) {
            const producto = productosBase.find((item) => normalizarSku(item.sku) === normalizarSku(sku));
            const descripcion = getDescripcionProducto(producto);
            const valorUnitario = Number(producto?.precioCoste || producto?.valorUnitario || 0);
            const subtotal = Number(cantidad || 0) * valorUnitario;

            let destino = 'SIN GRUPO';

            for (const ronda of rondas) {
                if (Number(ronda.escaneosMap?.[sku] || 0) > 0) {
                    destino = ronda.grupos?.[0]?.nombre || 'SIN GRUPO';
                    break;
                }
            }

            destinosData.push([
                sku,
                descripcion.substring(0, 100),
                Number(cantidad || 0),
                destino,
                valorUnitario,
                subtotal
            ]);

            granTotalUnidades += Number(cantidad || 0);
            granTotalValor += subtotal;
        }

        destinosData.push([]);
        destinosData.push(['TOTALES GENERALES', '', granTotalUnidades, '', '', granTotalValor]);

        const wsDestinos = XLSX.utils.aoa_to_sheet(destinosData);
        wsDestinos['!cols'] = [
            { wch: 15 },
            { wch: 60 },
            { wch: 15 },
            { wch: 25 },
            { wch: 15 },
            { wch: 15 }
        ];
        XLSX.utils.book_append_sheet(workbook, wsDestinos, 'Destinos Melissa');

        const nombreArchivo = `rondas_${safeFileName(nombreInventario)}_${fechaArchivo}.xlsx`;

        console.log(`✅ Exportación completada: ${nombreArchivo}`);
        return descargarWorkbook(workbook, nombreArchivo);
    } catch (error) {
        console.error('Error exportando todas las rondas:', error);
        throw error;
    }
}

// Función para exportar una ronda específica (mismo formato que Melissa)
export async function exportarRondaExcel(rondaId, tipo = 'completa') {
    try {
        console.log('Exportando ronda:', rondaId);

        if (!rondaId) {
            throw new Error('rondaId es requerido para exportar');
        }

        const resumenResponse = await api.get('/lecturas/resumen', {
            params: { rondaId }
        });

        const productos = getArrayFromResponse(resumenResponse);

        const workbook = XLSX.utils.book_new();
        const fechaActual = new Date();
        const fechaStr = fechaActual.toISOString().slice(0, 10);
        const fechaArchivo = fechaActual.toISOString().slice(0, 19).replace(/:/g, '-');
        const mesActual = fechaActual.toLocaleString('es', { month: 'long' });
        const elaboradoPor = getElaboradoPor();

        const sheetData = [COLUMNAS_EXCEL.map((col) => col.header)];

        let totalUnidades = 0;
        let valorTotal = 0;

        for (const producto of productos) {
            const cantidad = getCantidadProducto(producto);
            const valorUnitario = Number(producto.valorUnitario || producto.precioCoste || 0);
            const subtotal = cantidad * valorUnitario;

            totalUnidades += cantidad;
            valorTotal += subtotal;

            sheetData.push(
                crearFilaMelissa({
                    producto,
                    cantidad,
                    fechaStr,
                    elaboradoPor,
                    destino: producto.grupoNombre || producto.grupo || 'SIN GRUPO',
                    nota: `Ronda ${rondaId} - ${mesActual}`,
                    valorUnitario
                })
            );
        }

        if (productos.length === 0) {
            sheetData.push([
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                'No hay productos escaneados en esta ronda',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                ''
            ]);
        }

        sheetData.push([]);
        sheetData.push([
            'RESUMEN DE LA RONDA',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            ''
        ]);
        sheetData.push(['Total Productos:', productos.length]);
        sheetData.push(['Total Unidades:', totalUnidades]);
        sheetData.push(['Valor Total:', valorTotal]);

        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        aplicarAnchosColumnas(ws);

        XLSX.utils.book_append_sheet(workbook, ws, 'Ronda');

        const nombreArchivo = `ronda_${rondaId}_${safeFileName(tipo)}_${fechaArchivo}.xlsx`;

        console.log(`✅ Exportación de ronda completada: ${nombreArchivo}`);
        return descargarWorkbook(workbook, nombreArchivo);
    } catch (error) {
        console.error('Error exportando ronda:', error);
        throw error;
    }
}

// Función para exportar grupo específico
export async function exportarGrupoExcel(grupoId, inventarioId) {
    try {
        if (!grupoId || !inventarioId) {
            throw new Error('grupoId e inventarioId son requeridos para exportar grupo');
        }

        const grupoResponse = await api.get('/supervisor/grupo-detalle', {
            params: { grupoId, inventarioId }
        });

        const grupoData = grupoResponse.data.data || grupoResponse.data;

        const workbook = XLSX.utils.book_new();
        const fechaActual = new Date();
        const fechaStr = fechaActual.toISOString().slice(0, 10);
        const fechaArchivo = fechaActual.toISOString().slice(0, 19).replace(/:/g, '-');
        const elaboradoPor = getElaboradoPor();

        const sheetData = [COLUMNAS_EXCEL.map((col) => col.header)];

        let totalUnidades = 0;
        const productos = grupoData.productos || [];

        if (productos.length > 0) {
            for (const producto of productos) {
                const cantidad = Number(producto.total || producto.cantidadTotal || producto.cantidad || 0);
                const valorUnitario = Number(producto.valorUnitario || producto.precioCoste || 0);

                totalUnidades += cantidad;

                sheetData.push(
                    crearFilaMelissa({
                        producto: {
                            ...producto,
                            descripcionSnapshot: producto.descripcion || producto.descripcionSnapshot
                        },
                        cantidad,
                        fechaStr,
                        elaboradoPor,
                        destino: grupoData.grupo?.nombre || 'SIN GRUPO',
                        nota: `Grupo ${grupoData.grupo?.nombre || grupoId} - Exportación`,
                        valorUnitario
                    })
                );
            }
        } else {
            sheetData.push([
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                'No hay productos para este grupo',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                ''
            ]);
        }

        sheetData.push([]);
        sheetData.push([
            'RESUMEN DEL GRUPO',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            ''
        ]);
        sheetData.push(['Total Productos:', productos.length]);
        sheetData.push(['Total Unidades:', totalUnidades]);

        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        aplicarAnchosColumnas(ws);

        XLSX.utils.book_append_sheet(workbook, ws, 'Grupo');

        const nombreArchivo = `grupo_${safeFileName(grupoData.grupo?.nombre || grupoId)}_${fechaArchivo}.xlsx`;

        console.log(`✅ Exportación de grupo completada: ${nombreArchivo}`);
        return descargarWorkbook(workbook, nombreArchivo);
    } catch (error) {
        console.error('Error exportando grupo:', error);
        throw error;
    }
}