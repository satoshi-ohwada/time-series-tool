/**
 * Trend Change Point Detection module
 * Detects major turning points, peaks, troughs, and inflection points in the STL trend component.
 */

/**
 * Detect major change points in a trend series
 * 
 * @param {string[]} timestamps - Array of timestamps
 * @param {number[]} trend - STL trend component array
 * @param {object} [options]
 * @param {number} [options.period=12] - Seasonality period used for scale reference
 * @param {string} [options.sensitivity='medium'] - 'low' | 'medium' | 'high'
 * @returns {Array<{ index: number, timestamp: string, value: number, type: string, label: string, description: string, score: number }>}
 */
export function detectTrendChangePoints(timestamps, trend, options = {}) {
  const n = trend ? trend.length : 0;
  if (n < 7) return [];

  const period = Math.max(2, Math.floor(options.period || 12));
  const sensitivity = options.sensitivity || 'medium';

  // Config based on sensitivity
  let maxPoints = 5;
  let scoreThreshold = 0.22;
  if (sensitivity === 'low') {
    maxPoints = 3;
    scoreThreshold = 0.38;
  } else if (sensitivity === 'high') {
    maxPoints = 8;
    scoreThreshold = 0.14;
  }

  // Trend overall amplitude and scale
  const trendMax = Math.max(...trend);
  const trendMin = Math.min(...trend);
  const trendRange = Math.max(trendMax - trendMin, 1e-6);

  // Buffer at boundaries to avoid LOESS edge distortion
  const edgeBuffer = Math.max(2, Math.min(Math.floor(period / 2), Math.floor(n * 0.08)));

  // Half-window for slope calculation
  const halfWin = Math.max(1, Math.min(Math.floor(period / 4), Math.floor(n / 10)));

  // 1. Calculate local slope before and after each point
  // slopePre: slope of [i - halfWin, i]
  // slopePost: slope of [i, i + halfWin]
  const candidates = [];

  for (let i = edgeBuffer; i < n - edgeBuffer; i++) {
    const preY0 = trend[i - halfWin];
    const preY1 = trend[i];
    const slopePre = (preY1 - preY0) / halfWin;

    const postY0 = trend[i];
    const postY1 = trend[i + halfWin];
    const slopePost = (postY1 - postY0) / halfWin;

    const slopeDiff = slopePost - slopePre; // Second derivative approximation
    const val = trend[i];

    // Check for local peak (crest)
    const isLocalPeak = val >= trend[i - 1] && val >= trend[i + 1] &&
      trend[i - halfWin] < val && trend[i + halfWin] < val;

    // Check for local trough (valley)
    const isLocalTrough = val <= trend[i - 1] && val <= trend[i + 1] &&
      trend[i - halfWin] > val && trend[i + halfWin] > val;

    if (isLocalPeak) {
      const dropLeft = val - trend[i - halfWin];
      const dropRight = val - trend[i + halfWin];
      const drop = (dropLeft + dropRight) / 2;
      const score = Math.min(1, (drop / trendRange) * 4);

      if (score >= scoreThreshold * 0.7) {
        candidates.push({
          index: i,
          timestamp: timestamps[i],
          value: val,
          type: 'peak',
          label: 'ピーク (天井)',
          description: `上昇から下降への反転（値: ${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}）`,
          score: score,
          slopeDiff: slopeDiff
        });
        continue;
      }
    }

    if (isLocalTrough) {
      const riseLeft = trend[i - halfWin] - val;
      const riseRight = trend[i + halfWin] - val;
      const rise = (riseLeft + riseRight) / 2;
      const score = Math.min(1, (rise / trendRange) * 4);

      if (score >= scoreThreshold * 0.7) {
        candidates.push({
          index: i,
          timestamp: timestamps[i],
          value: val,
          type: 'trough',
          label: 'ボトム (底打ち)',
          description: `下降から上昇への反転（値: ${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}）`,
          score: score,
          slopeDiff: slopeDiff
        });
        continue;
      }
    }

    // Check for slope change (acceleration / deceleration / inflection)
    const slopeChangeMagnitude = Math.abs(slopeDiff);
    const normSlopeScore = Math.min(1, (slopeChangeMagnitude / (trendRange / period)) * 1.5);

    if (normSlopeScore >= scoreThreshold) {
      if (slopeDiff > 0) {
        candidates.push({
          index: i,
          timestamp: timestamps[i],
          value: val,
          type: 'acceleration',
          label: '上昇加速・反転',
          description: `トレンドの傾きが上方へ急変（上向きの加速）`,
          score: normSlopeScore,
          slopeDiff: slopeDiff
        });
      } else {
        candidates.push({
          index: i,
          timestamp: timestamps[i],
          value: val,
          type: 'deceleration',
          label: '成長鈍化・下降加速',
          description: `トレンドの伸びが急激に鈍化、または下降へ傾斜`,
          score: normSlopeScore,
          slopeDiff: slopeDiff
        });
      }
    }
  }

  // 2. Non-Maximum Suppression (NMS) to remove clustered adjacent points
  const minSeparation = Math.max(3, Math.floor(period / 2));

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  const selected = [];
  for (const cand of candidates) {
    const tooClose = selected.some(sel => Math.abs(sel.index - cand.index) < minSeparation);
    if (!tooClose) {
      selected.push(cand);
      if (selected.length >= maxPoints) break;
    }
  }

  // Sort final points chronologically by time index
  selected.sort((a, b) => a.index - b.index);

  return selected;
}
