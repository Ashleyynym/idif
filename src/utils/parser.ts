export interface Point {
  time: number;
  activity: number;
}

export interface ParsedData {
  realPoints: Point[];
  combinedPoints: Point[];
  warnings: string[];
}

/**
 * Parse pasted text into Real and Combined curve points
 */
export function parsePastedText(text: string): ParsedData {
  const lines = text.split('\n');
  const realPoints: Point[] = [];
  const combinedPoints: Point[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Try tab split first, then whitespace
    let parts = line.split('\t');
    if (parts.length < 2) {
      parts = line.split(/\s+/);
    }

    // Extract numeric values
    const numbers: number[] = [];
    for (const part of parts) {
      const num = parseFloat(part);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    }

    // Need at least 2 numbers for a pair
    if (numbers.length < 2) continue;

    // Parse based on position:
    // Real: first two numbers (time, activity)
    // Combined: third and fourth numbers (time, activity)
    
    if (numbers.length >= 2) {
      const realTime = numbers[0];
      const realActivity = numbers[1];
      if (!isNaN(realTime) && !isNaN(realActivity)) {
        realPoints.push({ time: realTime, activity: realActivity });
      }
    }

    if (numbers.length >= 4) {
      const combTime = numbers[2];
      const combActivity = numbers[3];
      if (!isNaN(combTime) && !isNaN(combActivity)) {
        combinedPoints.push({ time: combTime, activity: combActivity });
      }
    }
  }

  // Validate minimum points
  if (realPoints.length < 2) {
    throw new Error(`Insufficient Real curve points: found ${realPoints.length}, need at least 2`);
  }
  if (combinedPoints.length < 2) {
    throw new Error(`Insufficient Combined curve points: found ${combinedPoints.length}, need at least 2`);
  }

  // Normalize curves
  const normalizedReal = normalizeCurve(realPoints, warnings);
  const normalizedCombined = normalizeCurve(combinedPoints, warnings);

  // Check for time 0
  if (normalizedReal[0].time !== 0) {
    throw new Error('Real curve must start at time 0');
  }
  if (normalizedCombined[0].time !== 0) {
    throw new Error('Combined curve must start at time 0');
  }

  return {
    realPoints: normalizedReal,
    combinedPoints: normalizedCombined,
    warnings
  };
}

/**
 * Normalize curve: sort by time, handle duplicates (keep last), validate monotonic
 */
function normalizeCurve(points: Point[], warnings: string[]): Point[] {
  // Check for duplicates before sorting
  const timeSet = new Set<number>();
  const duplicateTimes: number[] = [];
  for (const p of points) {
    if (timeSet.has(p.time)) {
      duplicateTimes.push(p.time);
    }
    timeSet.add(p.time);
  }
  if (duplicateTimes.length > 0) {
    warnings.push(`Found duplicate times: ${duplicateTimes.join(', ')}. Keeping last occurrence.`);
  }

  // Sort by time
  const sorted = [...points].sort((a, b) => a.time - b.time);

  // Remove duplicates by keeping last occurrence
  const deduped: Point[] = [];
  const seen = new Map<number, number>();
  for (const p of sorted) {
    seen.set(p.time, p.activity);
  }
  for (const [time, activity] of seen.entries()) {
    deduped.push({ time, activity });
  }
  deduped.sort((a, b) => a.time - b.time);

  // Check monotonicity (should be after deduping, but warn if original wasn't)
  let wasMonotonic = true;
  for (let i = 1; i < points.length; i++) {
    if (points[i].time < points[i - 1].time) {
      wasMonotonic = false;
      break;
    }
  }
  if (!wasMonotonic) {
    warnings.push('Times were not monotonic; sorted to fix.');
  }

  return deduped;
}
