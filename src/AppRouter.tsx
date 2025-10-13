import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import GasBlender from './GasBlender.tsx'
import TankCalculator from './TankCalculator.tsx'
import './App.css'

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const handleNavigation = (path: string) => {
    // Preserve query parameters when switching pages
    navigate(path + location.search);
  };

  return (
    <div className="app">
      <div className="navigation">
        <button
          className={`nav-btn ${currentPath.endsWith('/blender.html') ? 'active' : ''}`}
          onClick={() => handleNavigation('blender.html')}
        >
          Gas Blender
        </button>
        <button
          className={`nav-btn ${currentPath.endsWith('/tanks.html') ? 'active' : ''}`}
          onClick={() => handleNavigation('tanks.html')}
        >
          Tank Calculator
        </button>
      </div>

      <Routes>
        <Route path="blender.html" element={<GasBlender />} />
        <Route path="tanks.html" element={<TankCalculator />} />
        <Route path="*" element={<Navigate to="blender.html" replace />} />
      </Routes>
    </div>
  );
}

function AppRouter() {
  // Auto-detect the base path from index.html location
  const basename = window.location.pathname.replace(/\/[^/]*\.html$/, '') || '/';

  return (
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  );
}

export default AppRouter;
