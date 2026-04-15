import React from 'react'
import * as LucideIcons from 'lucide-react'

const Icon = ({ name, size = 20, color = 'currentColor', className = '' }) => {
  const LucideIcon = LucideIcons[name]
  
  if (!LucideIcon) {
    return null
  }
  
  return <LucideIcon size={size} color={color} className={className} />
}

export default Icon