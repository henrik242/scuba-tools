import { useState, useEffect } from 'react'
import { calculateBlendingSteps, Gas } from './gasBlender'
import './App.css'

const DEFAULT_AVAILABLE_GASES: Gas[] = [
  { name: 'Air', o2: 21, he: 0, editable: false },
  { name: 'O2', o2: 100, he: 0, editable: false },
  { name: 'Helium', o2: 0, he: 100, editable: false },
  { name: 'Nitrox 32', o2: 32, he: 0, editable: true },
  { name: '10/70', o2: 10, he: 70, editable: true },
];

function GasBlender() {
  // Starting gas state
  const [startVolume, setStartVolume] = useState<number>(11);
  const [startO2, setStartO2] = useState<number>(0);
  const [startHe, setStartHe] = useState<number>(0);
  const [startPressure, setStartPressure] = useState<number>(0);

  // Target gas state
  const [targetO2, setTargetO2] = useState<number>(18);
  const [targetHe, setTargetHe] = useState<number>(45);
  const [targetPressure, setTargetPressure] = useState<number>(220);

  // Available gases
  const [availableGases, setAvailableGases] = useState<Gas[]>(DEFAULT_AVAILABLE_GASES);
  const [selectedGases, setSelectedGases] = useState<Record<string, boolean>>({
    'Air': true,
    'O2': true,
    'Helium': true,
    'Nitrox 32': false,
    '10/70': false,
  });

  // Results
  const [blendingSteps, setBlendingSteps] = useState<ReturnType<typeof calculateBlendingSteps> | null>(null);

  // Load state from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.substring(1));

    if (params.has('startVolume')) setStartVolume(parseFloat(params.get('startVolume')!) || 3);
    if (params.has('startO2')) setStartO2(parseFloat(params.get('startO2')!) || 14);
    if (params.has('startHe')) setStartHe(parseFloat(params.get('startHe')!) || 67);
    if (params.has('startPressure')) setStartPressure(parseFloat(params.get('startPressure')!) || 47);
    if (params.has('targetO2')) setTargetO2(parseFloat(params.get('targetO2')!) || 15);
    if (params.has('targetHe')) setTargetHe(parseFloat(params.get('targetHe')!) || 55);
    if (params.has('targetPressure')) setTargetPressure(parseFloat(params.get('targetPressure')!) || 220);
  }, []);

  // Update URL whenever state changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('startVolume', startVolume.toString());
    params.set('startO2', startO2.toString());
    params.set('startHe', startHe.toString());
    params.set('startPressure', startPressure.toString());
    params.set('targetO2', targetO2.toString());
    params.set('targetHe', targetHe.toString());
    params.set('targetPressure', targetPressure.toString());

    window.location.hash = params.toString();
  }, [startVolume, startO2, startHe, startPressure, targetO2, targetHe, targetPressure]);

  const handleCalculate = () => {
    const startingGas = {
      volume: parseFloat(startVolume.toString()),
      o2: parseFloat(startO2.toString()),
      he: parseFloat(startHe.toString()),
      pressure: parseFloat(startPressure.toString()),
    };

    const targetGas = {
      o2: parseFloat(targetO2.toString()),
      he: parseFloat(targetHe.toString()),
      pressure: parseFloat(targetPressure.toString()),
    };

    const selected = availableGases.filter(gas => selectedGases[gas.name]);
    const result = calculateBlendingSteps(startingGas, targetGas, selected);
    setBlendingSteps(result);
  };

  const toggleGas = (gasName: string) => {
    setSelectedGases(prev => ({ ...prev, [gasName]: !prev[gasName] }));
  };

  const updateGas = (index: number, field: 'name' | 'o2' | 'he', value: string | number) => {
    const newGases = [...availableGases];
    if (field === 'name') {
      newGases[index] = { ...newGases[index], name: value as string };
    } else {
      const updatedGas = { ...newGases[index], [field]: parseFloat(value.toString()) };
      // Update the name to match the O2/He values if it's an editable gas
      if (updatedGas.editable) {
        updatedGas.name = `${updatedGas.o2}/${updatedGas.he}`;
      }
      newGases[index] = updatedGas;
    }
    setAvailableGases(newGases);
  };

  const addCustomGas = () => {
    const newGas: Gas = {
      name: `21/0`,
      o2: 21,
      he: 0,
      editable: true
    };
    setAvailableGases([...availableGases, newGas]);
    setSelectedGases({ ...selectedGases, [newGas.name]: true });
  };

  const removeGas = (index: number) => {
    const newGases = availableGases.filter((_, i) => i !== index);
    setAvailableGases(newGases);
  };

  const handleEmpty = () => {
    setStartPressure(0);
    setStartO2(0);
    setStartHe(0);
  };

  return (
    <div className="app">
      <div className="container">
        <h1>
          <img src="/favicon.svg" alt="" style={{ width: '2rem', height: '2rem', verticalAlign: 'middle', marginRight: '0.5rem' }} />
          Gas Blender Tool
        </h1>

        <div className="card">
          <h2>Starting Gas</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Tank Volume (L)</label>
              <input
                type="number"
                value={startVolume}
                onChange={(e) => setStartVolume(parseFloat(e.target.value))}
                step="0.1"
              />
            </div>
            <div className="form-group">
              <label>Pressure (bar)</label>
              <input
                type="number"
                value={startPressure}
                onChange={(e) => setStartPressure(parseFloat(e.target.value))}
                step="1"
              />
            </div>
            <div className="form-group">
              <label>O₂ (%)</label>
              <input
                type="number"
                value={startO2}
                onChange={(e) => setStartO2(parseFloat(e.target.value))}
                min="0"
                max="100"
                step="1"
              />
            </div>
            <div className="form-group">
              <label>He (%)</label>
              <input
                type="number"
                value={startHe}
                onChange={(e) => setStartHe(parseFloat(e.target.value))}
                min="0"
                max="100"
                step="1"
              />
            </div>
          </div>
          <div className="starting-gas-footer">
            <div className="mix-display">
              Current Mix: <strong>{startO2}/{startHe}</strong> at <strong>{startPressure} bar</strong>
            </div>
            <button onClick={handleEmpty} className="empty-btn">
              Reset
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Target Gas</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Target Pressure (bar)</label>
              <input
                type="number"
                value={targetPressure}
                onChange={(e) => setTargetPressure(parseFloat(e.target.value))}
                step="1"
              />
            </div>
            <div className="form-group">
              <label>O₂ (%)</label>
              <input
                type="number"
                value={targetO2}
                onChange={(e) => setTargetO2(parseFloat(e.target.value))}
                min="0"
                max="100"
                step="1"
              />
            </div>
            <div className="form-group">
              <label>He (%)</label>
              <input
                type="number"
                value={targetHe}
                onChange={(e) => setTargetHe(parseFloat(e.target.value))}
                min="0"
                max="100"
                step="1"
              />
            </div>
          </div>
          <div className="mix-display">
            Target Mix: <strong>{targetO2}/{targetHe}</strong> at <strong>{targetPressure} bar</strong>
          </div>
        </div>

        <div className="card">
          <h2>Available Gases</h2>
          <div className="gases-container">
            {availableGases.map((gas, index) => (
              <div key={index} className="gas-item">
                <label className="gas-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedGases[gas.name] || false}
                    onChange={() => toggleGas(gas.name)}
                  />
                </label>
                {gas.editable ? (
                  <div className="gas-inputs">
                    <input
                      type="number"
                      value={gas.o2}
                      onChange={(e) => updateGas(index, 'o2', e.target.value)}
                      className="gas-percent-input"
                      min="0"
                      max="100"
                    />
                    <span>/</span>
                    <input
                      type="number"
                      value={gas.he}
                      onChange={(e) => updateGas(index, 'he', e.target.value)}
                      className="gas-percent-input"
                      min="0"
                      max="100"
                    />
                    <button onClick={() => removeGas(index)} className="remove-gas-btn">✕</button>
                  </div>
                ) : (
                  <span className="gas-label">{gas.name} ({gas.o2}/{gas.he})</span>
                )}
              </div>
            ))}
          </div>
          <button onClick={addCustomGas} className="add-gas-btn">+ Add Custom Gas</button>
        </div>

        <button className="calculate-btn" onClick={handleCalculate}>
          Calculate Blending Steps
        </button>

        {blendingSteps && (
          <div className="card results">
            <h2>Blending Steps</h2>
            {!blendingSteps.success ? (
              <p className="error">{blendingSteps.error}</p>
            ) : blendingSteps.steps.length === 0 ? (
              <p className="no-steps">No blending needed - tank is already at target mix!</p>
            ) : (
              <div className="steps-list">
                {blendingSteps.steps.map((step, index) => (
                  <div key={index} className="step">
                    <div className="step-number">{index + 1}</div>
                    <div className="step-content">
                      <div className="step-action">{step.action}</div>
                      <div className="step-details">
                        <div className="detail-row">
                          <span className="label">Pressure:</span>
                          <span className="value">
                            {step.fromPressure.toFixed(1)} bar → {step.toPressure.toFixed(1)} bar
                            {step.addedPressure && (
                              <span className="added"> (+{step.addedPressure.toFixed(1)} bar)</span>
                            )}
                            {step.drainedPressure && (
                              <span className="drained"> (-{step.drainedPressure.toFixed(1)} bar)</span>
                            )}
                          </span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Mix:</span>
                          <span className="value">
                            {step.currentMix} → <strong>{step.newMix}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="final-result">
              <h3>Final Result</h3>
              <div className="final-mix">
                <div className="final-detail">
                  <span className="label">Mix:</span>
                  <span className="value">{blendingSteps.finalMix.o2}/{blendingSteps.finalMix.he}</span>
                </div>
                <div className="final-detail">
                  <span className="label">Pressure:</span>
                  <span className="value">{blendingSteps.finalMix.pressure} bar</span>
                </div>
              </div>
              {Math.abs(blendingSteps.finalMix.o2 - targetO2) > 1 ||
               Math.abs(blendingSteps.finalMix.he - targetHe) > 1 ? (
                <div className="warning">
                  ⚠️ Final mix differs from target. Adjust available gases or starting conditions.
                </div>
              ) : (
                <div className="success">
                  ✓ Target mix achieved!
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GasBlender
