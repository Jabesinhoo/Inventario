import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  GitCompareArrows,
  LayoutGrid,
  ScanLine,
  Users
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { getDashboard } from '../../services/dashboard.service';

function KpiCard({ title, value, icon: Icon, subtitle }) {
  return (
    <div className="card kpi-card">
      <div className="kpi-icon">
        <Icon size={18} />
      </div>
      <div>
        <p className="muted">{title}</p>
        <h3 className="kpi-value">{value}</h3>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [fecha, setFecha] = useState('');
  const [umbral, setUmbral] = useState(5);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadDashboard(params = {}) {
    const result = await getDashboard(params);
    setData(result);
  }

  useEffect(() => {
    loadDashboard().catch(() => setError('No se pudo cargar el dashboard')).finally(() => setLoading(false));
  }, []);

  const handleFilter = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await loadDashboard({
        ...(fecha ? { fecha } : {}),
        umbral
      });
    } catch {
      setError('No se pudo actualizar el dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return <div className="card">Cargando dashboard...</div>;
  }

  if (!data) {
    return <div className="card">{error || 'Sin datos'}</div>;
  }

  const zonePie = data.graficos.distribucionPorZona.map((item, index) => ({
    ...item,
    fill: ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#dc2626'][index % 6]
  }));

  return (
    <div className="grid-stack">
      <div className="card">
        <form className="search-row" onSubmit={handleFilter}>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <input
            type="number"
            min="0"
            value={umbral}
            onChange={(e) => setUmbral(Number(e.target.value))}
            placeholder="Umbral"
          />
          <button className="btn btn-primary" type="submit">
            Filtrar
          </button>
        </form>
      </div>

      <div className="grid-3">
        <KpiCard title="Total de zonas" value={data.resumenGeneral.totalZonas} icon={LayoutGrid} />
        <KpiCard title="Total de grupos" value={data.resumenGeneral.totalGrupos} icon={Users} />
        <KpiCard title="Asignaciones" value={data.resumenGeneral.totalAsignaciones} icon={ClipboardList} />
        <KpiCard title="Escaneos totales" value={data.resumenGeneral.totalEscaneos} icon={ScanLine} />
        <KpiCard title="Conteo 1" value={data.conteos.conteo1} icon={Boxes} />
        <KpiCard title="Conteo 2" value={data.conteos.conteo2} icon={Boxes} />
        <KpiCard title="Diferencia global" value={data.conteos.diferenciaGlobal} icon={GitCompareArrows} />
        <KpiCard title="Precisión" value={`${data.conteos.precisionPorcentaje}%`} icon={CheckCircle2} />
        <KpiCard
          title="Zonas con alerta"
          value={data.alertas.zonasRequierenTercerConteo.length}
          icon={AlertTriangle}
        />
      </div>

      <div className="grid-3">
        <div className="card">
          <h3>Grupo más productivo</h3>
          <p>{data.porGrupo.grupoMasProductivo?.nombre || 'N/D'}</p>
          <p className="muted">
            Escaneos: {data.porGrupo.grupoMasProductivo?.totalEscaneos ?? 0}
          </p>
        </div>

        <div className="card">
          <h3>Grupo menor diferencia</h3>
          <p>{data.porGrupo.grupoMenorDiferencia?.nombre || 'N/D'}</p>
          <p className="muted">
            Diferencia: {data.porGrupo.grupoMenorDiferencia?.diferencia ?? 0}
          </p>
        </div>

        <div className="card">
          <h3>Grupo más rápido</h3>
          <p>{data.porGrupo.grupoMasRapido?.nombre || 'N/D'}</p>
          <p className="muted">
            Seg/Producto: {data.porGrupo.grupoMasRapido?.segundosPorProducto ?? 'N/D'}
          </p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card chart-card">
          <h3><CalendarDays size={16} /> Evolución de escaneos por día</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.graficos.evolucionPorDia}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fecha" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" name="Escaneos" stroke="#2563eb" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart-card">
          <h3><LayoutGrid size={16} /> Distribución por zona</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={zonePie} dataKey="total" nameKey="zona" outerRadius={90} label>
                {zonePie.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card chart-card">
        <h3><GitCompareArrows size={16} /> Conteo 1 vs Conteo 2 por zona</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data.graficos.comparacionPorZona}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="zona" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="conteo1" name="Conteo 1" fill="#2563eb" />
            <Bar dataKey="conteo2" name="Conteo 2" fill="#16a34a" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Estado por zona</h3>
          <div className="table-list">
            {data.porZona.map((item) => (
              <div key={item.id} className="list-row">
                <strong>{item.nombre}</strong>
                <p className="muted">
                  C1: {item.conteo1} | C2: {item.conteo2} | Dif: {item.diferencia} | Estado: {item.estado}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Alertas</h3>
          <p><strong>Zonas con tercer conteo:</strong> {data.alertas.zonasRequierenTercerConteo.length}</p>
          <p><strong>Grupos sin completar:</strong> {data.alertas.gruposSinCompletar.length}</p>
          <p><strong>Fechas sin conteo 2:</strong> {data.alertas.fechasSinConteo2.length}</p>
        </div>
      </div>
    </div>
  );
}