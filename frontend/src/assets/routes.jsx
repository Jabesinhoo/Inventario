export const routes = {
  login: '/login',
  dashboard: '/dashboard',
  inventory: '/inventory',
  reports: '/reports',
  products: '/products',
  users: '/users',
}

export const roles = {
  counter: 'counter',
  supervisor: 'supervisor',
  admin: 'admin',
}

export const permissions = {
  [roles.counter]: ['dashboard', 'inventory'],
  [roles.supervisor]: ['dashboard', 'inventory', 'reports'],
  [roles.admin]: ['dashboard', 'inventory', 'reports', 'products', 'users'],
}