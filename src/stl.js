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
 * Centered coordinate optimization: evaluates regression at xi (u = 0),
 * which directly yields constant term `a` with reduced floating-point operations
 * and avoids ill-conditioned sums for large indices.
 * 
 * @param {number[]} x - Independent variable indices [0, 1, 2, ...]
 * @param {number[]} y - Dependent variable values
 * @param {number} span - Window span (number of points or fraction)
 * @param {number[]} [robustWeights] - Optional robustness weights
 * @returns {number[]} Smoothed values
 */
export function loess(x, y, span, robustWeights = null) {
  const n = x.length;
  const smoothed = new Array(n);
  const k = Math.min(n, Math.max(2, Math.floor(span)));
  const scale = span > k ? span / k : 1.0001;

  let left = 0;
  let right = k - 1;

  for (let i = 0; i < n; i++) {
    const xi = x[i];

    // Slide window [left, right] to maintain k nearest neighbors to xi (for sorted x)
    while (right + 1 < n && Math.abs(x[right + 1] - xi) < Math.abs(x[left] - xi)) {
      left++;
      right++;
    }

    const baseDist = Math.max(Math.abs(xi - x[left]), Math.abs(x[right] - xi));
    const maxDist = Math.max(baseDist * scale, 1e-12);

    let sumW = 0, sumWU = 0, sumWUU = 0, sumWY = 0, sumWUY = 0;

    for (let j = left; j <= right; j++) {
      const u = x[j] - xi;
      const absU = Math.abs(u);
      const ratio = absU / maxDist;
      if (ratio >= 1) continue;

      const tmp = 1 - ratio * ratio * ratio;
      let w = tmp * tmp * tmp;
      if (robustWeights) {
        w *= robustWeights[j];
      }

      const yj = y[j];
      const wu = w * u;

      sumW += w;
      sumWU += wu;
      sumWUU += wu * u;
      sumWY += w * yj;
      sumWUY += wu * yj;
    }

    const denom = sumW * sumWUU - sumWU * sumWU;
    if (Math.abs(denom) < 1e-12) {
      smoothed[i] = sumW > 0 ? sumWY / sumW : y[i];
    } else {
      smoothed[i] = (sumWY * sumWUU - sumWU * sumWUY) / denom;
    }
  }

  return smoothed;
}

/**
 * Cleveland et al. (1990) Low-pass filter for STL flexible seasonal component:
 * Filters the series using MA(period), MA(period), MA(3), followed by LOESS smoothing.
 * Series is extended by `period` points at each end to avoid edge distortion.
 */
function lowPassFilter(series, period, lWindow, robustWeights = null) {
  const n = series.length;
  if (n <= period) return new Array(n).fill(0);

  // Extend series by period points at each end using cyclic repetition
  const extended = new Array(n + 2 * period);
  for (let i = 0; i < period; i++) {
    extended[i] = series[i % period];
  }
  for (let i = 0; i < n; i++) {
    extended[i + period] = series[i];
  }
  for (let i = 0; i < period; i++) {
    extended[n + period + i] = series[n - period + i];
  }

  // Pass 1: Moving average of length `period` -> length n + period + 1
  const len1 = n + period + 1;
  const pass1 = new Array(len1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += extended[i];
  pass1[0] = sum / period;
  for (let i = 1; i < len1; i++) {
    sum += extended[i + period - 1] - extended[i - 1];
    pass1[i] = sum / period;
  }

  // Pass 2: Moving average of length `period` -> length n + 2
  const len2 = n + 2;
  const pass2 = new Array(len2);
  sum = 0;
  for (let i = 0; i < period; i++) sum += pass1[i];
  pass2[0] = sum / period;
  for (let i = 1; i < len2; i++) {
    sum += pass1[i + period - 1] - pass1[i - 1];
    pass2[i] = sum / period;
  }

  // Pass 3: Moving average of length 3 -> length n
  const pass3 = new Array(n);
  for (let i = 0; i < n; i++) {
    pass3[i] = (pass2[i] + pass2[i + 1] + pass2[i + 2]) / 3;
  }

  // LOESS smoothing of pass3
  const x = Array.from({ length: n }, (_, i) => i);
  return loess(x, pass3, lWindow, robustWeights);
}

/**
 * Perform STL Decomposition on a 1D time series
 * 
 * @param {number[]} data - Time series values (evenly spaced)
 * @param {object} options
 * @param {number} options.period - Seasonal period (e.g. 12 for monthly, 7 for weekly)
 * @param {number|'periodic'} [options.seasonalWindow='periodic'] - Window size for seasonal smoothing
 * @param {number} [options.trendWindow] - Window size for trend smoothing
 * @param {number} [options.innerLoops=2] - Number of inner loop iterations
 * @param {number} [options.outerLoops=1] - Number of outer loop (robustness) iterations
 * @param {boolean} [options.multiplicative=false] - Whether to use multiplicative model via log transform
 * 
 * @returns {{ observed: number[], trend: number[], seasonal: number[], residual: number[], adjusted: number[] }}
 */
export function stlDecompose(data, options = {}) {
  const n = data.length;
  if (n === 0) {
    return { observed: [], trend: [], seasonal: [], residual: [], adjusted: [] };
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
  const sWindow = options.seasonalWindow || 'periodic';
  const numSWindow = typeof sWindow === 'number' ? sWindow : 7;
  const defaultTrendWindow = Math.max(period + 1, Math.ceil((1.5 * period) / (1 - 1.5 / Math.max(7, numSWindow))));
  const tWindow = options.trendWindow || (defaultTrendWindow % 2 === 0 ? defaultTrendWindow + 1 : defaultTrendWindow);
  const defaultLowPassWindow = period % 2 === 0 ? period + 1 : period;
  const lWindow = options.lowPassWindow || defaultLowPassWindow;

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

      // Step 2 & 3: Seasonal Component
      if (sWindow === 'periodic') {
        // 固定の季節変動: サブシリーズごとの平均を計算し、全平均を引いて中心化
        const subMeans = new Array(period).fill(0);
        for (let p = 0; p < period; p++) {
          let sumWX = 0, sumW = 0;
          for (let i = p; i < n; i += period) {
            const w = robustWeights[i] || 1;
            sumWX += detrended[i] * w;
            sumW += w;
          }
          subMeans[p] = sumW > 0 ? sumWX / sumW : 0;
        }
        const grandMean = subMeans.reduce((a, b) => a + b, 0) / period;
        for (let i = 0; i < n; i++) {
          seasonal[i] = subMeans[i % period] - grandMean;
        }
      } else {
        // 柔軟モード: 各サブシリーズをLOESSで平滑化し、低周波成分を抽出して減算
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
            const subX = Array.from({ length: subValues.length }, (_, idx) => idx);
            const smoothedSub = loess(subX, subValues, sWindow, subWeights);
            for (let k = 0; k < subIndices.length; k++) {
              rawSeasonal[subIndices[k]] = smoothedSub[k];
            }
          } else if (subValues.length === 1) {
            rawSeasonal[subIndices[0]] = subValues[0];
          }
        }

        // Step 3: Low-pass filtering of seasonal component
        const lowPass = lowPassFilter(rawSeasonal, period, lWindow, robustWeights);
        for (let i = 0; i < n; i++) {
          seasonal[i] = rawSeasonal[i] - lowPass[i];
        }
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
