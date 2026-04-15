import React from 'react'
import Sidebar from '../components/layout/Sidebar'

const MainLayout = ({ children }) => {
  return (
    <div className="main-layout">
      <div className="main-content-wrapper">
        <Sidebar />
        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  )
}

export default MainLayout