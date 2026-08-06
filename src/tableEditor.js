/**
 * Interactive Data Table Viewer & Editor module
 */

/**
 * Render editable table from raw row objects
 * 
 * @param {string} containerId - Container DOM element ID
 * @param {Array<Object>} rows - Raw data row objects
 * @param {function} onChangeCallback - Called when data is edited or deleted
 */
export function renderTableEditor(containerId, rows, onChangeCallback) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>表示できるデータがありません。</p></div>';
    return;
  }

  const columns = Object.keys(rows[0]);

  let html = `
    <div class="table-toolbar">
      <span class="table-info">全 <strong>${rows.length}</strong> 行 / <strong>${columns.length}</strong> 列</span>
      <button id="addRowBtn" class="btn btn-sm btn-outline">＋ 行を追加</button>
    </div>
    <div class="table-scroll-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th class="row-num-col">#</th>
            ${columns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}
            <th class="action-col">操作</th>
          </tr>
        </thead>
        <tbody>
  `;

  rows.forEach((row, rowIndex) => {
    html += `<tr data-row="${rowIndex}">`;
    html += `<td class="row-num-col">${rowIndex + 1}</td>`;

    columns.forEach(col => {
      const val = row[col] !== undefined && row[col] !== null ? String(row[col]) : '';
      html += `
        <td class="cell-editable" data-row="${rowIndex}" data-col="${escapeHtml(col)}">
          <input type="text" class="cell-input" value="${escapeHtml(val)}" data-row="${rowIndex}" data-col="${escapeHtml(col)}">
        </td>
      `;
    });

    html += `
      <td class="action-col">
        <button class="btn-delete-row" data-row="${rowIndex}" title="この行を削除">🗑️</button>
      </td>
    `;
    html += `</tr>`;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;

  // Add Event Listeners for inputs
  const inputs = container.querySelectorAll('.cell-input');
  inputs.forEach(input => {
    input.addEventListener('change', (e) => {
      const rIdx = parseInt(e.target.dataset.row);
      const colName = e.target.dataset.col;
      rows[rIdx][colName] = e.target.value;
      if (onChangeCallback) onChangeCallback(rows);
    });
  });

  // Add Delete Row Listeners
  const deleteBtns = container.querySelectorAll('.btn-delete-row');
  deleteBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rIdx = parseInt(e.target.dataset.row);
      rows.splice(rIdx, 1);
      renderTableEditor(containerId, rows, onChangeCallback);
      if (onChangeCallback) onChangeCallback(rows);
    });
  });

  // Add Row Listener
  const addRowBtn = container.getElementById ? container.getElementById('addRowBtn') : container.querySelector('#addRowBtn');
  if (addRowBtn) {
    addRowBtn.addEventListener('click', () => {
      const newRow = {};
      columns.forEach(col => newRow[col] = '');
      rows.push(newRow);
      renderTableEditor(containerId, rows, onChangeCallback);
      if (onChangeCallback) onChangeCallback(rows);
    });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
