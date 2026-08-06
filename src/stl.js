/**
 * STL Decomposition (Seasonal-Trend Decomposition using Loess)
 * Client-side Pure JavaScript Implementation
 */

/**
 * Tricube weight function for LOESS
 */
function tricube(x) {
  const absX = Math.abs(x);
  if (absX >= 1) return 0;
  const tmp = 1 - absX * absX * absX;
  return tmp * tmp * tmp;
}

/**
 * Local Polynomial Regression (LOESS / LOWESS)
 * @param {number[]} x - Independent variable indices [0, 1, 2, ...]
 * @param {number[]} y - Dependent variable values
 * @param {number} span - Window span (number of points or fraction)
 * @param {number[]} [robustWeights] - Optional robustness weights
 * @returns {number[]} Smoothed values
 */
export function loess(x, y, span, robustWeights = null) {
  const n = x.length;
  const smoothed = new Array(n);
  const k = Math.min(n, Math.max(3, Math.floor(span)));

  for (let i = 0; i < n; i++) {
    const xi = x[i];

    // Find k nearest neighbors to x[i]
    const distances = new Array(n);
    for (let j = 0; j < n; j++) {
      distances[j] = { idx: j, dist: Math.abs(x[j] - xi) };
    }
    distances.sort((a, b) => a.dist - b.dist);

    const maxDist = Math.max(distances[k - 1].dist, 1e-12);

    let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;

    for (let j = 0; j < k; j++) {
      const idx = distances[j].idx;
      const dist = distances[j].dist;
      let w = tricube(dist / maxDist);
      if (robustWeights) {
        w *= robustWeights[idx];
      }

      const xj = x[idx];
      const yj = y[idx];

      sumW += w;
      sumWX += w * xj;
      sumWY += w * yj;
      sumWXX += w * xj * xj;
      sumWXY += w * xj * yj;
    }

    const denom = sumW * sumWXX - sumWX * sumWX;
    if (Math.abs(denom) < 1e-12) {
      smoothed[i] = sumW > 0 ? sumWY / sumW : y[i];
    } else {
      const a = (sumWY * sumWXX - sumWX * sumWXY) / denom;
      const b = (sumW * sumWXY - sumWX * sumWY) / denom;
      smoothed[i] = a + b * xi;
    }
  }

  return smoothed;
}

/**
 * Moving Average filter
 */
function movingAverage(series, windowSize) {
  const n = series.length;
  const result = new Array(n);
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      sum += series[j];
      count++;
    }
    result[i] = sum / count;
  }
  return result;
}

/**
 * Perform STL Decomposition on a 1D time series
 * 
 * @param {number[]} data - Time series values (evenly spaced)
 * @param {object} options
 * @param {number} options.period - Seasonal period (e.g. 12 for monthly, 7 for weekly)
 * @param {number} [options.seasonalWindow] - Window size for seasonal smoothing (odd, >= 7)
 * @param {number} [options.trendWindow] - Window size for trend smoothing
 * @param {number} [options.innerLoops=2] - Number of inner loop iterations
 * @param {number} [options.outerLoops=1] - Number of outer loop (robustness) iterations
 * @param {boolean} [options.multiplicative=false] - Whether to use multiplicative model via log transform
 * 
 * @returns {{ observed: number[], trend: number[], seasonal: number[], residual: number[] }}
 */
export function stlDecompose(data, options = {}) {
  const n = data.length;
  if (n === 0) {
    return { observed: [], trend: [], seasonal: [], residual: [] };
  }

  const period = Math.max(2, Math.floor(options.period || 12));
  const multiplicative = !!options.multiplicative;

  // Handle multiplicative model via log transform (for positive data)
  let yData = [...data];
  let minVal = Math.min(...yData);
  let logShift = 0;

  if (multiplicative) {
    if (minVal <= 0) {
      logShift = Math.abs(minVal) + 1;
    }
    yData = yData.map(v => Math.log(v + logShift));
  }

  const x = Array.from({ length: n }, (_, i) => i);
  
  // Default window lengths based on Cleveland et al. (1990)
  const sWindow = options.seasonalWindow || 7;
  // trendWindow is typically: Math.ceil((1.5 * period) / (1 - 1.5 / sWindow))
  const numSWindow = typeof sWindow === 'number' ? sWindow : 7;
  const defaultTrendWindow = Math.max(period + 1, Math.ceil((1.5 * period) / (1 - 1.5 / Math.max(7, numSWindow))));
  const tWindow = options.trendWindow || (defaultTrendWindow % 2 === 0 ? defaultTrendWindow + 1 : defaultTrendWindow);

  const innerLoops = options.innerLoops || 2;
  const outerLoops = options.outerLoops || 1;

  let trend = new Array(n).fill(0);
  let seasonal = new Array(n).fill(0);
  let robustWeights = new Array(n).fill(1);

  for (let outer = 0; outer < outerLoops; outer++) {
    for (let inner = 0; inner < innerLoops; inner++) {
      // Step 1: Detrend
      const detrended = new Array(n);
      for (let i = 0; i < n; i++) {
        detrended[i] = yData[i] - trend[i];
      }

      // Step 2: Cycle-subseries Smoothing
      const rawSeasonal = new Array(n);
      for (let p = 0; p < period; p++) {
        const subIndices = [];
        const subValues = [];
        const subWeights = [];
        for (let i = p; i < n; i += period) {
          subIndices.push(i);
          subValues.push(detrended[i]);
          subWeights.push(robustWeights[i]);
        }

        if (subValues.length > 1) {
          if (sWindow === 'periodic') {
            // 固定の季節変動（サブシリーズの平均）
            let sumWX = 0, sumW = 0;
            for (let j = 0; j < subValues.length; j++) {
              const w = subWeights[j] || 1;
              sumWX += subValues[j] * w;
              sumW += w;
            }
            const mean = sumW > 0 ? sumWX / sumW : 0;
            for (let k = 0; k < subIndices.length; k++) {
              rawSeasonal[subIndices[k]] = mean;
            }
          } else {
            // LOESSによる平滑化（季節変動の変化を許容）
            const subX = Array.from({ length: subValues.length }, (_, idx) => idx);
            const smoothedSub = loess(subX, subValues, sWindow, subWeights);
            for (let k = 0; k < subIndices.length; k++) {
              rawSeasonal[subIndices[k]] = smoothedSub[k];
            }
          }
        } else if (subValues.length === 1) {
          rawSeasonal[subIndices[0]] = subValues[0];
        }
      }

      // Step 3: Low-pass filtering of seasonal component
      // Moving average of period, period, and 3
      const pass1 = movingAverage(rawSeasonal, period);
      const pass2 = movingAverage(pass1, period);
      const pass3 = movingAverage(pass2, 3);
      const lowPass = loess(x, pass3, tWindow, robustWeights);

      for (let i = 0; i < n; i++) {
        seasonal[i] = rawSeasonal[i] - lowPass[i];
      }

      // Step 4: Deseasonalize
      const deseasonalized = new Array(n);
      for (let i = 0; i < n; i++) {
        deseasonalized[i] = yData[i] - seasonal[i];
      }

      // Step 5: Trend Smoothing
      trend = loess(x, deseasonalized, tWindow, robustWeights);
    }

    // Update Robustness Weights based on residual magnitude
    const residualTemp = new Array(n);
    for (let i = 0; i < n; i++) {
      residualTemp[i] = Math.abs(yData[i] - trend[i] - seasonal[i]);
    }

    // Median absolute deviation
    const sortedRes = [...residualTemp].sort((a, b) => a - b);
    const medianRes = sortedRes[Math.floor(n / 2)] || 1e-6;
    const h = 6 * medianRes;

    if (h > 1e-12) {
      for (let i = 0; i < n; i++) {
        const u = residualTemp[i] / h;
        if (u >= 1) {
          robustWeights[i] = 0;
        } else {
          const w = 1 - u * u;
          robustWeights[i] = w * w;
        }
      }
    }
  }

  // Calculate final residual
  let residual = new Array(n);
  let finalObserved = [...data];
  let finalTrend = [...trend];
  let finalSeasonal = [...seasonal];
  let finalResidual = new Array(n);

  let finalAdjusted = new Array(n);

  if (multiplicative) {
    // Reverse log transform
    for (let i = 0; i < n; i++) {
      finalTrend[i] = Math.exp(trend[i]) - logShift;
      finalSeasonal[i] = Math.exp(seasonal[i]);
      // Multiplicative residual = Observed / (Trend * Seasonal)
      const fitted = (finalTrend[i] + logShift) * finalSeasonal[i];
      finalResidual[i] = fitted !== 0 ? (data[i] + logShift) / fitted : 1;
      finalAdjusted[i] = finalSeasonal[i] !== 0 ? (data[i] + logShift) / finalSeasonal[i] - logShift : data[i];
    }
  } else {
    for (let i = 0; i < n; i++) {
      finalResidual[i] = data[i] - finalTrend[i] - finalSeasonal[i];
      finalAdjusted[i] = data[i] - finalSeasonal[i];
    }
  }

  return {
    observed: finalObserved,
    trend: finalTrend,
    seasonal: finalSeasonal,
    residual: finalResidual,
    adjusted: finalAdjusted
  };
}
