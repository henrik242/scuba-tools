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

  // Determine which page we're on and what the other tool is
  const isOnBlender = currentPath.endsWith('/blender.html');
  const otherTool = isOnBlender ? 'tanks.html' : 'blender.html';
  const otherToolName = isOnBlender ? 'Tank Calculator' : 'Gas Blender';

  return (
    <div className="app">
      <div className="page-switcher">
        <a
          onClick={() => handleNavigation(otherTool)}
          className="page-link"
        >
          ← {otherToolName}
        </a>
      </div>

      {/* Wrap routes in a flex child to fill space */}
      <div style={{ flex: 1 }}>
        <Routes>
          <Route path="blender.html" element={<GasBlender />} />
          <Route path="tanks.html" element={<TankCalculator />} />
          <Route path="*" element={<Navigate to="blender.html" replace />} />
        </Routes>
      </div>

      <footer className="footer">
        <div className="footer-content">
          <p>
            <a
              href="https://github.com/henrik242/scuba-tools"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
            >
              View on GitHub
            </a>
          </p>
          <p className="footer-license">
            Licensed under <a
            href="https://www.gnu.org/licenses/gpl-3.0.en.html"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            GPLv3
          </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function AppRouter() {
  // Auto-detect the base path from the current URL
  // Extract everything before the last .html file
  const pathname = window.location.pathname;
  const basename = pathname.substring(0, pathname.lastIndexOf('/') + 1) || '/';

  return (
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  );
}

export default AppRouter;
