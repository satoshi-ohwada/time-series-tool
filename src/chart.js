/**
 * Chart rendering module using Plotly.js with custom titles and document export styles
 */

/**
 * Render main Plotly chart based on current display mode and styling options
 * 
 * @param {string} containerId - DOM element ID
 * @param {string[]} timestamps - X-axis timestamps
 * @param {object} stlResult - { observed, trend, seasonal, residual }
 * @param {string} viewMode - 'overlay' | 'decomposition' | 'observed' | 'trend' | 'seasonal' | 'residual'
 * @param {string} varName - Name of the selected variable
 * @param {string} [customTitle] - Custom user title
 * @param {string} [bgMode='dark'] - 'dark' | 'white' | 'transparent'
 */
export function renderChart(containerId, timestamps, stlResult, viewMode, varName, customTitle = '', bgMode = 'dark') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Plotlyのサブプロット構成変更によるクラッシュを防ぐため、安全にpurgeする
  try { 
    Plotly.purge(container); 
    container.innerHTML = ''; // さらにDOMも強制クリアして確実に初期化
  } catch (e) {
    console.error('Plotly purge error:', e);
  }

  let { observed, trend, seasonal, residual, adjusted } = stlResult;
  // キャッシュが残っていて adjusted が計算されていない環境への安全なフォールバック
  if (!adjusted && observed && seasonal) {
    adjusted = observed.map((obs, i) => obs - seasonal[i]);
  }

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
    cardBg: isLight ? '#ffffff' : '#1e293b'
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
    margin: { t: 50, r: 30, l: 65, b: 80 },
    hovermode: 'x unified',
    autosize: true,
    showlegend: true,
    legend: {
      orientation: 'h',
      yanchor: 'bottom',
      y: 1.02,
      xanchor: 'right',
      x: 1,
      font: { color: palette.text }
    }
  };

  const commonXAxis = {
    gridcolor: palette.grid,
    zerolinecolor: palette.grid,
    tickfont: { color: palette.subtext }
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
  }

  if (viewMode === 'decomposition') {
    // 4-subplot stacked layout
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
        xaxis: 'x2',
        yaxis: 'y2'
      },
      {
        x: timestamps,
        y: seasonal,
        type: 'scatter',
        mode: 'lines',
        name: '周期変動 (Seasonal)',
        line: { color: palette.seasonal, width: 2 },
        xaxis: 'x3',
        yaxis: 'y3'
      },
      {
        x: timestamps,
        y: residual,
        type: 'scatter',
        mode: 'lines',
        name: '残差 (Residual)',
        line: { color: palette.residual, width: 1.5 },
        xaxis: 'x4',
        yaxis: 'y4'
      }
    ];

    const layout = {
      ...commonLayout,
      title: { text: titleText, font: { size: 17, color: palette.text, weight: 700 } },
      grid: { rows: 4, columns: 1, sharex: true },
      showlegend: false,
      margin: { t: 60, r: 30, l: 65, b: 70 },
      xaxis: { ...commonXAxis, anchor: 'y', showticklabels: false },
      yaxis: { ...commonYAxis, title: { text: 'Observed', font: { color: palette.subtext } } },
      xaxis2: { ...commonXAxis, anchor: 'y2', showticklabels: false },
      yaxis2: { ...commonYAxis, title: { text: 'Trend', font: { color: palette.subtext } } },
      xaxis3: { ...commonXAxis, anchor: 'y3', showticklabels: false },
      yaxis3: { ...commonYAxis, title: { text: 'Seasonal', font: { color: palette.subtext } } },
      xaxis4: { ...commonXAxis, anchor: 'y4', showticklabels: true },
      yaxis4: { ...commonYAxis, title: { text: 'Residual', font: { color: palette.subtext } } }
    };

    Plotly.newPlot(container, traces, layout, { responsive: true, displayModeBar: true });
    return;
  }

  // Single or Overlay Chart
  let traces = [];

  if (viewMode === 'overlay') {
    traces = [
      {
        x: timestamps,
        y: observed,
        type: 'scatter',
        mode: 'lines',
        name: '元データ (Observed)',
        line: { color: palette.observed, width: 1.5, opacity: 0.7 }
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
  }

  const layout = {
    ...commonLayout,
    title: { text: titleText, font: { size: 17, color: palette.text, weight: 700 } },
    xaxis: commonXAxis,
    yaxis: commonYAxis
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
