/**
 * Data Parsing utilities for Excel, CSV, and Copy-Pasted text
 */

/**
 * Parses raw text from copy-paste (TSV or CSV)
 * @param {string} text 
 * @returns {Array<Object>} Parsed row objects
 */
export function parsePastedText(text) {
  if (!text || !text.trim()) return [];

  const lines = text.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('ヘッダー行と少なくとも1行のデータが必要です。');
  }

  // Detect delimiter (Tab or Comma or Semicolon)
  const firstLine = lines[0];
  let delimiter = '\t';
  if (firstLine.includes('\t')) {
    delimiter = '\t';
  } else if (firstLine.includes(',')) {
    delimiter = ',';
  } else if (firstLine.includes(';')) {
    delimiter = ';';
  }

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((header, colIdx) => {
      let val = values[colIdx] !== undefined ? values[colIdx] : '';
      row[header] = val;
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Parses Excel or CSV ArrayBuffer/File object using SheetJS
 * @param {ArrayBuffer} buffer 
 * @returns {Array<Object>} Parsed row objects
 */
export function parseFileBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to JSON row objects
  const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  return rawData;
}

/**
 * Inspects rows to detect time column and available numeric columns
 * @param {Array<Object>} rows 
 * @returns {{ timeCol: string, valueCols: string[] }}
 */
export function detectColumns(rows) {
  if (!rows || rows.length === 0) {
    return { timeCol: '', valueCols: [] };
  }

  const sampleRow = rows[0];
  const keys = Object.keys(sampleRow);

  const timeKeywords = ['date', 'time', 'datetime', '日付', '日時', '時間', '年月', '月', '年', 'day', 'timestamp'];
  let timeCol = '';

  // 1. Try keyword matching for time column
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    if (timeKeywords.some(kw => lowerKey.includes(kw))) {
      timeCol = key;
      break;
    }
  }

  // 2. If no time keyword found, find column with date-like values or string values
  if (!timeCol) {
    for (const key of keys) {
      const sampleVal = String(rows[0][key]);
      if (sampleVal instanceof Date || !isNaN(Date.parse(sampleVal))) {
        timeCol = key;
        break;
      }
    }
  }

  // Fallback to first column if still not found
  if (!timeCol && keys.length > 0) {
    timeCol = keys[0];
  }

  // Detect numeric columns
  const valueCols = [];
  for (const key of keys) {
    if (key === timeCol) continue;
    // Check if at least half of the non-empty rows are valid numbers
    let validCount = 0;
    let totalCount = 0;
    for (let i = 0; i < Math.min(rows.length, 50); i++) {
      const val = rows[i][key];
      if (val !== '' && val !== null && val !== undefined) {
        totalCount++;
        const num = Number(val);
        if (!isNaN(num)) {
          validCount++;
        }
      }
    }
    if (totalCount > 0 && validCount / totalCount >= 0.5) {
      valueCols.push(key);
    }
  }

  // If no numeric column detected, offer all non-time columns
  if (valueCols.length === 0) {
    keys.filter(k => k !== timeCol).forEach(k => valueCols.push(k));
  }

  return { timeCol, valueCols };
}

/**
 * Detects periodicity (seasonal period) using Autocorrelation Function (ACF)
 * @param {number[]} values 
 * @param {string[]} [timestamps]
 * @returns {number} Estimated period (defaults to 12 if undetermined)
 */
export function detectPeriodicity(values, timestamps = []) {
  const n = values.length;
  if (n < 6) return 12; // Default for very short series

  const mean = values.reduce((a, b) => a + b, 0) / n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    variance += (values[i] - mean) * (values[i] - mean);
  }

  if (variance < 1e-12) return 12;

  const maxLag = Math.min(Math.floor(n / 2), 365);
  const acf = new Array(maxLag + 1).fill(0);

  for (let k = 1; k <= maxLag; k++) {
    let num = 0;
    for (let i = 0; i < n - k; i++) {
      num += (values[i] - mean) * (values[i + k] - mean);
    }
    acf[k] = num / variance;
  }

  // Find peaks in ACF (local maxima with positive correlation)
  const peaks = [];
  for (let k = 2; k < maxLag - 1; k++) {
    if (acf[k] > acf[k - 1] && acf[k] > acf[k + 1] && acf[k] > 0.15) {
      peaks.push({ lag: k, corr: acf[k] });
    }
  }

  // Sort peaks by correlation strength
  peaks.sort((a, b) => b.corr - a.corr);

  if (peaks.length > 0) {
    return peaks[0].lag;
  }

  // Fallback heuristic based on timestamps if available
  if (timestamps.length >= 2) {
    const d1 = new Date(timestamps[0]);
    const d2 = new Date(timestamps[1]);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      const diffMs = Math.abs(d2.getTime() - d1.getTime());
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays >= 25 && diffDays <= 32) return 12; // Monthly
      if (diffDays >= 6 && diffDays <= 8) return 52;   // Weekly
      if (diffDays >= 0.8 && diffDays <= 1.2) return 7; // Daily (Week seasonality)
    }
  }

  return 12; // Default fallback
}

/**
 * Interpolates missing dates and linear values in a time series
 * @param {string[]} timestamps 
 * @param {number[]} values 
 * @param {boolean} [enable=true] 
 * @returns {{ timestamps: string[], values: number[], interpolatedCount: number }}
 */
export function interpolateMissingSeries(timestamps, values, enable = true) {
  if (!enable || timestamps.length < 2) {
    return { timestamps: [...timestamps], values: [...values], interpolatedCount: 0 };
  }

  // Parse dates to check if timestamps are valid dates
  const parsedDates = timestamps.map(t => new Date(t));
  const isValidDate = parsedDates.every(d => !isNaN(d.getTime()));

  if (!isValidDate) {
    // If not standard date, return as-is
    return { timestamps: [...timestamps], values: [...values], interpolatedCount: 0 };
  }

  // Calculate median time difference in milliseconds
  const diffs = [];
  for (let i = 1; i < parsedDates.length; i++) {
    const diff = parsedDates[i].getTime() - parsedDates[i - 1].getTime();
    if (diff > 0) diffs.push(diff);
  }

  if (diffs.length === 0) {
    return { timestamps: [...timestamps], values: [...values], interpolatedCount: 0 };
  }

  diffs.sort((a, b) => a - b);
  const medianDiff = diffs[Math.floor(diffs.length / 2)];

  // Threshold to detect gaps (e.g. > 1.5 * medianDiff)
  const gapThreshold = medianDiff * 1.5;

  const newTimestamps = [];
  const newValues = [];
  let interpolatedCount = 0;

  for (let i = 0; i < timestamps.length - 1; i++) {
    const currentDate = parsedDates[i];
    const nextDate = parsedDates[i + 1];
    const val1 = values[i];
    const val2 = values[i + 1];

    newTimestamps.push(timestamps[i]);
    newValues.push(val1);

    const timeGap = nextDate.getTime() - currentDate.getTime();

    if (timeGap > gapThreshold) {
      // Calculate how many steps missing
      const steps = Math.round(timeGap / medianDiff);
      const stepMs = timeGap / steps;

      for (let s = 1; s < steps; s++) {
        const missingTimeMs = currentDate.getTime() + s * stepMs;
        const missingDate = new Date(missingTimeMs);

        // Format date string similar to original
        let dateStr = missingDate.toISOString().split('T')[0];
        if (timestamps[0].includes('/')) {
          dateStr = dateStr.replace(/-/g, '/');
        }

        // Linear interpolation of value
        const interpolatedVal = val1 + (val2 - val1) * (s / steps);

        newTimestamps.push(dateStr);
        newValues.push(interpolatedVal);
        interpolatedCount++;
      }
    }
  }

  // Add last element
  newTimestamps.push(timestamps[timestamps.length - 1]);
  newValues.push(values[values.length - 1]);

  return {
    timestamps: newTimestamps,
    values: newValues,
    interpolatedCount
  };
}

/**
 * Extracts and cleans time-series data for a selected target column
 * @param {Array<Object>} rows 
 * @param {string} timeCol 
 * @param {string} valueCol 
 * @returns {{ timestamps: string[], values: number[] }}
 */
export function extractTimeSeries(rows, timeCol, valueCol) {
  const timestamps = [];
  const values = [];

  rows.forEach(row => {
    let rawTime = row[timeCol];
    let timeStr = '';
    if (rawTime instanceof Date) {
      timeStr = rawTime.toISOString().split('T')[0];
    } else if (rawTime !== undefined && rawTime !== null) {
      timeStr = String(rawTime).trim();
    }

    const rawVal = row[valueCol];
    const val = Number(String(rawVal).replace(/,/g, ''));

    if (timeStr && !isNaN(val)) {
      timestamps.push(timeStr);
      values.push(val);
    }
  });

  return { timestamps, values };
}
