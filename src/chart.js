/**
 * Chart rendering module using Plotly.js with custom titles, change points, and CUSUM analytics
 */

/**
 * Render main Plotly chart based on current display mode and styling options
 * 
 * @param {string} containerId - DOM element ID
 * @param {string[]} timestamps - X-axis timestamps
 * @param {object} stlResult - { observed, trend, seasonal, residual }
 * @param {string} viewMode - 'overlay' | 'adjusted' | 'decomposition' | 'observed' | 'trend' | 'seasonal' | 'residual' | 'cusum'
 * @param {string} varName - Name of the selected variable
 * @param {string} [customTitle] - Custom user title
 * @param {string} [bgMode='dark'] - 'dark' | 'white' | 'transparent'
 * @param {object} [analyticsOptions] - { showChangePoints, showCusumAlerts, changePoints, cusumResult }
 */
export function renderChart(
  containerId,
  timestamps,
  stlResult,
  viewMode,
  varName,
  customTitle = '',
  bgMode = 'dark',
  analyticsOptions = {}
) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Purge previous Plotly instance safely
  try { 
    Plotly.purge(container); 
    container.innerHTML = '';
  } catch (e) {
    console.error('Plotly purge error:', e);
  }

  let { observed, trend, seasonal, residual, adjusted } = stlResult;
  const isMultiplicative = !!(stlResult.isMultiplicative || stlResult._autoDetected === 'multiplicative' ||
    (seasonal && seasonal.length > 0 && Math.abs((seasonal.reduce((a, b) => a + b, 0) / seasonal.length) - 1.0) < 0.3));
  if (!adjusted && observed && seasonal) {
    adjusted = observed.map((obs, i) => (isMultiplicative && seasonal[i] !== 0 ? obs / seasonal[i] : obs - seasonal[i]));
  }

  const {
    showChangePoints = true,
    showCusumAlerts = false,
    changePoints = [],
    cusumResult = null
  } = analyticsOptions;

  // Define palette based on background mode
  const isLight = bgMode === 'white';
  const palette = {
    observed: isLight ? '#0284c7' : '#38bdf8',
    trend: isLight ? '#e11d48' : '#f43f5e',
    seasonal: isLight ? '#059669' : '#10b981',
    residual: isLight ? '#7c3aed' : '#a855f7',
    grid: isLight ? '#e2e8f0' : '#334155',
    text: isLight ? '#0f172a' : '#f8fafc',
    subtext: isLight ? '#475569' : '#94a3b8',
    cardBg: isLight ? '#ffffff' : '#1e293b',
    // Analytics colors
    changePoint: isLight ? '#d97706' : '#fbbf24',
    changePointPeak: isLight ? '#ea580c' : '#f97316',
    changePointTrough: isLight ? '#0284c7' : '#38bdf8',
    cusumPlus: isLight ? '#0284c7' : '#38bdf8',
    cusumMinus: isLight ? '#9333ea' : '#c084fc',
    cusumLimit: isLight ? '#dc2626' : '#ef4444',
    alertShade: isLight ? 'rgba(239, 68, 68, 0.07)' : 'rgba(239, 68, 68, 0.11)',
    alertBorder: isLight ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.4)'
  };

  let paperBg = 'transparent';
  let plotBg = 'transparent';

  if (bgMode === 'white') {
    paperBg = '#ffffff';
    plotBg = '#ffffff';
  } else if (bgMode === 'dark') {
    paperBg = 'transparent';
    plotBg = 'transparent';
  }

  const commonHoverLabel = {
    bgcolor: palette.cardBg,
    bordercolor: palette.grid,
    font: { color: palette.text, family: 'Inter, sans-serif', size: 13 }
  };

  const commonLayout = {
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: { color: palette.text, family: 'Inter, "Noto Sans JP", sans-serif' },
    hoverlabel: commonHoverLabel,
    margin: { t: 90, r: 30, l: 65, b: 65 },
    hovermode: 'x unified',
    autosize: true,
    showlegend: true,
    legend: {
      orientation: 'h',
      yanchor: 'bottom',
      y: 1.02,
      xanchor: 'right',
      x: 1,
      font: { color: palette.text, size: 12 }
    }
  };

  const nPoints = timestamps ? timestamps.length : 0;

  const commonXAxis = {
    gridcolor: palette.grid,
    zerolinecolor: palette.grid,
    tickfont: { color: palette.subtext },
    ...(nPoints > 0 ? {
      range: [-0.5, nPoints - 0.5],
      autorange: false
    } : {})
  };

  const commonYAxis = {
    gridcolor: palette.grid,
    zerolinecolor: palette.grid,
    tickfont: { color: palette.subtext }
  };

  // Determine Title Text
  let titleText = customTitle.trim();
  if (!titleText) {
    if (viewMode === 'overlay') titleText = `元データ と トレンド曲線 (${varName})`;
    else if (viewMode === 'adjusted') titleText = `元データ と 周期調整済データ (${varName})`;
    else if (viewMode === 'decomposition') titleText = `STL分解一覧 - ${varName}`;
    else if (viewMode === 'observed') titleText = `元データ (${varName})`;
    else if (viewMode === 'trend') titleText = `トレンド成分 (${varName})`;
    else if (viewMode === 'seasonal') titleText = `周期変動成分 (${varName})`;
    else if (viewMode === 'residual') titleText = `残差成分 (${varName})`;
    else if (viewMode === 'cusum') titleText = `残差 CUSUM 管理図 (累積和法) - ${varName}`;
  }

  // Helper to build CUSUM Alert shaded bands
  const buildCusumShades = (yRef = 'paper', y0 = 0, y1 = 1, xRef = 'x') => {
    if (!showCusumAlerts || !cusumResult || !cusumResult.anomalies || cusumResult.anomalies.length === 0) {
      return [];
    }
    const shapes = [];
    cusumResult.anomalies.forEach(anom => {
      const startT = anom.startTime;
      const endT = anom.endTime;
      if (startT === endT) {
        // Single-point anomaly: rect with x0 == x1 has 0 width, so draw a vertical marker line
        shapes.push({
          type: 'line',
          xref: xRef,
          yref: yRef,
          x0: startT,
          x1: startT,
          y0: y0,
          y1: y1,
          line: {
            color: palette.cusumLimit,
            width: 2,
            dash: 'dashdot'
          }
        });
      } else {
        shapes.push({
          type: 'rect',
          xref: xRef,
          yref: yRef,
          x0: startT,
          x1: endT,
          y0: y0,
          y1: y1,
          fillcolor: palette.alertShade,
          line: {
            color: palette.alertBorder,
            width: 1,
            dash: 'dot'
          }
        });
      }
    });
    return shapes;
  };

  // Helper to build Change Point vertical markers & lines
  const buildChangePointShapes = (yRef = 'paper', y0 = 0, y1 = 1, xRef = 'x') => {
    if (!showChangePoints || !changePoints || changePoints.length === 0) {
      return [];
    }
    return changePoints.map(cp => ({
      type: 'line',
      xref: xRef,
      yref: yRef,
      x0: cp.timestamp,
      x1: cp.timestamp,
      y0: y0,
      y1: y1,
      line: {
        color: palette.changePoint,
        width: 1.5,
        dash: 'dash'
      }
    }));
  };

  // Helper to build Change Point trace for Scatter
  const buildChangePointTrace = (xRef = 'x', yRef = 'y') => {
    if (!showChangePoints || !changePoints || changePoints.length === 0) {
      return null;
    }
    const totalCount = timestamps.length;
    const textPositions = changePoints.map(cp => {
      const idx = timestamps.indexOf(cp.timestamp);
      if (idx > totalCount * 0.8) return 'top left';
      if (idx < totalCount * 0.15) return 'top right';
      return 'top center';
    });

    return {
      x: changePoints.map(cp => cp.timestamp),
      y: changePoints.map(cp => cp.value),
      type: 'scatter',
      mode: 'markers+text',
      name: '主要な変化点',
      text: changePoints.map(cp => ` ${cp.label}`),
      textposition: textPositions,
      cliponaxis: true,
      textfont: {
        color: palette.changePoint,
        size: 11,
        family: 'Inter, sans-serif'
      },
      marker: {
        size: 10,
        color: palette.changePoint,
        symbol: 'diamond',
        line: {
          color: isLight ? '#ffffff' : '#0f172a',
          width: 1.5
        }
      },
      hoverinfo: 'skip',
      xaxis: xRef,
      yaxis: yRef
    };
  };

  // ==========================================
  // 1. CUSUM Control Chart Mode
  // ==========================================
  if (viewMode === 'cusum') {
    if (!cusumResult) {
      container.innerHTML = '<div class="empty-state"><p>CUSUM計算データがありません</p></div>';
      return;
    }

    const { cusumPlus, cusumMinus, centeredCusum, h, k, sigma } = cusumResult;
    // For intuitive visual inspection, plot CusumPlus as positive and CusumMinus as negative
    const negCusumMinus = cusumMinus.map(v => -v);

    const traces = [
      {
        x: timestamps,
        y: cusumPlus,
        type: 'scatter',
        mode: 'lines',
        name: '上振れ累積和 (C+)',
        line: { color: palette.cusumPlus, width: 2.5 }
      },
      {
        x: timestamps,
        y: negCusumMinus,
        type: 'scatter',
        mode: 'lines',
        name: '下振れ累積和 (-C-)',
        line: { color: palette.cusumMinus, width: 2.5 }
      },
      {
        x: timestamps,
        y: new Array(timestamps.length).fill(h),
        type: 'scatter',
        mode: 'lines',
        name: `管理限界 (+h: ${(h).toFixed(1)})`,
        line: { color: palette.cusumLimit, width: 2, dash: 'dash' },
        hoverinfo: 'skip'
      },
      {
        x: timestamps,
        y: new Array(timestamps.length).fill(-h),
        type: 'scatter',
        mode: 'lines',
        name: `管理限界 (-h: ${(-h).toFixed(1)})`,
        line: { color: palette.cusumLimit, width: 2, dash: 'dash' },
        hoverinfo: 'skip'
      },
      {
        x: timestamps,
        y: new Array(timestamps.length).fill(0),
        type: 'scatter',
        mode: 'lines',
        name: '中心線 (0)',
        line: { color: palette.subtext, width: 1, dash: 'dot' },
        showlegend: false,
        hoverinfo: 'skip'
      }
    ];

    const cusumShapes = [];
    if (showCusumAlerts && cusumResult.anomalies) {
      for (const anom of cusumResult.anomalies) {
        cusumShapes.push({
          type: 'rect',
          xref: 'x',
          yref: 'paper',
          x0: anom.startTime,
          x1: anom.endTime,
          y0: 0,
          y1: 1,
          fillcolor: palette.alertShade,
          line: { color: palette.alertBorder, width: 1, dash: 'dot' }
        });
      }
    }

    const cusumAnnotations = [];
    if (showCusumAlerts && cusumResult.anomalies) {
      const totalCount = timestamps.length;
      for (const anom of cusumResult.anomalies) {
        const isPos = anom.type === 'positive';
        const anomIdx = timestamps.indexOf(anom.startTime);
        const isNearRight = anomIdx > totalCount * 0.65;
        const isNearLeft = anomIdx < totalCount * 0.20;

        let xanchor = 'center';
        let ax = 0;
        if (isNearRight) {
          xanchor = 'right';
          ax = -50;
        } else if (isNearLeft) {
          xanchor = 'left';
          ax = 50;
        }

        cusumAnnotations.push({
          x: anom.startTime,
          y: isPos ? h : -h,
          xref: 'x',
          yref: 'y',
          xanchor: xanchor,
          ax: ax,
          ay: isPos ? -35 : 35,
          text: `⚠️ ${anom.label}`,
          showarrow: true,
          arrowhead: 2,
          arrowsize: 1,
          arrowcolor: palette.cusumLimit,
          font: { color: palette.cusumLimit, size: 11, weight: 600 },
          bgcolor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(15,23,42,0.9)',
          bordercolor: palette.cusumLimit,
          borderwidth: 1,
          borderpad: 4
        });
      }
    }

    const layout = {
      ...commonLayout,
      title: {
        text: titleText,
        font: { size: 16, color: palette.text, weight: 700 },
        x: 0.02,
        xanchor: 'left',
        y: 0.98,
        yanchor: 'top'
      },
      margin: { ...commonLayout.margin, t: 95 },
      xaxis: { ...commonXAxis, title: { text: '日時', font: { color: palette.subtext } } },
      yaxis: { ...commonYAxis, title: { text: '累積偏差 (CUSUM)', font: { color: palette.subtext } } },
      shapes: cusumShapes,
      annotations: cusumAnnotations
    };

    Plotly.newPlot(container, traces, layout, { responsive: true, displayModeBar: true });
    return;
  }

  // ==========================================
  // 2. 4-Subplot Decomposition Mode
  // ==========================================
  if (viewMode === 'decomposition') {
    const traces = [
      {
        x: timestamps,
        y: observed,
        type: 'scatter',
        mode: 'lines',
        name: '元データ (Observed)',
        line: { color: palette.observed, width: 2 },
        xaxis: 'x',
        yaxis: 'y'
      },
      {
        x: timestamps,
        y: trend,
        type: 'scatter',
        mode: 'lines',
        name: 'トレンド (Trend)',
        line: { color: palette.trend, width: 2.5 },
        xaxis: 'x',
        yaxis: 'y2'
      },
      {
        x: timestamps,
        y: seasonal,
        type: 'scatter',
        mode: 'lines',
        name: '周期変動 (Seasonal)',
        line: { color: palette.seasonal, width: 2 },
        xaxis: 'x',
        yaxis: 'y3'
      },
      {
        x: timestamps,
        y: residual,
        type: 'scatter',
        mode: 'lines',
        name: '残差 (Residual)',
        line: { color: palette.residual, width: 1.5 },
        xaxis: 'x',
        yaxis: 'y4'
      }
    ];

    // Add Change Point trace to Trend subplot (y2)
    const cpTrace = buildChangePointTrace('x', 'y2');
    if (cpTrace) {
      traces.push(cpTrace);
    }

    const shapes = [];

    // Trend change point vertical lines on y2
    if (showChangePoints && changePoints.length > 0) {
      shapes.push(...buildChangePointShapes('y2', Math.min(...trend), Math.max(...trend), 'x'));
    }

    // CUSUM alert shades and point markers on Residual subplot (y4)
    if (showCusumAlerts && cusumResult && cusumResult.anomalies) {
      const resMin = Math.min(...residual);
      const resMax = Math.max(...residual);
      shapes.push(...buildCusumShades('y4', resMin, resMax, 'x'));

      // Highlight individual alarm points on y4 (skip hoverinfo so unified hover is preserved)
      const alertX = [];
      const alertY = [];
      for (let i = 0; i < residual.length; i++) {
        if (cusumResult.anomalyIndices && cusumResult.anomalyIndices[i]) {
          alertX.push(timestamps[i]);
          alertY.push(residual[i]);
        }
      }
      if (alertX.length > 0) {
        traces.push({
          x: alertX,
          y: alertY,
          type: 'scatter',
          mode: 'markers',
          name: 'CUSUM異常点',
          marker: {
            size: 6,
            color: palette.cusumLimit,
            symbol: 'circle'
          },
          hoverinfo: 'skip',
          xaxis: 'x',
          yaxis: 'y4'
        });
      }
    }

    const layout = {
      ...commonLayout,
      title: {
        text: titleText,
        font: { size: 16, color: palette.text, weight: 700 },
        x: 0.02,
        xanchor: 'left',
        y: 0.98,
        yanchor: 'top'
      },
      showlegend: false,
      margin: { t: 65, r: 30, l: 65, b: 65 },
      xaxis: {
        ...commonXAxis,
        anchor: 'y4',
        showticklabels: true,
        title: { text: '年月', font: { color: palette.subtext } },
        spikemode: 'across',
        spikethickness: 1,
        spikecolor: palette.grid,
        spikedash: 'dot'
      },
      yaxis: {
        ...commonYAxis,
        domain: [0.78, 1.0],
        title: { text: 'Observed', font: { color: palette.subtext } }
      },
      yaxis2: {
        ...commonYAxis,
        domain: [0.52, 0.74],
        title: { text: 'Trend', font: { color: palette.subtext } }
      },
      yaxis3: {
        ...commonYAxis,
        domain: [0.26, 0.48],
        title: { text: 'Seasonal', font: { color: palette.subtext } }
      },
      yaxis4: {
        ...commonYAxis,
        domain: [0.0, 0.22],
        title: { text: 'Residual', font: { color: palette.subtext } }
      },
      shapes: shapes
    };

    Plotly.newPlot(container, traces, layout, { responsive: true, displayModeBar: true });
    return;
  }

  // ==========================================
  // 3. Single or Overlay Chart
  // ==========================================
  let traces = [];
  const shapes = [];
  const annotations = [];

  if (viewMode === 'overlay') {
    traces = [
      {
        x: timestamps,
        y: observed,
        type: 'scatter',
        mode: 'lines',
        name: '元データ (Observed)',
        line: { color: palette.observed, width: 1.5, opacity: 0.65 }
      },
      {
        x: timestamps,
        y: trend,
        type: 'scatter',
        mode: 'lines',
        name: 'トレンド (Trend)',
        line: { color: palette.trend, width: 3 }
      }
    ];

    // Overlay Change Points
    if (showChangePoints && changePoints.length > 0) {
      const cpTrace = buildChangePointTrace();
      if (cpTrace) traces.push(cpTrace);
      shapes.push(...buildChangePointShapes());
    }

    // Overlay CUSUM Shading
    if (showCusumAlerts && cusumResult && cusumResult.hasAnomaly) {
      shapes.push(...buildCusumShades());
      const totalCount = timestamps.length;
      for (const anom of cusumResult.anomalies) {
        const anomIdx = timestamps.indexOf(anom.startTime);
        const isNearRight = anomIdx > totalCount * 0.65;
        const isNearLeft = anomIdx < totalCount * 0.15;
        const xanchor = isNearRight ? 'right' : (isNearLeft ? 'left' : 'center');

        annotations.push({
          x: anom.startTime,
          y: 1,
          xref: 'x',
          yref: 'paper',
          xanchor: xanchor,
          text: `⚠️ CUSUM異常`,
          showarrow: false,
          font: { color: palette.cusumLimit, size: 10, weight: 600 },
          bgcolor: isLight ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)',
          bordercolor: palette.cusumLimit,
          borderwidth: 1,
          borderpad: 2
        });
      }
    }
  } else if (viewMode === 'adjusted') {
    traces = [
      {
        x: timestamps,
        y: observed,
        type: 'scatter',
        mode: 'lines',
        name: '元データ (Observed)',
        line: { color: palette.observed, width: 1.5, opacity: 0.5 }
      },
      {
        x: timestamps,
        y: adjusted,
        type: 'scatter',
        mode: 'lines',
        name: '周期調整済データ (Adjusted)',
        line: { color: palette.residual, width: 2.5 }
      }
    ];
    if (showChangePoints && changePoints.length > 0) {
      shapes.push(...buildChangePointShapes());
    }
  } else if (viewMode === 'observed') {
    traces = [{
      x: timestamps,
      y: observed,
      type: 'scatter',
      mode: 'lines',
      name: '元データ',
      line: { color: palette.observed, width: 2 }
    }];
  } else if (viewMode === 'trend') {
    traces = [{
      x: timestamps,
      y: trend,
      type: 'scatter',
      mode: 'lines',
      name: 'トレンド',
      line: { color: palette.trend, width: 3 }
    }];
    if (showChangePoints && changePoints.length > 0) {
      const cpTrace = buildChangePointTrace();
      if (cpTrace) traces.push(cpTrace);
      shapes.push(...buildChangePointShapes());
    }
  } else if (viewMode === 'seasonal') {
    traces = [{
      x: timestamps,
      y: seasonal,
      type: 'scatter',
      mode: 'lines',
      name: '周期変動',
      line: { color: palette.seasonal, width: 2 }
    }];
  } else if (viewMode === 'residual') {
    traces = [{
      x: timestamps,
      y: residual,
      type: 'scatter',
      mode: 'lines',
      name: '残差',
      line: { color: palette.residual, width: 1.5 }
    }];
    // Highlight CUSUM Anomaly periods in residual chart
    if (showCusumAlerts && cusumResult && cusumResult.hasAnomaly) {
      shapes.push(...buildCusumShades());
      // Also highlight points that triggered alarms
      const alertX = [];
      const alertY = [];
      for (let i = 0; i < residual.length; i++) {
        if (cusumResult.anomalyIndices[i]) {
          alertX.push(timestamps[i]);
          alertY.push(residual[i]);
        }
      }
      if (alertX.length > 0) {
        traces.push({
          x: alertX,
          y: alertY,
          type: 'scatter',
          mode: 'markers',
          name: 'CUSUM異常点 (限界超過)',
          marker: {
            size: 8,
            color: palette.cusumLimit,
            symbol: 'circle'
          },
          hoverinfo: 'skip'
        });
      }
    }
  }

  const layout = {
    ...commonLayout,
    title: {
      text: titleText,
      font: { size: 16, color: palette.text, weight: 700 },
      x: 0.02,
      xanchor: 'left',
      y: 0.98,
      yanchor: 'top'
    },
    margin: { ...commonLayout.margin, t: 90 },
    xaxis: commonXAxis,
    yaxis: commonYAxis,
    shapes: shapes,
    annotations: annotations
  };

  Plotly.newPlot(container, traces, layout, { responsive: true, displayModeBar: true });
}

/**
 * Export high-resolution PNG image for document usage
 * 
 * @param {string} containerId 
 * @param {string} filename 
 */
export function downloadChartImage(containerId, filename = 'stl_chart.png') {
  const container = document.getElementById(containerId);
  if (!container) return;

  Plotly.downloadImage(container, {
    format: 'png',
    width: 1400,
    height: 800,
    filename: filename
  });
}
