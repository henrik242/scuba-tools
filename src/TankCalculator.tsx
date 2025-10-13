import { useState, useEffect } from 'react'
import { calculateTankMetric, calculateTankImperial, TankInput, TankResult } from './tankCalculator'
import './App.css'

function TankCalculator() {
  const [liters, setLiters] = useState<number>(12);
  const [bar, setBar] = useState<number>(232);
  const [kg, setKg] = useState<number>(14.5);
  const [cuft, setCuft] = useState<number>(0);
  const [psi, setPsi] = useState<number>(0);
  const [lbs, setLbs] = useState<number>(0);

  const [isAluminium, setIsAluminium] = useState<boolean>(false);
  const [isSaltWater, setIsSaltWater] = useState<boolean>(true);
  const [hasValve, setHasValve] = useState<boolean>(true);
  const [isDoubles, setIsDoubles] = useState<boolean>(true);

  const [result, setResult] = useState<TankResult | null>(null);
  const [showCalculation, setShowCalculation] = useState<boolean>(false);
  const [selectedTank, setSelectedTank] = useState<string>("metric;12;232;14.5;0;1");

  // Load state from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.substring(1));

    // Check if using metric or imperial from URL
    if (params.has('kg') || params.has('liters') || params.has('bar')) {
      const loadedKg = parseFloat(params.get('kg')!) || 0;
      const loadedLiters = parseFloat(params.get('liters')!) || 0;
      const loadedBar = parseFloat(params.get('bar')!) || 0;
      const loadedSalt = params.get('salt') === 'true';
      const loadedAlu = params.get('alu') === 'true';
      const loadedValve = params.get('valve') === 'true';
      const loadedDoubles = params.get('doubles') === 'true';

      setKg(loadedKg);
      setLiters(loadedLiters);
      setBar(loadedBar);
      setIsSaltWater(loadedSalt);
      setIsAluminium(loadedAlu);
      setHasValve(loadedValve);
      setIsDoubles(loadedDoubles);

      // Perform initial calculation if we have values
      if (loadedKg > 0 && loadedLiters > 0 && loadedBar > 0) {
        const input: TankInput = {
          liters: loadedLiters,
          bar: loadedBar,
          kg: loadedKg,
          cuft: 0,
          psi: 0,
          lbs: 0,
          isAluminium: loadedAlu,
          isSaltWater: loadedSalt,
          hasValve: loadedValve,
          isDoubles: loadedDoubles,
        };
        const res = calculateTankMetric(input);
        setResult(res);
        setCuft(res.cuft);
        setPsi(res.psi);
        setLbs(res.lbs);
      }

      // Check if the loaded values match the default tank, otherwise clear selection
      if (loadedLiters === 12 && loadedBar === 232 && loadedKg === 14.5 && !loadedAlu && loadedDoubles) {
        // Keep the default selection
      } else {
        setSelectedTank(""); // Clear selection when loading different values from URL
      }
    } else if (params.has('lbs') || params.has('cuft') || params.has('psi')) {
      const loadedLbs = parseFloat(params.get('lbs')!) || 0;
      const loadedCuft = parseFloat(params.get('cuft')!) || 0;
      const loadedPsi = parseFloat(params.get('psi')!) || 0;
      const loadedSalt = params.get('salt') === 'true';
      const loadedAlu = params.get('alu') === 'true';
      const loadedValve = params.get('valve') === 'true';
      const loadedDoubles = params.get('doubles') === 'true';

      setLbs(loadedLbs);
      setCuft(loadedCuft);
      setPsi(loadedPsi);
      setIsSaltWater(loadedSalt);
      setIsAluminium(loadedAlu);
      setHasValve(loadedValve);
      setIsDoubles(loadedDoubles);

      // Perform initial calculation if we have values
      if (loadedLbs > 0 && loadedCuft > 0 && loadedPsi > 0) {
        const input: TankInput = {
          liters: 0,
          bar: 0,
          kg: 0,
          cuft: loadedCuft,
          psi: loadedPsi,
          lbs: loadedLbs,
          isAluminium: loadedAlu,
          isSaltWater: loadedSalt,
          hasValve: loadedValve,
          isDoubles: loadedDoubles,
        };
        const res = calculateTankImperial(input);
        setResult(res);
        setLiters(res.liters);
        setBar(res.bar);
        setKg(res.kg);
      }

      setSelectedTank(""); // Clear selection when loading from URL
    } else {
      // No URL params, perform initial calculation with default Twin 12L 232 bar
      const input: TankInput = {
        liters: 12,
        bar: 232,
        kg: 14.5,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: false,
        isSaltWater: true,
        hasValve: true,
        isDoubles: true,
      };
      const res = calculateTankMetric(input);
      setResult(res);
      setCuft(res.cuft);
      setPsi(res.psi);
      setLbs(res.lbs);
      // Keep selectedTank as "metric;12;232;14.5;0;1" (default state)
    }
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

  // Recalculate when options change
  useEffect(() => {
    if (kg > 0 && liters > 0 && bar > 0) {
      const input: TankInput = {
        liters,
        bar,
        kg,
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
      
      // Don't update kg - it causes the weight to keep increasing when toggling checkboxes
      // The calculation internally handles doubles/valve adjustments
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAluminium, isSaltWater, hasValve, isDoubles]);

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


  const selectPredefinedTank = (value: string) => {
    if (!value) return;

    setSelectedTank(value); // Update selected tank state

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
        <h1>
          <img src="/favicon.svg" alt="" style={{ width: '2rem', height: '2rem', verticalAlign: 'middle', marginRight: '0.5rem' }} />
          Tank Weight & Buoyancy Calculator
        </h1>

        <div className="card">
          <h2>Predefined Tanks</h2>
          <select
            className="predefined-select"
            onChange={(e) => selectPredefinedTank(e.target.value)}
            value={selectedTank}
          >
            <option value="">Select a tank...</option>
            <optgroup label="Metric - Steel">
              <option value="metric;10;200;12.6;0;0">10L 200 bar (12.6 kg)</option>
              <option value="metric;12;200;14.0;0;0">12L 200 bar (14.0 kg)</option>
              <option value="metric;15;200;16.5;0;0">15L 200 bar (16.5 kg)</option>
              <option value="metric;18;200;19.8;0;0">18L 200 bar (19.8 kg)</option>
              <option value="metric;12;232;14.5;0;0">12L 232 bar (14.5 kg)</option>
              <option value="metric;7;300;10.5;0;0">7L 300 bar (10.5 kg)</option>
              <option value="metric;10;300;14.0;0;0">10L 300 bar (14.0 kg)</option>
              <option value="metric;12;200;14.0;0;1">Twin 12L 200 bar (14.0 kg per tank)</option>
              <option value="metric;12;232;14.5;0;1">Twin 12L 232 bar (14.5 kg per tank)</option>
            </optgroup>
            <optgroup label="Metric - Aluminium">
              <option value="metric;11.1;207;14.2;1;0">S80 (11.1L 207 bar, 14.2 kg)</option>
              <option value="metric;10.0;207;13.4;1;0">S72 (10.0L 207 bar, 13.4 kg)</option>
            </optgroup>
            <optgroup label="Metric - Stage/Pony">
              <option value="metric;3;200;3.8;0;0">3L 200 bar Pony (3.8 kg)</option>
              <option value="metric;5;200;5.5;0;0">5L 200 bar Stage (5.5 kg)</option>
              <option value="metric;7;200;7.5;0;0">7L 200 bar Stage (7.5 kg)</option>
            </optgroup>
            <optgroup label="Imperial - Steel">
              <option value="imperial;80;3500;28.5;0;0">HP80 (80 cuft, 3500 psi, 28.5 lbs)</option>
              <option value="imperial;85;3442;33;0;0">HP85 (85 cuft, 3442 psi, 33 lbs)</option>
              <option value="imperial;100;3442;38;0;0">HP100 (100 cuft, 3442 psi, 38 lbs)</option>
              <option value="imperial;117;3442;44;0;0">HP117 (117 cuft, 3442 psi, 44 lbs)</option>
              <option value="imperial;120;3442;43;0;0">HP120 (120 cuft, 3442 psi, 43 lbs)</option>
            </optgroup>
            <optgroup label="Imperial - Aluminium">
              <option value="imperial;63;3000;26;1;0">AL63 (63 cuft, 3000 psi, 26 lbs)</option>
              <option value="imperial;80;3000;31.4;1;0">AL80 (80 cuft, 3000 psi, 31.4 lbs)</option>
              <option value="imperial;100;3300;39;1;0">AL100 (100 cuft, 3300 psi, 39 lbs)</option>
            </optgroup>
            <optgroup label="Imperial - Stage/Pony">
              <option value="imperial;19;3000;11;1;0">AL19 Pony (19 cuft, 3000 psi, 11 lbs)</option>
              <option value="imperial;30;3000;14.5;1;0">AL30 Stage (30 cuft, 3000 psi, 14.5 lbs)</option>
              <option value="imperial;40;3000;17;1;0">AL40 Stage (40 cuft, 3000 psi, 17 lbs)</option>
            </optgroup>
          </select>
        </div>

        <div className="card">
          <h2>Tank Parameters</h2>

          <div className="tank-table">
            <div className="tank-row header">
              <div>Liters</div>
              <div>Bar</div>
              <div>Weight per tank (kg)</div>
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
                    setSelectedTank(""); // Reset dropdown on manual edit
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
                    setSelectedTank(""); // Reset dropdown on manual edit
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
                    setSelectedTank(""); // Reset dropdown on manual edit
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
                    setSelectedTank(""); // Reset dropdown on manual edit
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
                    setSelectedTank(""); // Reset dropdown on manual edit
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
                    setSelectedTank(""); // Reset dropdown on manual edit
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
              <div>Weight per tank (lbs)</div>
              <div>Buoyancy (lbs)</div>
            </div>
          </div>

          <div className="tank-options">
            <label className="tank-option">
              <input
                type="checkbox"
                checked={isSaltWater}
                onChange={(e) => setIsSaltWater(e.target.checked)}
              />
              <span>Salt Water</span>
            </label>
            <label className="tank-option">
              <input
                type="checkbox"
                checked={isDoubles}
                onChange={(e) => setIsDoubles(e.target.checked)}
              />
              <span>Doubles</span>
            </label>
            <label className="tank-option">
              <input
                type="checkbox"
                checked={isAluminium}
                onChange={(e) => setIsAluminium(e.target.checked)}
              />
              <span>Aluminium</span>
            </label>
            <label className="tank-option">
              <input
                type="checkbox"
                checked={hasValve}
                onChange={(e) => setHasValve(e.target.checked)}
              />
              <span>Include Valve (0.8 kg)</span>
            </label>
          </div>
        </div>

        {result && (
          <div className="card">
            <div className="calculation-header">
              <h2>Calculation</h2>
              <button
                onClick={() => setShowCalculation(!showCalculation)}
                className="toggle-calc-btn"
              >
                {showCalculation ? 'Hide' : 'Show'}
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
