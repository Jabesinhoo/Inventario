import React from 'react'

const AuthLayout = ({ children }) => {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        padding: '2rem',
        width: '100%',
        maxWidth: '450px',
        transition: 'background 0.3s ease'
      }}>
        {children}
      </div>
    </div>
  )
}

export default AuthLayout