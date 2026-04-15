export const rutas = {
  login: '/login',
  dashboard: '/dashboard',
  inventario: '/inventario',
  reportes: '/reportes',
  productos: '/productos',
  usuarios: '/usuarios',
}

export const roles = {
  contador: 'contador',
  supervisor: 'supervisor',
  admin: 'admin',
}

export const permisos = {
  [roles.contador]: ['dashboard', 'inventario'],
  [roles.supervisor]: ['dashboard', 'inventario', 'reportes'],
  [roles.admin]: ['dashboard', 'inventario', 'reportes', 'productos', 'usuarios'],
}