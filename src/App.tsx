import { useState } from 'react'
import { calculateBlendingSteps, Gas } from './gasBlender'
import './App.css'

const DEFAULT_AVAILABLE_GASES: Gas[] = [
  { name: 'Air', o2: 21, he: 0, editable: false },
  { name: 'Nitrox 32', o2: 32, he: 0, editable: true },
  { name: 'O2', o2: 100, he: 0, editable: false },
  { name: 'Helium', o2: 0, he: 100, editable: false },
  { name: '10/70', o2: 10, he: 70, editable: true },
];

function App() {
  // Starting gas state
  const [startVolume, setStartVolume] = useState<number>(3);
  const [startO2, setStartO2] = useState<number>(14);
  const [startHe, setStartHe] = useState<number>(67);
  const [startPressure, setStartPressure] = useState<number>(47);

  // Target gas state
  const [targetO2, setTargetO2] = useState<number>(15);
  const [targetHe, setTargetHe] = useState<number>(55);
  const [targetPressure, setTargetPressure] = useState<number>(220);

  // Available gases
  const [availableGases, setAvailableGases] = useState<Gas[]>(DEFAULT_AVAILABLE_GASES);
  const [selectedGases, setSelectedGases] = useState<Record<string, boolean>>(
    DEFAULT_AVAILABLE_GASES.reduce((acc, gas) => ({ ...acc, [gas.name]: true }), {})
  );

  // Results
  const [blendingSteps, setBlendingSteps] = useState<ReturnType<typeof calculateBlendingSteps> | null>(null);

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
      newGases[index] = { ...newGases[index], [field]: parseFloat(value.toString()) };
    }
    setAvailableGases(newGases);
  };

  const addCustomGas = () => {
    const newGas: Gas = {
      name: `Custom ${availableGases.length + 1}`,
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
        <h1>⚓ Gas Blender Tool</h1>

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
              <label>Current Pressure (bar)</label>
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
              Empty Tank
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
                      type="text"
                      value={gas.name}
                      onChange={(e) => updateGas(index, 'name', e.target.value)}
                      className="gas-name-input"
                    />
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

export default App
