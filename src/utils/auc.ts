import { Point } from './parser';

/**
 * Linear interpolation: get y value at time T
 * Requires that T is within the range [points[0].time, points[points.length-1].time]
 * or exactly at an endpoint
 */
export function getValueAt(points: Point[], T: number): number {
  if (points.length === 0) {
    throw new Error('Cannot interpolate: empty points array');
  }

  // Exact match at start
  if (T === points[0].time) {
    return points[0].activity;
  }

  // Exact match at end
  if (T === points[points.length - 1].time) {
    return points[points.length - 1].activity;
  }

  // Out of range - extrapolate
  if (T < points[0].time) {
    // Extrapolate backward
    const p0 = points[0];
    const p1 = points[1];
    const slope = (p1.activity - p0.activity) / (p1.time - p0.time);
    return p0.activity + slope * (T - p0.time);
  }

  if (T > points[points.length - 1].time) {
    // Extrapolate forward
    const n = points.length;
    const p0 = points[n - 2];
    const p1 = points[n - 1];
    const slope = (p1.activity - p0.activity) / (p1.time - p0.time);
    return p1.activity + slope * (T - p1.time);
  }

  // Interpolate: find bracketing points
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    
    if (T >= p0.time && T <= p1.time) {
      if (p0.time === p1.time) {
        return p0.activity; // Degenerate case
      }
      const fraction = (T - p0.time) / (p1.time - p0.time);
      return p0.activity + (p1.activity - p0.activity) * fraction;
    }
  }

  throw new Error(`Could not interpolate at time ${T}`);
}

/**
 * Clip curve to interval [a, b], ensuring boundaries are included
 */
export function clipCurveToInterval(points: Point[], a: number, b: number): Point[] {
  if (points.length === 0) {
    throw new Error('Cannot clip: empty points array');
  }

  const clipped: Point[] = [];
  const startTime = points[0].time;
  const endTime = points[points.length - 1].time;

  // Add start boundary if needed
  if (a > startTime) {
    clipped.push({ time: a, activity: getValueAt(points, a) });
  } else if (a === startTime) {
    clipped.push(points[0]);
  } else {
    // a < startTime - extrapolate or use first point
    clipped.push({ time: a, activity: getValueAt(points, a) });
  }

  // Add all points within [a, b]
  for (const p of points) {
    if (p.time > a && p.time < b) {
      clipped.push(p);
    }
  }

  // Add end boundary if needed
  if (b < endTime) {
    clipped.push({ time: b, activity: getValueAt(points, b) });
  } else if (b === endTime) {
    clipped.push(points[points.length - 1]);
  } else {
    // b > endTime - extrapolate or use last point
    clipped.push({ time: b, activity: getValueAt(points, b) });
  }

  // Remove duplicates and sort (should already be sorted, but be safe)
  const result: Point[] = [];
  const seen = new Set<number>();
  for (const p of clipped) {
    if (!seen.has(p.time)) {
      seen.add(p.time);
      result.push(p);
    }
  }
  result.sort((x, y) => x.time - y.time);

  return result;
}

/**
 * Compute AUC using trapezoidal rule
 */
export function trapezoidAUC(points: Point[]): number {
  if (points.length < 2) {
    return 0;
  }

  let auc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const t0 = points[i].time;
    const y0 = points[i].activity;
    const t1 = points[i + 1].time;
    const y1 = points[i + 1].activity;
    
    const dt = t1 - t0;
    const avgY = (y0 + y1) / 2;
    auc += avgY * dt;
  }

  return auc;
}

/**
 * Compute AUC in window [a, b]
 */
export function aucInWindow(points: Point[], a: number, b: number): number {
  if (a >= b) {
    throw new Error(`Invalid window: [${a}, ${b}]`);
  }
  const clipped = clipCurveToInterval(points, a, b);
  return trapezoidAUC(clipped);
}

/**
 * Match end times: interpolate longer dataset to shorter end time
 */
export interface MatchedCurves {
  realMatched: Point[];
  combinedMatched: Point[];
  tEndCommon: number;
}

export function matchEndTimes(
  realPoints: Point[],
  combinedPoints: Point[]
): MatchedCurves {
  const endReal = realPoints[realPoints.length - 1].time;
  const endCombined = combinedPoints[combinedPoints.length - 1].time;
  const tEndCommon = Math.min(endReal, endCombined);

  // Process Real curve
  let realMatched: Point[];
  if (endReal === tEndCommon) {
    realMatched = [...realPoints];
  } else if (endReal > tEndCommon) {
    // Need to interpolate at tEndCommon and truncate
    realMatched = realPoints.filter(p => p.time <= tEndCommon);
    // Ensure tEndCommon is included
    if (realMatched[realMatched.length - 1].time !== tEndCommon) {
      const valueAtEnd = getValueAt(realPoints, tEndCommon);
      realMatched.push({ time: tEndCommon, activity: valueAtEnd });
    }
  } else {
    // endReal < tEndCommon (shouldn't happen, but handle gracefully)
    realMatched = [...realPoints];
    const valueAtEnd = getValueAt(realPoints, tEndCommon);
    realMatched.push({ time: tEndCommon, activity: valueAtEnd });
  }

  // Process Combined curve
  let combinedMatched: Point[];
  if (endCombined === tEndCommon) {
    combinedMatched = [...combinedPoints];
  } else if (endCombined > tEndCommon) {
    // Need to interpolate at tEndCommon and truncate
    combinedMatched = combinedPoints.filter(p => p.time <= tEndCommon);
    // Ensure tEndCommon is included
    if (combinedMatched[combinedMatched.length - 1].time !== tEndCommon) {
      const valueAtEnd = getValueAt(combinedPoints, tEndCommon);
      combinedMatched.push({ time: tEndCommon, activity: valueAtEnd });
    }
  } else {
    // endCombined < tEndCommon (shouldn't happen, but handle gracefully)
    combinedMatched = [...combinedPoints];
    const valueAtEnd = getValueAt(combinedPoints, tEndCommon);
    combinedMatched.push({ time: tEndCommon, activity: valueAtEnd });
  }

  // Final sort and dedupe (shouldn't be needed, but be safe)
  realMatched.sort((a, b) => a.time - b.time);
  combinedMatched.sort((a, b) => a.time - b.time);

  return {
    realMatched,
    combinedMatched,
    tEndCommon
  };
}
