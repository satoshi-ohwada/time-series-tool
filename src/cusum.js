/**
 * CUSUM (Cumulative Sum Control Chart) module for Residual Analysis
 * Detects persistent small-to-moderate shifts and drift in the residual series.
 */

/**
 * Perform Tabular CUSUM analysis on residuals
 * 
 * @param {string[]} timestamps - Array of timestamps
 * @param {number[]} residual - STL residual component array
 * @param {object} [options]
 * @param {number} [options.kFactor=0.5] - Slack value multiplier (k = kFactor * sigma)
 * @param {number} [options.hFactor] - Decision threshold multiplier (h = hFactor * sigma)
 * @param {string} [options.sensitivity='medium'] - 'low' (h=5.0s) | 'medium' (h=4.0s) | 'high' (h=3.0s)
 * @returns {{
 *   cusumPlus: number[],
 *   cusumMinus: number[],
 *   centeredCusum: number[],
 *   sigma: number,
 *   mean: number,
 *   k: number,
 *   h: number,
 *   anomalies: Array<{
 *     type: 'positive' | 'negative',
 *     label: string,
 *     startIndex: number,
 *     endIndex: number,
 *     shiftStartIndex: number,
 *     startTime: string,
 *     endTime: string,
 *     shiftStartTime: string,
 *     maxCusum: number,
 *     description: string
 *   }>,
 *   hasAnomaly: boolean,
 *   anomalyIndices: boolean[]
 * }}
 */
export function calculateResidualCusum(timestamps, residual, options = {}) {
  const n = residual ? residual.length : 0;
  if (n < 4) {
    return {
      cusumPlus: [],
      cusumMinus: [],
      centeredCusum: [],
      sigma: 0,
      mean: 0,
      k: 0,
      h: 0,
      anomalies: [],
      hasAnomaly: false,
      anomalyIndices: []
    };
  }

  // 1. Calculate Residual Statistics
  let sum = 0;
  for (let i = 0; i < n; i++) sum += residual[i];
  const mean = sum / n;

  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const diff = residual[i] - mean;
    sumSq += diff * diff;
  }
  const variance = sumSq / (n > 1 ? n - 1 : 1);
  const sigma = Math.max(Math.sqrt(variance), 1e-6);

  // 2. Determine Parameters
  const kFactor = typeof options.kFactor === 'number' ? options.kFactor : 0.5;
  const sensitivity = options.sensitivity || 'medium';

  let hFactor = 4.0;
  if (typeof options.hFactor === 'number') {
    hFactor = options.hFactor;
  } else if (sensitivity === 'low') {
    hFactor = 5.0;
  } else if (sensitivity === 'high') {
    hFactor = 3.0;
  }

  const k = kFactor * sigma;
  const h = hFactor * sigma;

  // Determine target center based on model type:
  // Additive model theoretical center is 0
  // Multiplicative model theoretical center is 1.0 (since residual = Observed / (Trend * Seasonal))
  let target = 0;
  if (typeof options.target === 'number') {
    target = options.target;
  } else if (options.multiplicative || Math.abs(mean - 1.0) < Math.abs(mean - 0.0)) {
    target = 1.0;
  }

  // 3. Compute Tabular CUSUM (One-sided upper & lower) and Centered CUSUM
  const cusumPlus = new Array(n);
  const cusumMinus = new Array(n);
  const centeredCusum = new Array(n);
  const anomalyIndices = new Array(n).fill(false);

  // Track when the current excursion started from 0
  let runStartPlus = 0;
  let runStartMinus = 0;

  let prevPlus = 0;
  let prevMinus = 0;
  let runningCentered = 0;

  const rawAnomalies = [];

  for (let i = 0; i < n; i++) {
    const res = residual[i];

    // Centered cumulative sum
    runningCentered += (res - mean);
    centeredCusum[i] = runningCentered;

    // Upper CUSUM
    const nextPlus = Math.max(0, prevPlus + (res - target - k));
    cusumPlus[i] = nextPlus;
    if (prevPlus === 0 && nextPlus > 0) {
      runStartPlus = i;
    }

    // Lower CUSUM (expressed as positive value for deviation magnitude)
    const nextMinus = Math.max(0, prevMinus - (res - target + k));
    cusumMinus[i] = nextMinus;
    if (prevMinus === 0 && nextMinus > 0) {
      runStartMinus = i;
    }

    // Flag alarms
    if (nextPlus > h) {
      anomalyIndices[i] = true;
      rawAnomalies.push({
        index: i,
        type: 'positive',
        shiftStartIndex: runStartPlus,
        val: nextPlus
      });
    }

    if (nextMinus > h) {
      anomalyIndices[i] = true;
      rawAnomalies.push({
        index: i,
        type: 'negative',
        shiftStartIndex: runStartMinus,
        val: nextMinus
      });
    }

    prevPlus = nextPlus;
    prevMinus = nextMinus;
  }

  // 4. Cluster alarms into continuous shift episodes
  const anomalies = [];
  const processedTypes = ['positive', 'negative'];

  for (const type of processedTypes) {
    const typeEvents = rawAnomalies.filter(a => a.type === type);
    if (typeEvents.length === 0) continue;

    let currentEpisode = null;

    for (const evt of typeEvents) {
      if (!currentEpisode) {
        currentEpisode = {
          type: type,
          startIndex: evt.index,
          endIndex: evt.index,
          shiftStartIndex: evt.shiftStartIndex,
          maxCusum: evt.val
        };
      } else if (evt.index <= currentEpisode.endIndex + 2) {
        // Continuous or close
        currentEpisode.endIndex = evt.index;
        currentEpisode.maxCusum = Math.max(currentEpisode.maxCusum, evt.val);
      } else {
        anomalies.push(finalizeEpisode(currentEpisode, timestamps, sigma, h));
        currentEpisode = {
          type: type,
          startIndex: evt.index,
          endIndex: evt.index,
          shiftStartIndex: evt.shiftStartIndex,
          maxCusum: evt.val
        };
      }
    }

    if (currentEpisode) {
      anomalies.push(finalizeEpisode(currentEpisode, timestamps, sigma, h));
    }
  }

  // Sort episodes by start index
  anomalies.sort((a, b) => a.startIndex - b.startIndex);

  return {
    cusumPlus,
    cusumMinus,
    centeredCusum,
    sigma,
    mean,
    k,
    h,
    anomalies,
    hasAnomaly: anomalies.length > 0,
    anomalyIndices
  };
}

function finalizeEpisode(episode, timestamps, sigma, h) {
  const isPos = episode.type === 'positive';
  const label = isPos ? '上方シフト (正の偏り)' : '下方シフト (負の偏り)';
  const dirText = isPos ? 'プラス側（上振れ）' : 'マイナス側（下振れ）';
  const shiftTime = timestamps[episode.shiftStartIndex] || '';
  const startTime = timestamps[episode.startIndex] || '';
  const endTime = timestamps[episode.endIndex] || '';

  const timeRangeStr = startTime === endTime ? startTime : `${startTime} 〜 ${endTime}`;

  return {
    ...episode,
    label,
    startTime,
    endTime,
    shiftStartTime: shiftTime,
    description: `${timeRangeStr}: 残差が継続して${dirText}に偏留し、CUSUM限界値(${h.toFixed(1)})を超過（兆候開始: ${shiftTime}）`
  };
}
