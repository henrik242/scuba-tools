import { useState, useEffect } from 'react'
import { calculateTankMetric, calculateTankImperial, TankInput, TankResult } from './tankCalculator'
import './App.css'

function TankCalculator() {
  const [liters, setLiters] = useState<number>(0);
  const [bar, setBar] = useState<number>(0);
  const [kg, setKg] = useState<number>(0);
  const [cuft, setCuft] = useState<number>(0);
  const [psi, setPsi] = useState<number>(0);
  const [lbs, setLbs] = useState<number>(0);

  const [isAluminium, setIsAluminium] = useState<boolean>(false);
  const [isSaltWater, setIsSaltWater] = useState<boolean>(true);
  const [hasValve, setHasValve] = useState<boolean>(true);
  const [isDoubles, setIsDoubles] = useState<boolean>(false);

  const [result, setResult] = useState<TankResult | null>(null);
  const [showCalculation, setShowCalculation] = useState<boolean>(false);

  // Load state from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.substring(1));

    // Check if using metric or imperial from URL
    if (params.has('kg') || params.has('liters') || params.has('bar')) {
      if (params.has('kg')) setKg(parseFloat(params.get('kg')!) || 0);
      if (params.has('liters')) setLiters(parseFloat(params.get('liters')!) || 0);
      if (params.has('bar')) setBar(parseFloat(params.get('bar')!) || 0);
    } else if (params.has('lbs') || params.has('cuft') || params.has('psi')) {
      if (params.has('lbs')) setLbs(parseFloat(params.get('lbs')!) || 0);
      if (params.has('cuft')) setCuft(parseFloat(params.get('cuft')!) || 0);
      if (params.has('psi')) setPsi(parseFloat(params.get('psi')!) || 0);
    }

    if (params.has('salt')) setIsSaltWater(params.get('salt') === 'true');
    if (params.has('alu')) setIsAluminium(params.get('alu') === 'true');
    if (params.has('valve')) setHasValve(params.get('valve') === 'true');
    if (params.has('doubles')) setIsDoubles(params.get('doubles') === 'true');
  }, []);

  // Update URL whenever state changes (using metric as primary)
  useEffect(() => {
    if (kg === 0 && liters === 0 && bar === 0) return; // Don't update URL if all zeros

    const params = new URLSearchParams();
    params.set('kg', kg.toString());
    params.set('liters', liters.toString());
    params.set('bar', bar.toString());
    params.set('salt', isSaltWater.toString());
    params.set('alu', isAluminium.toString());
    params.set('valve', hasValve.toString());
    params.set('doubles', isDoubles.toString());

    window.location.hash = params.toString();
  }, [kg, liters, bar, isSaltWater, isAluminium, hasValve, isDoubles]);

  const handleMetricUpdate = (newLiters?: number, newBar?: number, newKg?: number) => {
    const input: TankInput = {
      liters: newLiters ?? liters,
      bar: newBar ?? bar,
      kg: newKg ?? kg,
      cuft: 0,
      psi: 0,
      lbs: 0,
      isAluminium,
      isSaltWater,
      hasValve,
      isDoubles,
    };

    const res = calculateTankMetric(input);
    setResult(res);

    // Update imperial values
    setCuft(res.cuft);
    setPsi(res.psi);
    setLbs(res.lbs);
  };

  const handleImperialUpdate = (newCuft?: number, newPsi?: number, newLbs?: number) => {
    const input: TankInput = {
      liters: 0,
      bar: 0,
      kg: 0,
      cuft: newCuft ?? cuft,
      psi: newPsi ?? psi,
      lbs: newLbs ?? lbs,
      isAluminium,
      isSaltWater,
      hasValve,
      isDoubles,
    };

    const res = calculateTankImperial(input);
    setResult(res);

    // Update metric values
    setLiters(res.liters);
    setBar(res.bar);
    setKg(res.kg);
  };

  const handleOptionsUpdate = () => {
    if (result) {
      // Recalculate with current values (use metric as source)
      handleMetricUpdate();
    }
  };

  const selectPredefinedTank = (value: string) => {
    if (!value) return;

    const [type, ...params] = value.split(';');

    if (type === 'metric') {
      const [l, b, k, alu, doubles] = params;
      setLiters(parseFloat(l));
      setBar(parseFloat(b));
      setKg(parseFloat(k));
      setIsAluminium(alu === '1');
      setIsDoubles(doubles === '1');
      handleMetricUpdate(parseFloat(l), parseFloat(b), parseFloat(k));
    } else if (type === 'imperial') {
      const [cf, p, lb, alu, doubles] = params;
      setCuft(parseFloat(cf));
      setPsi(parseFloat(p));
      setLbs(parseFloat(lb));
      setIsAluminium(alu === '1');
      setIsDoubles(doubles === '1');
      handleImperialUpdate(parseFloat(cf), parseFloat(p), parseFloat(lb));
    }
  };

  return (
    <div className="app">
      <div className="container">
        <h1>⚓ Tank Weight & Buoyancy Calculator</h1>

        <div className="card">
          <h2>Predefined Tanks</h2>
          <select
            className="predefined-select"
            onChange={(e) => selectPredefinedTank(e.target.value)}
            defaultValue=""
          >
            <option value="">Select a tank...</option>
            <optgroup label="Metric - Steel">
              <option value="metric;10;200;12.6;0;0">10L 200 bar (12.6 kg)</option>
              <option value="metric;12;200;14.0;0;0">12L 200 bar (14.0 kg)</option>
              <option value="metric;15;200;16.5;0;0">15L 200 bar (16.5 kg)</option>
              <option value="metric;12;232;14.5;0;0">12L 232 bar (14.5 kg)</option>
              <option value="metric;7;300;10.5;0;0">7L 300 bar (10.5 kg)</option>
              <option value="metric;10;300;14.0;0;0">10L 300 bar (14.0 kg)</option>
            </optgroup>
            <optgroup label="Metric - Aluminium">
              <option value="metric;11.1;207;14.2;1;0">S80 (11.1L 207 bar, 14.2 kg)</option>
              <option value="metric;10.0;207;13.4;1;0">S72 (10.0L 207 bar, 13.4 kg)</option>
            </optgroup>
            <optgroup label="Imperial - Steel">
              <option value="imperial;85;3442;33;0;0">HP85 (85 cuft, 3442 psi, 33 lbs)</option>
              <option value="imperial;100;3442;38;0;0">HP100 (100 cuft, 3442 psi, 38 lbs)</option>
              <option value="imperial;120;3442;43;0;0">HP120 (120 cuft, 3442 psi, 43 lbs)</option>
            </optgroup>
            <optgroup label="Imperial - Aluminium">
              <option value="imperial;80;3000;31.4;1;0">AL80 (80 cuft, 3000 psi, 31.4 lbs)</option>
              <option value="imperial;63;3000;26;1;0">AL63 (63 cuft, 3000 psi, 26 lbs)</option>
            </optgroup>
          </select>
        </div>

        <div className="card">
          <h2>Tank Parameters</h2>

          <div className="tank-table">
            <div className="tank-row header">
              <div>Liters</div>
              <div>Bar</div>
              <div>Weight (kg)</div>
              <div>Buoyancy (kg)</div>
            </div>
            <div className="tank-row">
              <div>
                <input
                  type="number"
                  value={liters || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setLiters(val);
                    handleMetricUpdate(val, bar, kg);
                  }}
                  step="0.1"
                  placeholder="0"
                />
              </div>
              <div>
                <input
                  type="number"
                  value={bar || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setBar(val);
                    handleMetricUpdate(liters, val, kg);
                  }}
                  step="1"
                  placeholder="0"
                />
              </div>
              <div>
                <input
                  type="number"
                  value={kg || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setKg(val);
                    handleMetricUpdate(liters, bar, val);
                  }}
                  step="0.1"
                  placeholder="0"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={result ? `${result.emptyBuoyancyKg}/${result.fullBuoyancyKg}` : '0/0'}
                  readOnly
                  className="readonly-input"
                />
              </div>
            </div>

            <div className="tank-row">
              <div>
                <input
                  type="number"
                  value={cuft || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setCuft(val);
                    handleImperialUpdate(val, psi, lbs);
                  }}
                  step="0.1"
                  placeholder="0"
                />
              </div>
              <div>
                <input
                  type="number"
                  value={psi || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setPsi(val);
                    handleImperialUpdate(cuft, val, lbs);
                  }}
                  step="1"
                  placeholder="0"
                />
              </div>
              <div>
                <input
                  type="number"
                  value={lbs || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setLbs(val);
                    handleImperialUpdate(cuft, psi, val);
                  }}
                  step="0.1"
                  placeholder="0"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={result ? `${result.emptyBuoyancyLbs}/${result.fullBuoyancyLbs}` : '0/0'}
                  readOnly
                  className="readonly-input"
                />
              </div>
            </div>

            <div className="tank-row header">
              <div>Cuft</div>
              <div>PSI</div>
              <div>Weight (lbs)</div>
              <div>Buoyancy (lbs)</div>
            </div>
          </div>

          <div className="tank-options">
            <label className="tank-option">
              <input
                type="checkbox"
                checked={isSaltWater}
                onChange={(e) => {
                  setIsSaltWater(e.target.checked);
                  setTimeout(handleOptionsUpdate, 0);
                }}
              />
              <span>Salt Water</span>
            </label>
            <label className="tank-option">
              <input
                type="checkbox"
                checked={isDoubles}
                onChange={(e) => {
                  setIsDoubles(e.target.checked);
                  setTimeout(handleOptionsUpdate, 0);
                }}
              />
              <span>Doubles</span>
            </label>
            <label className="tank-option">
              <input
                type="checkbox"
                checked={isAluminium}
                onChange={(e) => {
                  setIsAluminium(e.target.checked);
                  setTimeout(handleOptionsUpdate, 0);
                }}
              />
              <span>Aluminium</span>
            </label>
            <label className="tank-option">
              <input
                type="checkbox"
                checked={hasValve}
                onChange={(e) => {
                  setHasValve(e.target.checked);
                  setTimeout(handleOptionsUpdate, 0);
                }}
              />
              <span>Include Valve (0.8 kg)</span>
            </label>
          </div>
        </div>

        {result && (
          <div className="card">
            <div className="calculation-header">
              <h2>Results</h2>
              <button
                onClick={() => setShowCalculation(!showCalculation)}
                className="toggle-calc-btn"
              >
                {showCalculation ? 'Hide Calculation' : 'Show Calculation'}
              </button>
            </div>

            {showCalculation && (
              <div
                className="calculation-details"
                dangerouslySetInnerHTML={{ __html: result.calculation }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TankCalculator;
