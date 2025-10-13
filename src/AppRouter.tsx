import { useState } from 'react'
import GasBlender from './GasBlender.tsx'
import TankCalculator from './TankCalculator.tsx'
import './App.css'

type Page = 'gas-blender' | 'tank-calculator';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('gas-blender');

  return (
    <div className="app">
      <div className="navigation">
        <button
          className={`nav-btn ${currentPage === 'gas-blender' ? 'active' : ''}`}
          onClick={() => setCurrentPage('gas-blender')}
        >
          Gas Blender
        </button>
        <button
          className={`nav-btn ${currentPage === 'tank-calculator' ? 'active' : ''}`}
          onClick={() => setCurrentPage('tank-calculator')}
        >
          Tank Calculator
        </button>
      </div>

      {currentPage === 'gas-blender' ? <GasBlender /> : <TankCalculator />}
    </div>
  );
}

export default App;
