import { format } from 'date-fns'

export const formatDate = (date, pattern = 'dd/MM/yyyy HH:mm:ss') => {
  if (!date) return '-'
  return format(new Date(date), pattern)
}

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount)
}

export const formatNumber = (number) => {
  return new Intl.NumberFormat('es-MX').format(number)
}

export const truncateText = (text, maxLength = 50) => {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}