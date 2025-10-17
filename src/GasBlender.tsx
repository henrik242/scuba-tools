import { useState, useEffect, useRef } from "react";
import { calculateBlendingSteps, Gas } from "./gasBlender";
import "./App.css";

const DEFAULT_AVAILABLE_GASES: Gas[] = [
  { name: "Air", o2: 21, he: 0, editable: false },
  { name: "O2", o2: 100, he: 0, editable: false },
  { name: "Helium", o2: 0, he: 100, editable: false },
  { name: "Nitrox 32", o2: 32, he: 0, editable: true },
  { name: "10/70", o2: 10, he: 70, editable: true },
];

// Helper function to generate gas name based on O2/He percentages
const generateGasName = (o2: number, he: number): string => {
  if (he === 0 && o2 > 21 && o2 < 41) {
    return `Nitrox ${o2}`;
  }
  return `${o2}/${he}`;
};

// Helper function to find matching default gas
const findDefaultGas = (o2: number, he: number): Gas | undefined => {
  return DEFAULT_AVAILABLE_GASES.find((gas) => gas.o2 === o2 && gas.he === he);
};

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
  const [availableGases, setAvailableGases] = useState<Gas[]>(
    DEFAULT_AVAILABLE_GASES,
  );
  const [selectedGases, setSelectedGases] = useState<Record<string, boolean>>({
    Air: true,
    O2: true,
    Helium: true,
    "Nitrox 32": false,
    "10/70": false,
  });
  const [gasError, setGasError] = useState<string | null>(null);

  const isGasValid = (gas: Gas): boolean =>
    Number.isFinite(gas.o2) &&
    Number.isFinite(gas.he) &&
    gas.o2 >= 0 &&
    gas.he >= 0 &&
    gas.o2 + gas.he <= 100 &&
    (gas.o2 > 0 || gas.he > 0);

  // Results
  const [blendingSteps, setBlendingSteps] = useState<ReturnType<
    typeof calculateBlendingSteps
  > | null>(null);

  // Track initial mount
  const isMounted = useRef(false);

  // Load state from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.substring(1));

    if (params.has("startVolume"))
      setStartVolume(parseFloat(params.get("startVolume")!) || 11);
    if (params.has("startO2"))
      setStartO2(parseFloat(params.get("startO2")!) || 0);
    if (params.has("startHe"))
      setStartHe(parseFloat(params.get("startHe")!) || 0);
    if (params.has("startPressure"))
      setStartPressure(parseFloat(params.get("startPressure")!) || 0);
    if (params.has("targetO2"))
      setTargetO2(parseFloat(params.get("targetO2")!) || 18);
    if (params.has("targetHe"))
      setTargetHe(parseFloat(params.get("targetHe")!) || 45);
    if (params.has("targetPressure"))
      setTargetPressure(parseFloat(params.get("targetPressure")!) || 220);

    // Load available gases from URL
    if (params.has("gases")) {
      const gasesParam = params.get("gases")!;
      const customGasesFromUrl: Gas[] = [];
      const selectedFromUrl: Record<string, boolean> = {};

      // Start with default gases always available
      const allGases = [...DEFAULT_AVAILABLE_GASES];

      // Mark all default gases as unselected initially
      DEFAULT_AVAILABLE_GASES.forEach((gas) => {
        selectedFromUrl[gas.name] = false;
      });

      gasesParam.split("_").forEach((gasStr) => {
        const [o2Str, heStr] = gasStr.split("-");
        const o2 = parseFloat(o2Str);
        const he = parseFloat(heStr);

        if (
          Number.isFinite(o2) &&
          Number.isFinite(he) &&
          o2 >= 0 &&
          he >= 0 &&
          o2 + he <= 100
        ) {
          const defaultGas = findDefaultGas(o2, he);

          if (defaultGas) {
            selectedFromUrl[defaultGas.name] = true;
          } else {
            const name = generateGasName(o2, he);
            const customGas: Gas = { name, o2, he, editable: true };
            customGasesFromUrl.push(customGas);
            selectedFromUrl[name] = true;
          }
        }
      });

      // Combine default gases with custom gases from URL
      const finalGases = [...allGases, ...customGasesFromUrl];
      setAvailableGases(finalGases);
      setSelectedGases(selectedFromUrl);
    }
  }, []);

  // Update URL whenever state changes (but not on initial mount)
  useEffect(() => {
    // Skip the first run (initial mount)
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }

    const params = new URLSearchParams();
    params.set("startVolume", startVolume.toString());
    params.set("startO2", startO2.toString());
    params.set("startHe", startHe.toString());
    params.set("startPressure", startPressure.toString());
    params.set("targetO2", targetO2.toString());
    params.set("targetHe", targetHe.toString());
    params.set("targetPressure", targetPressure.toString());
    // Add only SELECTED gases to the URL
    const selectedGasesOnly = availableGases.filter(
      (gas) => selectedGases[gas.name],
    );
    const gasesParam = selectedGasesOnly
      .map(
        (gas) =>
          `${Number.isFinite(gas.o2) ? gas.o2 : ""}-${Number.isFinite(gas.he) ? gas.he : ""}`,
      )
      .join("_");
    params.set("gases", gasesParam);
    window.location.hash = params.toString();
  }, [
    startVolume,
    startO2,
    startHe,
    startPressure,
    targetO2,
    targetHe,
    targetPressure,
    availableGases,
    selectedGases,
  ]);

  // Remove the handleCalculate function and instead calculate automatically:
  useEffect(() => {
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
    const selected = availableGases.filter(
      (gas) => isGasValid(gas) && selectedGases[gas.name],
    );
    const result = calculateBlendingSteps(startingGas, targetGas, selected);
    setBlendingSteps(result);
  }, [
    startVolume,
    startO2,
    startHe,
    startPressure,
    targetO2,
    targetHe,
    targetPressure,
    availableGases,
    selectedGases,
  ]);

  const toggleGas = (gas: Gas) => {
    if (!isGasValid(gas)) {
      setGasError("Enter valid O₂/He values before selecting this gas.");
      return;
    }

    setSelectedGases((prev) => ({ ...prev, [gas.name]: !prev[gas.name] }));
    setGasError(null);
  };

  const updateGas = (
    index: number,
    field: "name" | "o2" | "he",
    value: string | number,
  ) => {
    setAvailableGases((prevGases) => {
      const gasToUpdate = prevGases[index];
      if (!gasToUpdate) {
        return prevGases;
      }

      const newGases = [...prevGases];
      const previousName = gasToUpdate.name;
      let nextGas: Gas;

      if (field === "name") {
        nextGas = { ...gasToUpdate, name: value as string };
        newGases[index] = nextGas;
        setGasError(null);

        if (previousName !== nextGas.name) {
          setSelectedGases((prevSelected) => {
            const wasSelected = prevSelected[previousName] ?? false;
            const { [previousName]: _removed, ...rest } = prevSelected;
            return { ...rest, [nextGas.name]: wasSelected };
          });
        }

        return newGases;
      }

      const rawValue = typeof value === "string" ? value : value.toString();
      const numericValue =
        rawValue.trim() === "" ? Number.NaN : parseFloat(rawValue);

      nextGas = {
        ...gasToUpdate,
        [field]: numericValue,
      };

      const validMix = isGasValid(nextGas);

      if (validMix) {
        const duplicateExists = prevGases.some(
          (gas, idx) =>
            idx !== index && gas.o2 === nextGas.o2 && gas.he === nextGas.he,
        );

        if (duplicateExists) {
          setGasError(`Gas ${nextGas.o2}/${nextGas.he} already exists.`);
          return prevGases;
        }
      }

      if (nextGas.editable && validMix) {
        nextGas = { ...nextGas, name: generateGasName(nextGas.o2, nextGas.he) };
      }

      newGases[index] = nextGas;
      setGasError(null);

      setSelectedGases((prevSelected) => {
        const updated = { ...prevSelected };
        const oldName = previousName;
        const newName = nextGas.name;
        const wasSelected = updated[oldName] ?? false;

        if (oldName !== newName) {
          delete updated[oldName];
          updated[newName] = validMix ? wasSelected : false;
        } else if (!validMix && wasSelected) {
          updated[oldName] = false;
        } else if (!(newName in updated)) {
          updated[newName] = false;
        }

        return updated;
      });

      return newGases;
    });
  };

  const addCustomGas = () => {
    setAvailableGases((prevGases) => {
      const existingNames = new Set(prevGases.map((gas) => gas.name));
      let suffix = 1;
      let name = "Custom Gas";

      while (existingNames.has(name)) {
        name = `Custom Gas ${suffix}`;
        suffix += 1;
      }

      const newGas: Gas = {
        name,
        o2: Number.NaN,
        he: Number.NaN,
        editable: true,
      };

      setSelectedGases((prevSelected) => ({
        ...prevSelected,
        [newGas.name]: false,
      }));
      setGasError(null);

      return [...prevGases, newGas];
    });
  };

  const removeGas = (index: number) => {
    const gasToRemove = availableGases[index];
    if (!gasToRemove) {
      return;
    }

    const newGases = availableGases.filter((_, i) => i !== index);
    setAvailableGases(newGases);
    setSelectedGases((prev) => {
      const { [gasToRemove.name]: _removed, ...rest } = prev;
      return rest;
    });
    setGasError(null);
  };

  const handleEmpty = () => {
    setStartPressure(0);
    setStartO2(0);
    setStartHe(0);
    setBlendingSteps(null);
  };

  return (
    <div className="app gas-blender-app">
      <div className="container">
        <h1>
          <img
            src="/favicon.svg"
            alt=""
            style={{
              width: "2rem",
              height: "2rem",
              verticalAlign: "middle",
              marginRight: "0.5rem",
            }}
          />
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
              Current Mix:{" "}
              <strong>
                {startO2}/{startHe}
              </strong>{" "}
              at <strong>{startPressure} bar</strong>
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
            Target Mix:{" "}
            <strong>
              {targetO2}/{targetHe}
            </strong>{" "}
            at <strong>{targetPressure} bar</strong>
          </div>
        </div>

        <div className="card">
          <h2>Available Gases</h2>
          <div className="gases-container">
            {availableGases.map((gas, index) => {
              const validGas = isGasValid(gas);

              return (
                <div key={index} className="gas-item">
                  <label className="gas-checkbox">
                    <input
                      type="checkbox"
                      checked={
                        validGas ? selectedGases[gas.name] || false : false
                      }
                      disabled={!validGas}
                      onChange={() => toggleGas(gas)}
                    />
                  </label>
                  {gas.editable ? (
                    <div className="gas-inputs">
                      <input
                        type="number"
                        value={Number.isNaN(gas.o2) ? "" : gas.o2}
                        onChange={(e) => updateGas(index, "o2", e.target.value)}
                        className="gas-percent-input"
                        min="0"
                        max="100"
                      />
                      <span>/</span>
                      <input
                        type="number"
                        value={Number.isNaN(gas.he) ? "" : gas.he}
                        onChange={(e) => updateGas(index, "he", e.target.value)}
                        className="gas-percent-input"
                        min="0"
                        max="100"
                      />
                      <button
                        onClick={() => removeGas(index)}
                        className="remove-gas-btn"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span className="gas-label">
                      {gas.name} ({gas.o2}/{gas.he})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {gasError && <div className="error">{gasError}</div>}
          <button onClick={addCustomGas} className="add-gas-btn">
            + Add Custom Gas
          </button>
        </div>

        {blendingSteps && (
          <div className="card results">
            <h2>Blending Steps</h2>
            {!blendingSteps.success ? (
              <p className="error">{blendingSteps.error}</p>
            ) : blendingSteps.steps.length === 0 ? (
              <p className="no-steps">
                No blending needed - tank is already at target mix!
              </p>
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
                            {step.fromPressure.toFixed(1)} bar →{" "}
                            {step.toPressure.toFixed(1)} bar
                            {step.addedPressure && (
                              <span className="added">
                                {" "}
                                (+{step.addedPressure.toFixed(1)} bar)
                              </span>
                            )}
                            {step.drainedPressure && (
                              <span className="drained">
                                {" "}
                                (-{step.drainedPressure.toFixed(1)} bar)
                              </span>
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
                  <span className="value">
                    {blendingSteps.finalMix.o2}/{blendingSteps.finalMix.he}
                  </span>
                </div>
                <div className="final-detail">
                  <span className="label">Pressure:</span>
                  <span className="value">
                    {blendingSteps.finalMix.pressure} bar
                  </span>
                </div>
              </div>
              {Math.abs(blendingSteps.finalMix.o2 - targetO2) > 0.5 ||
              Math.abs(blendingSteps.finalMix.he - targetHe) > 0.5 ? (
                <div className="warning">
                  ⚠️ Final mix differs from target. Adjust available gases or
                  starting conditions.
                </div>
              ) : (
                <div className="success">✓ Target mix achieved!</div>
              )}
              {blendingSteps.success &&
                Object.keys(blendingSteps.gasUsage).length > 0 && (
                  <div className="gas-usage-summary">
                    <h4>Gas Usage:</h4>
                    <div className="gas-usage-list">
                      {Object.entries(blendingSteps.gasUsage).map(
                        ([gasName, liters]) => (
                          <div key={gasName} className="gas-usage-item">
                            <span>{gasName}:</span>
                            <span>{liters.toFixed(1)} L</span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GasBlender;
