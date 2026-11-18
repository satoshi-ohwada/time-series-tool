/**
 * Interactive Data Table Viewer & Editor module with Pagination
 */

let currentTablePage = 1;
const PAGE_SIZE = 50;

/**
 * Render editable table from raw row objects with pagination
 * 
 * @param {string} containerId - Container DOM element ID
 * @param {Array<Object>} rows - Raw data row objects
 * @param {function} onChangeCallback - Called when data is edited or deleted
 * @param {number} [targetPage=null] - Optional page number to jump to
 */
export function renderTableEditor(containerId, rows, onChangeCallback, targetPage = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>表示できるデータがありません。</p></div>';
    return;
  }

  const columns = Object.keys(rows[0]);
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  if (targetPage !== null) {
    currentTablePage = Math.max(1, Math.min(targetPage, totalPages));
  } else {
    currentTablePage = Math.max(1, Math.min(currentTablePage, totalPages));
  }

  const startIdx = (currentTablePage - 1) * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, totalRows);
  const pageRows = rows.slice(startIdx, endIdx);

  const isFirstPage = currentTablePage <= 1;
  const isLastPage = currentTablePage >= totalPages;

  let html = `
    <div class="table-toolbar">
      <div class="table-info-group">
        <span class="table-info">全 <strong>${totalRows.toLocaleString()}</strong> 行 / <strong>${columns.length}</strong> 列</span>
        ${totalRows > PAGE_SIZE ? `<span class="table-range">(${startIdx + 1} - ${endIdx} 行を表示中)</span>` : ''}
      </div>
      
      ${totalPages > 1 ? `
        <div class="table-pagination">
          <button id="tableFirstBtn" class="btn btn-xs btn-outline" ${isFirstPage ? 'disabled' : ''} title="最初のページ">«</button>
          <button id="tablePrevBtn" class="btn btn-xs btn-outline" ${isFirstPage ? 'disabled' : ''} title="前のページ">‹ 前へ</button>
          <span class="table-page-indicator">
            <input type="number" id="tablePageInput" class="table-page-input" value="${currentTablePage}" min="1" max="${totalPages}" />
            / ${totalPages} ページ
          </span>
          <button id="tableNextBtn" class="btn btn-xs btn-outline" ${isLastPage ? 'disabled' : ''} title="次のページ">次へ ›</button>
          <button id="tableLastBtn" class="btn btn-xs btn-outline" ${isLastPage ? 'disabled' : ''} title="最後のページ">»</button>
        </div>
      ` : ''}

      <div class="table-actions">
        <button id="addRowBtn" class="btn btn-sm btn-outline">＋ 行を追加</button>
      </div>
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

  pageRows.forEach((row, localIndex) => {
    const globalRowIndex = startIdx + localIndex;
    html += `<tr data-row="${globalRowIndex}">`;
    html += `<td class="row-num-col">${globalRowIndex + 1}</td>`;

    columns.forEach(col => {
      const val = row[col] !== undefined && row[col] !== null ? String(row[col]) : '';
      html += `
        <td class="cell-editable" data-row="${globalRowIndex}" data-col="${escapeHtml(col)}">
          <input type="text" class="cell-input" value="${escapeHtml(val)}" data-row="${globalRowIndex}" data-col="${escapeHtml(col)}">
        </td>
      `;
    });

    html += `
      <td class="action-col">
        <button class="btn-delete-row" data-row="${globalRowIndex}" title="この行を削除">🗑️</button>
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
      const rIdx = parseInt(e.target.dataset.row, 10);
      const colName = e.target.dataset.col;
      rows[rIdx][colName] = e.target.value;
      if (onChangeCallback) onChangeCallback(rows);
    });
  });

  // Add Delete Row Listeners
  const deleteBtns = container.querySelectorAll('.btn-delete-row');
  deleteBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rIdx = parseInt(e.target.dataset.row, 10);
      rows.splice(rIdx, 1);
      const newTotalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      if (currentTablePage > newTotalPages) {
        currentTablePage = newTotalPages;
      }
      renderTableEditor(containerId, rows, onChangeCallback, currentTablePage);
      if (onChangeCallback) onChangeCallback(rows);
    });
  });

  // Add Row Listener
  const addRowBtn = container.querySelector('#addRowBtn');
  if (addRowBtn) {
    addRowBtn.addEventListener('click', () => {
      const newRow = {};
      columns.forEach(col => newRow[col] = '');
      rows.push(newRow);
      const newTotalPages = Math.ceil(rows.length / PAGE_SIZE);
      currentTablePage = newTotalPages;
      renderTableEditor(containerId, rows, onChangeCallback, currentTablePage);
      if (onChangeCallback) onChangeCallback(rows);
    });
  }

  // Pagination Listeners
  const firstBtn = container.querySelector('#tableFirstBtn');
  if (firstBtn) {
    firstBtn.addEventListener('click', () => {
      renderTableEditor(containerId, rows, onChangeCallback, 1);
    });
  }

  const prevBtn = container.querySelector('#tablePrevBtn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      renderTableEditor(containerId, rows, onChangeCallback, currentTablePage - 1);
    });
  }

  const nextBtn = container.querySelector('#tableNextBtn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      renderTableEditor(containerId, rows, onChangeCallback, currentTablePage + 1);
    });
  }

  const lastBtn = container.querySelector('#tableLastBtn');
  if (lastBtn) {
    lastBtn.addEventListener('click', () => {
      renderTableEditor(containerId, rows, onChangeCallback, totalPages);
    });
  }

  const pageInput = container.querySelector('#tablePageInput');
  if (pageInput) {
    pageInput.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val)) {
        renderTableEditor(containerId, rows, onChangeCallback, val);
      }
    });
    pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
          renderTableEditor(containerId, rows, onChangeCallback, val);
        }
      }
    });
  }
}

function escapeHtml(str) {
  return String(str !== undefined && str !== null ? str : '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
