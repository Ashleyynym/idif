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
 * Parse raw text into points without validation (for display purposes)
 */
export function parseRawPoints(text: string): Point[] {
  const lines = text.split('\n');
  const points: Point[] = [];

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

    // Need at least 2 numbers for a pair (time, activity)
    if (numbers.length < 2) continue;

    const time = numbers[0];
    const activity = numbers[1];
    if (!isNaN(time) && !isNaN(activity)) {
      points.push({ time, activity });
    }
  }

  return points;
}

/**
 * Parse a single curve from pasted text (expects Time and Activity columns)
 */
export function parseCurve(text: string, curveName: string): { points: Point[]; warnings: string[] } {
  const lines = text.split('\n');
  const points: Point[] = [];
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

    // Need at least 2 numbers for a pair (time, activity)
    if (numbers.length < 2) continue;

    const time = numbers[0];
    const activity = numbers[1];
    if (!isNaN(time) && !isNaN(activity)) {
      points.push({ time, activity });
    }
  }

  // Validate minimum points
  if (points.length < 2) {
    throw new Error(`Insufficient ${curveName} curve points: found ${points.length}, need at least 2`);
  }

  // Normalize curve
  const normalized = normalizeCurve(points, warnings);

  // Check for time 0
  if (normalized[0].time !== 0) {
    throw new Error(`${curveName} curve must start at time 0`);
  }

  return { points: normalized, warnings };
}

/**
 * Parse pasted text into Real and Combined curve points (legacy function for backward compatibility)
 */
export function parsePastedText(realText: string, combinedText: string): ParsedData {
  const realResult = parseCurve(realText, 'Real');
  const combinedResult = parseCurve(combinedText, 'Combined');

  return {
    realPoints: realResult.points,
    combinedPoints: combinedResult.points,
    warnings: [...realResult.warnings, ...combinedResult.warnings]
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
