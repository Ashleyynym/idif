import { useState, useRef } from 'react';
import { parsePastedText, parseRawPoints, Point } from './utils/parser';
import { matchEndTimes, aucInWindow } from './utils/auc';

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
                    </tr>
                  </thead>
                  <tbody>
                    {realPoints.length === 0 ? (
                      <>
                        <tr className="placeholder-row">
                          <td>0.0</td>
                          <td>0.0</td>
                        </tr>
                        <tr className="placeholder-row">
                          <td>5.0</td>
                          <td>0.0</td>
                        </tr>
                        <tr className="placeholder-row">
                          <td>10.0</td>
                          <td>0.0</td>
                        </tr>
                        <tr className="placeholder-row">
                          <td>15.0</td>
                          <td>0.0</td>
                        </tr>
                        <tr className="placeholder-row">
                          <td>20.0</td>
                          <td>0.0</td>
                        </tr>
                      </>
                    ) : (
                      realPoints.map((point, i) => (
                        <tr key={i}>
                          <td>{point.time}</td>
                          <td>{point.activity}</td>
                        </tr>
                      ))
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
                    </tr>
                  </thead>
                  <tbody>
                    {combinedPoints.length === 0 ? (
                      <>
                        <tr className="placeholder-row">
                          <td>0.0</td>
                          <td>0.0</td>
                        </tr>
                        <tr className="placeholder-row">
                          <td>5.0</td>
                          <td>0.0</td>
                        </tr>
                        <tr className="placeholder-row">
                          <td>10.0</td>
                          <td>0.0</td>
                        </tr>
                        <tr className="placeholder-row">
                          <td>15.0</td>
                          <td>0.0</td>
                        </tr>
                        <tr className="placeholder-row">
                          <td>20.0</td>
                          <td>0.0</td>
                        </tr>
                      </>
                    ) : (
                      combinedPoints.map((point, i) => (
                        <tr key={i}>
                          <td>{point.time}</td>
                          <td>{point.activity}</td>
                        </tr>
                      ))
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
        </div>
      )}
    </div>
  );
}

export default App;
