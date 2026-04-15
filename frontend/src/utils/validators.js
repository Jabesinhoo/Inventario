export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

export const validatePassword = (password) => {
  return password && password.length >= 8
}

export const validateBarcode = (barcode) => {
  return barcode && barcode.trim().length > 0
}

export const validateProduct = (product) => {
  const errors = {}
  if (!product.barcode) errors.barcode = 'Barcode is required'
  if (!product.name) errors.name = 'Product name is required'
  return errors
}