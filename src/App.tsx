import { useState, useRef } from 'react';
import { parsePastedText, parseRawPoints, Point } from './utils/parser';
import { matchEndTimes, aucInWindow, clipCurveToInterval } from './utils/auc';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface AUCResult {
  label: string;
  idifAUC: number;
  realAUC: number;
  biasPercent: number | string;
}

function App() {
  const [realPoints, setRealPoints] = useState<Point[]>([]);
  const [combinedPoints, setCombinedPoints] = useState<Point[]>([]);
  const [timeCutoffs, setTimeCutoffs] = useState([5, 10]);
  const [results, setResults] = useState<AUCResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [tEndCommon, setTEndCommon] = useState<number | null>(null);
  const [decimalPlaces, setDecimalPlaces] = useState(4);
  const [matchedCurves, setMatchedCurves] = useState<{ real: Point[]; combined: Point[] } | null>(null);
  const [xTickInterval, setXTickInterval] = useState<{ [key: string]: number | null }>({
    '0-5': null,
    '0-10': null,
    '10-end': null,
    'combined': null,
  });
  const [yTickInterval, setYTickInterval] = useState<number | null>(null);
  const realPasteRef = useRef<HTMLDivElement>(null);
  const combinedPasteRef = useRef<HTMLDivElement>(null);

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>, setPoints: (points: Point[]) => void, pasteAreaRef: React.RefObject<HTMLDivElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const points = parseRawPoints(pastedText);
    setPoints(points);
    // Clear the paste area after successful parse
    if (pasteAreaRef.current) {
      pasteAreaRef.current.textContent = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, setPoints: (points: Point[]) => void) => {
    // Handle Ctrl+V or Cmd+V
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      // The paste event will handle it
      return;
    }
    // Clear on Delete or Backspace when focused and empty
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.currentTarget.textContent === '') {
      setPoints([]);
    }
  };

  const handleCellEdit = (
    index: number,
    field: 'time' | 'activity',
    value: string,
    points: Point[],
    setPoints: (points: Point[]) => void
  ) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) || value === '') {
      const newPoints = [...points];
      if (index < newPoints.length) {
        newPoints[index] = { ...newPoints[index], [field]: isNaN(numValue) ? 0 : numValue };
        // Sort by time after edit (but preserve the edited row's position if possible)
        if (field === 'time') {
          newPoints.sort((a, b) => a.time - b.time);
        }
        setPoints(newPoints);
      }
    }
  };

  const handleAddRow = (points: Point[], setPoints: (points: Point[]) => void) => {
    const lastTime = points.length > 0 ? points[points.length - 1].time : 0;
    const newPoint: Point = { time: lastTime + 5, activity: 0 };
    setPoints([...points, newPoint].sort((a, b) => a.time - b.time));
  };

  const handleDeleteRow = (index: number, points: Point[], setPoints: (points: Point[]) => void) => {
    if (points.length > 1) {
      const newPoints = [...points];
      newPoints.splice(index, 1);
      setPoints(newPoints);
    }
  };

  const handleCompute = () => {
    setError(null);
    setWarnings([]);
    setResults([]);
    setTEndCommon(null);

    try {
      // Convert points back to text format for parsing (with validation)
      const realText = realPoints.map(p => `${p.time}\t${p.activity}`).join('\n');
      const combinedText = combinedPoints.map(p => `${p.time}\t${p.activity}`).join('\n');
      
      // Parse input with validation
      const parsed = parsePastedText(realText, combinedText);
      setWarnings(parsed.warnings);

      // Match end times
      const matched = matchEndTimes(parsed.realPoints, parsed.combinedPoints);
      setTEndCommon(matched.tEndCommon);
      setMatchedCurves({
        real: matched.realMatched,
        combined: matched.combinedMatched
      });

      // Validate t_end_common > 10 for 10-end computation
      if (matched.tEndCommon <= 10) {
        throw new Error(`Common end time (${matched.tEndCommon}) must be > 10 for 10-end computation`);
      }

      const cutoff5 = timeCutoffs[0];
      const cutoff10 = timeCutoffs[1];

      // Compute results
      const newResults: AUCResult[] = [];

      // 1. Combined (total AUC)
      const idifTotal = aucInWindow(matched.combinedMatched, 0, matched.tEndCommon);
      const realTotal = aucInWindow(matched.realMatched, 0, matched.tEndCommon);
      const biasTotal = realTotal !== 0 ? ((idifTotal - realTotal) / realTotal) * 100 : '-';
      newResults.push({
        label: 'Combined',
        idifAUC: idifTotal,
        realAUC: realTotal,
        biasPercent: biasTotal
      });

      // 2. 0-5 min
      const idif05 = aucInWindow(matched.combinedMatched, 0, cutoff5);
      const real05 = aucInWindow(matched.realMatched, 0, cutoff5);
      const bias05 = real05 !== 0 ? ((idif05 - real05) / real05) * 100 : '-';
      newResults.push({
        label: '0-5 min',
        idifAUC: idif05,
        realAUC: real05,
        biasPercent: bias05
      });

      // 3. 0-10 min
      const idif010 = aucInWindow(matched.combinedMatched, 0, cutoff10);
      const real010 = aucInWindow(matched.realMatched, 0, cutoff10);
      const bias010 = real010 !== 0 ? ((idif010 - real010) / real010) * 100 : '-';
      newResults.push({
        label: '0-10 min',
        idifAUC: idif010,
        realAUC: real010,
        biasPercent: bias010
      });

      // 4. 10-end
      const idif10End = aucInWindow(matched.combinedMatched, cutoff10, matched.tEndCommon);
      const real10End = aucInWindow(matched.realMatched, cutoff10, matched.tEndCommon);
      const bias10End = real10End !== 0 ? ((idif10End - real10End) / real10End) * 100 : '-';
      newResults.push({
        label: '10-end',
        idifAUC: idif10End,
        realAUC: real10End,
        biasPercent: bias10End
      });

      setResults(newResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    }
  };

  const copyTableToClipboard = () => {
    const lines = results.map(r => {
      const idif = typeof r.biasPercent === 'number' 
        ? r.idifAUC.toFixed(9) 
        : r.idifAUC.toFixed(9);
      const real = r.realAUC.toFixed(9);
      const bias = typeof r.biasPercent === 'number' 
        ? r.biasPercent.toFixed(9) 
        : '-';
      return `${r.label}\t${idif}\t${real}\t${bias}`;
    });
    const tsv = lines.join('\n');
    navigator.clipboard.writeText(tsv);
    alert('Table copied to clipboard as TSV!');
  };

  const formatNumber = (num: number): string => {
    return num.toFixed(decimalPlaces);
  };

  const formatBias = (bias: number | string): string => {
    if (typeof bias === 'number') {
      return bias.toFixed(9);
    }
    return '-';
  };

  const createChartData = (realCurve: Point[], combinedCurve: Point[], startTime: number, endTime: number) => {
    if (!realCurve || !combinedCurve || realCurve.length === 0 || combinedCurve.length === 0) {
      return null;
    }

    // Clip curves to the window
    const realClipped = clipCurveToInterval(realCurve, startTime, endTime);
    const combinedClipped = clipCurveToInterval(combinedCurve, startTime, endTime);

    // Use actual points from each curve - Chart.js will handle the x-axis
    // Format: { x: time, y: activity } for each point
    const realData = realClipped.map(p => ({ x: p.time, y: p.activity }));
    const combinedData = combinedClipped.map(p => ({ x: p.time, y: p.activity }));

    return {
      datasets: [
        {
          label: 'Real',
          data: realData,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          fill: true,
          tension: 0.1,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: 'Combined (IDIF)',
          data: combinedData,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          fill: true,
          tension: 0.1,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
      // Store clipped data for scale calculation
      realClipped,
      combinedClipped,
      startTime,
      endTime,
    };
  };

  // Helper function to calculate nice tick interval
  const calculateNiceTickInterval = (range: number, targetTicks: number = 5): number => {
    if (range === 0) return 1;
    const rawInterval = range / targetTicks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
    const normalized = rawInterval / magnitude;
    
    let niceInterval;
    if (normalized <= 1) niceInterval = 1;
    else if (normalized <= 2) niceInterval = 2;
    else if (normalized <= 5) niceInterval = 5;
    else niceInterval = 10;
    
    return niceInterval * magnitude;
  };

  // Helper function to calculate nice min/max with padding
  const calculateNiceRange = (min: number, max: number, paddingPercent: number = 0.25): { min: number, max: number } => {
    if (min === max) {
      // Handle edge case where all values are the same
      const padding = Math.max(1, Math.abs(min) * paddingPercent);
      return { min: min - padding, max: max + padding };
    }

    const range = max - min;
    const padding = range * paddingPercent;
    
    // Calculate magnitude for rounding
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(max))));
    
    // Round to nice values based on magnitude
    // For example: if max is 4000, magnitude is 1000, we want to round to 5000
    let roundStep;
    if (magnitude >= 1000) {
      roundStep = magnitude / 10; // For 4000, roundStep = 100, so we can round to 5000
    } else if (magnitude >= 100) {
      roundStep = magnitude / 10; // For 400, roundStep = 10, so we can round to 500
    } else if (magnitude >= 10) {
      roundStep = magnitude / 10; // For 40, roundStep = 1, so we can round to 50
    } else {
      roundStep = 1;
    }
    
    const niceMin = Math.floor((min - padding) / roundStep) * roundStep;
    const niceMax = Math.ceil((max + padding) / roundStep) * roundStep;
    
    return { min: niceMin, max: niceMax };
  };

  const createChartOptions = (chartData: any, chartType: string) => {
    if (!chartData) {
      return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' as const },
          title: { display: false },
        },
        scales: {
          x: { title: { display: true, text: 'Time (min)' } },
          y: { title: { display: true, text: 'Activity (Bq/ml)' } },
        },
      };
    }

    // Calculate min/max for x-axis (time)
    const xMin = chartData.startTime;
    const xMax = chartData.endTime;
    const xRange = xMax - xMin;
    const xPadding = xRange * 0.05; // 5% padding

    // Automatically calculate x-axis tick interval based on range
    const autoXTick = calculateNiceTickInterval(xRange, 5);
    // Use custom tick if set, otherwise use auto-calculated
    const xTick = (xTickInterval[chartType] !== null && xTickInterval[chartType] !== undefined) 
      ? xTickInterval[chartType]! 
      : autoXTick;

    // Calculate min/max for y-axis (activity)
    const allActivities = [
      ...chartData.realClipped.map((p: Point) => p.activity),
      ...chartData.combinedClipped.map((p: Point) => p.activity),
    ].filter((val: number | null) => val !== null) as number[];

    const yDataMin = Math.min(...allActivities);
    const yDataMax = Math.max(...allActivities);
    
    // Calculate nice range with padding (about 20-25% padding)
    // If data doesn't go negative, ensure we show 0 or close to it
    const yMinForRange = yDataMin < 0 ? yDataMin : Math.min(0, yDataMin);
    const paddingPercent = 0.2; // 20% padding
    const { min: yMin, max: yMax } = calculateNiceRange(yMinForRange, yDataMax, paddingPercent);
    
    // Ensure we show 0 if data is all positive
    const finalYMin = yDataMin >= 0 ? Math.max(0, yMin) : yMin;
    
    const yRange = yMax - finalYMin;
    
    // Automatically calculate y-axis tick interval based on range
    const autoYTick = calculateNiceTickInterval(yRange, 5);
    // Use custom tick if set, otherwise use auto-calculated
    const finalYTick = (yTickInterval !== null && yTickInterval !== undefined) 
      ? yTickInterval 
      : autoYTick;
    
    // Round to nice values based on tick interval
    const yMinRounded = Math.floor(finalYMin / finalYTick) * finalYTick;
    const yMaxRounded = Math.ceil(yMax / finalYTick) * finalYTick;

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        title: {
          display: false,
        },
      },
      scales: {
        x: {
          type: 'linear' as const,
          min: Math.max(0, xMin - xPadding),
          max: xMax + xPadding,
          ticks: {
            stepSize: xTick,
          },
          title: {
            display: true,
            text: 'Time (min)',
          },
        },
        y: {
          min: yMinRounded,
          max: yMaxRounded,
          ticks: {
            stepSize: finalYTick,
          },
          title: {
            display: true,
            text: 'Activity (Bq/ml)',
          },
        },
      },
    };
  };

  return (
    <div className="container">
      <h1>IDIF AUC Calculator</h1>
      
      <div className="input-section">
        <div className="input-group-grid">
          <div className="input-group">
            <label>Paste Real curve (Time, Activity)</label>
            <div className="pasteable-table-container">
              <div
                ref={realPasteRef}
                className="paste-area"
                contentEditable
                onPaste={(e) => handlePaste(e, setRealPoints, realPasteRef)}
                onKeyDown={(e) => handleKeyDown(e, setRealPoints)}
                suppressContentEditableWarning={true}
                data-placeholder="Click here and paste your Real curve data (Time [tab/space] Activity)"
              />
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Activity</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {realPoints.length === 0 ? (
                      <>
                        <tr className="placeholder-row">
                          <td><input type="number" step="0.1" defaultValue="0.0" className="editable-cell" onBlur={(e) => {
                            const val = e.target.value;
                            if (val && !isNaN(parseFloat(val))) {
                              setRealPoints([{ time: parseFloat(val) || 0, activity: 0 }]);
                            }
                          }} /></td>
                          <td><input type="number" step="0.1" defaultValue="0.0" className="editable-cell" onBlur={(e) => {
                            const val = e.target.value;
                            if (val && !isNaN(parseFloat(val))) {
                              setRealPoints([{ time: 0, activity: parseFloat(val) || 0 }]);
                            }
                          }} /></td>
                          <td className="action-cell">
                            <button className="add-row-btn" onClick={() => handleAddRow(realPoints, setRealPoints)} title="Add row">+</button>
                          </td>
                        </tr>
                        {[5, 10, 15, 20].map((t) => (
                          <tr key={t} className="placeholder-row">
                            <td><input type="number" step="0.1" defaultValue={t} className="editable-cell" disabled /></td>
                            <td><input type="number" step="0.1" defaultValue="0.0" className="editable-cell" disabled /></td>
                            <td className="action-cell"></td>
                          </tr>
                        ))}
                      </>
                    ) : (
                      <>
                        {realPoints.map((point, i) => (
                          <tr key={i}>
                            <td>
                              <input
                                type="number"
                                step="0.1"
                                value={point.time}
                                className="editable-cell"
                                onChange={(e) => handleCellEdit(i, 'time', e.target.value, realPoints, setRealPoints)}
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val)) {
                                    handleCellEdit(i, 'time', e.target.value, realPoints, setRealPoints);
                                  }
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.1"
                                value={point.activity}
                                className="editable-cell"
                                onChange={(e) => handleCellEdit(i, 'activity', e.target.value, realPoints, setRealPoints)}
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val)) {
                                    handleCellEdit(i, 'activity', e.target.value, realPoints, setRealPoints);
                                  }
                                }}
                              />
                            </td>
                            <td className="action-cell">
                              <button className="delete-row-btn" onClick={() => handleDeleteRow(i, realPoints, setRealPoints)} title="Delete row">×</button>
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={3} className="add-row-cell">
                            <button className="add-row-btn" onClick={() => handleAddRow(realPoints, setRealPoints)}>+ Add Row</button>
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="input-group">
            <label>Paste Combined curve (Time[min], Activity[Bq/ml])</label>
            <div className="pasteable-table-container">
              <div
                ref={combinedPasteRef}
                className="paste-area"
                contentEditable
                onPaste={(e) => handlePaste(e, setCombinedPoints, combinedPasteRef)}
                onKeyDown={(e) => handleKeyDown(e, setCombinedPoints)}
                suppressContentEditableWarning={true}
                data-placeholder="Click here and paste your Combined curve data (Time [tab/space] Activity)"
              />
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time (min)</th>
                      <th>Activity (Bq/ml)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinedPoints.length === 0 ? (
                      <>
                        <tr className="placeholder-row">
                          <td><input type="number" step="0.1" defaultValue="0.0" className="editable-cell" onBlur={(e) => {
                            const val = e.target.value;
                            if (val && !isNaN(parseFloat(val))) {
                              setCombinedPoints([{ time: parseFloat(val) || 0, activity: 0 }]);
                            }
                          }} /></td>
                          <td><input type="number" step="0.1" defaultValue="0.0" className="editable-cell" onBlur={(e) => {
                            const val = e.target.value;
                            if (val && !isNaN(parseFloat(val))) {
                              setCombinedPoints([{ time: 0, activity: parseFloat(val) || 0 }]);
                            }
                          }} /></td>
                          <td className="action-cell">
                            <button className="add-row-btn" onClick={() => handleAddRow(combinedPoints, setCombinedPoints)} title="Add row">+</button>
                          </td>
                        </tr>
                        {[5, 10, 15, 20].map((t) => (
                          <tr key={t} className="placeholder-row">
                            <td><input type="number" step="0.1" defaultValue={t} className="editable-cell" disabled /></td>
                            <td><input type="number" step="0.1" defaultValue="0.0" className="editable-cell" disabled /></td>
                            <td className="action-cell"></td>
                          </tr>
                        ))}
                      </>
                    ) : (
                      <>
                        {combinedPoints.map((point, i) => (
                          <tr key={i}>
                            <td>
                              <input
                                type="number"
                                step="0.1"
                                value={point.time}
                                className="editable-cell"
                                onChange={(e) => handleCellEdit(i, 'time', e.target.value, combinedPoints, setCombinedPoints)}
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val)) {
                                    handleCellEdit(i, 'time', e.target.value, combinedPoints, setCombinedPoints);
                                  }
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.1"
                                value={point.activity}
                                className="editable-cell"
                                onChange={(e) => handleCellEdit(i, 'activity', e.target.value, combinedPoints, setCombinedPoints)}
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val)) {
                                    handleCellEdit(i, 'activity', e.target.value, combinedPoints, setCombinedPoints);
                                  }
                                }}
                              />
                            </td>
                            <td className="action-cell">
                              <button className="delete-row-btn" onClick={() => handleDeleteRow(i, combinedPoints, setCombinedPoints)} title="Delete row">×</button>
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={3} className="add-row-cell">
                            <button className="add-row-btn" onClick={() => handleAddRow(combinedPoints, setCombinedPoints)}>+ Add Row</button>
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="controls">
          <div className="control-item">
            <label htmlFor="cutoff1">Time cutoff 1 (min)</label>
            <input
              id="cutoff1"
              type="number"
              value={timeCutoffs[0]}
              onChange={(e) => setTimeCutoffs([parseFloat(e.target.value) || 5, timeCutoffs[1]])}
              step="0.1"
            />
          </div>
          <div className="control-item">
            <label htmlFor="cutoff2">Time cutoff 2 (min)</label>
            <input
              id="cutoff2"
              type="number"
              value={timeCutoffs[1]}
              onChange={(e) => setTimeCutoffs([timeCutoffs[0], parseFloat(e.target.value) || 10])}
              step="0.1"
            />
          </div>
          <div className="control-item">
            <label htmlFor="decimals">Decimal places</label>
            <input
              id="decimals"
              type="number"
              value={decimalPlaces}
              onChange={(e) => setDecimalPlaces(Math.max(0, Math.min(10, parseInt(e.target.value) || 4)))}
              min="0"
              max="10"
            />
          </div>
        </div>

        {results.length > 0 && (
          <div className="controls" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #ddd' }}>
            <h3 style={{ width: '100%', marginBottom: '15px', fontSize: '16px' }}>Chart Axis Scaling</h3>
            <div className="control-item">
              <label htmlFor="y-tick">Y-axis tick interval (Bq/ml) - Auto if empty</label>
              <input
                id="y-tick"
                type="number"
                value={yTickInterval || ''}
                placeholder="Auto"
                onChange={(e) => {
                  const val = e.target.value;
                  setYTickInterval(val === '' ? null : Math.max(1, parseFloat(val) || 1));
                }}
                step="100"
                min="1"
              />
            </div>
            <div className="control-item">
              <label htmlFor="x-tick-05">X-axis tick (0-5 min) - Auto if empty</label>
              <input
                id="x-tick-05"
                type="number"
                value={xTickInterval['0-5'] || ''}
                placeholder="Auto"
                onChange={(e) => {
                  const val = e.target.value;
                  setXTickInterval({ ...xTickInterval, '0-5': val === '' ? null : Math.max(0.1, parseFloat(val) || 0.1) });
                }}
                step="0.1"
                min="0.1"
              />
            </div>
            <div className="control-item">
              <label htmlFor="x-tick-010">X-axis tick (0-10 min) - Auto if empty</label>
              <input
                id="x-tick-010"
                type="number"
                value={xTickInterval['0-10'] || ''}
                placeholder="Auto"
                onChange={(e) => {
                  const val = e.target.value;
                  setXTickInterval({ ...xTickInterval, '0-10': val === '' ? null : Math.max(0.1, parseFloat(val) || 0.1) });
                }}
                step="0.1"
                min="0.1"
              />
            </div>
            <div className="control-item">
              <label htmlFor="x-tick-10end">X-axis tick (10-end) - Auto if empty</label>
              <input
                id="x-tick-10end"
                type="number"
                value={xTickInterval['10-end'] || ''}
                placeholder="Auto"
                onChange={(e) => {
                  const val = e.target.value;
                  setXTickInterval({ ...xTickInterval, '10-end': val === '' ? null : Math.max(1, parseFloat(val) || 1) });
                }}
                step="1"
                min="1"
              />
            </div>
            <div className="control-item">
              <label htmlFor="x-tick-combined">X-axis tick (Combined) - Auto if empty</label>
              <input
                id="x-tick-combined"
                type="number"
                value={xTickInterval['combined'] || ''}
                placeholder="Auto"
                onChange={(e) => {
                  const val = e.target.value;
                  setXTickInterval({ ...xTickInterval, 'combined': val === '' ? null : Math.max(1, parseFloat(val) || 1) });
                }}
                step="1"
                min="1"
              />
            </div>
          </div>
        )}

        <button onClick={handleCompute}>Compute AUC Table</button>
      </div>

      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="warning">
          <strong>Warnings:</strong>
          <ul style={{ marginTop: '10px', marginLeft: '20px' }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {tEndCommon !== null && (
        <div className="info">
          <strong>Matched end time:</strong> {tEndCommon.toFixed(6)} min
        </div>
      )}

      {results.length > 0 && (
        <div className="output-section">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>IDIF_AUC</th>
                <th>Real_AUC</th>
                <th>%Bias_vs_Real</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.label}</td>
                  <td>{formatNumber(r.idifAUC)}</td>
                  <td>{formatNumber(r.realAUC)}</td>
                  <td>{formatBias(r.biasPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="button-group">
            <button className="secondary" onClick={copyTableToClipboard}>
              Copy TSV
            </button>
          </div>

          {matchedCurves && tEndCommon !== null && (
            <div className="charts-section">
              <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Time-Activity Curves</h2>
              <div className="charts-grid">
                <div className="chart-container">
                  <h3>0-5 min</h3>
                  {(() => {
                    const chartData = createChartData(matchedCurves.real, matchedCurves.combined, 0, timeCutoffs[0]);
                    return chartData && (
                      <Line
                        data={chartData}
                        options={createChartOptions(chartData, '0-5')}
                      />
                    );
                  })()}
                </div>
                <div className="chart-container">
                  <h3>0-10 min</h3>
                  {(() => {
                    const chartData = createChartData(matchedCurves.real, matchedCurves.combined, 0, timeCutoffs[1]);
                    return chartData && (
                      <Line
                        data={chartData}
                        options={createChartOptions(chartData, '0-10')}
                      />
                    );
                  })()}
                </div>
                <div className="chart-container">
                  <h3>10-end</h3>
                  {(() => {
                    const chartData = createChartData(matchedCurves.real, matchedCurves.combined, timeCutoffs[1], tEndCommon);
                    return chartData && (
                      <Line
                        data={chartData}
                        options={createChartOptions(chartData, '10-end')}
                      />
                    );
                  })()}
                </div>
                <div className="chart-container">
                  <h3>Combined (Total)</h3>
                  {(() => {
                    const chartData = createChartData(matchedCurves.real, matchedCurves.combined, 0, tEndCommon);
                    return chartData && (
                      <Line
                        data={chartData}
                        options={createChartOptions(chartData, 'combined')}
                      />
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
