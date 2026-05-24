// gdp-pagination.js — Paginacao reutilizavel para todas as tabelas do GDP [Story 4.70]
// Uso: const paged = gdpPaginate(filtered, 'minha-secao');
//      tbody.innerHTML = paged.items.map(...).join('');
//      gdpRenderPageControls('minha-secao', paged.total, paged.page, paged.pageSize, renderMinhaSecao);

var _gdpPageState = {};
var GDP_PAGE_SIZE = 50;

function gdpPaginate(items, sectionId) {
  if (!_gdpPageState[sectionId]) _gdpPageState[sectionId] = 1;
  var page = _gdpPageState[sectionId];
  var total = items.length;
  var totalPages = Math.ceil(total / GDP_PAGE_SIZE) || 1;
  if (page > totalPages) { page = 1; _gdpPageState[sectionId] = 1; }
  var start = (page - 1) * GDP_PAGE_SIZE;
  var paged = items.slice(start, start + GDP_PAGE_SIZE);
  return { items: paged, page: page, pageSize: GDP_PAGE_SIZE, total: total, totalPages: totalPages };
}

function gdpSetPage(sectionId, page, renderFn) {
  _gdpPageState[sectionId] = page;
  if (typeof renderFn === 'function') renderFn();
}

function gdpResetPage(sectionId) {
  _gdpPageState[sectionId] = 1;
}

function gdpRenderPageControls(containerId, total, currentPage, pageSize, renderFn, sectionId) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var totalPages = Math.ceil(total / pageSize) || 1;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  var html = '<div style="display:flex;align-items:center;gap:6px;justify-content:center;padding:6px 0;font-size:.8rem">';

  // Botao anterior
  if (currentPage > 1) {
    html += '<button onclick="gdpSetPage(\'' + sectionId + '\',' + (currentPage - 1) + ',' + renderFn.name + ')" style="padding:2px 8px;border:1px solid var(--bdr,#334155);border-radius:4px;background:var(--s1,#1e293b);color:var(--txt,#f1f5f9);cursor:pointer;font-size:.78rem">&laquo;</button>';
  }

  // Numeros de pagina
  var startPage = Math.max(1, currentPage - 3);
  var endPage = Math.min(totalPages, currentPage + 3);
  if (startPage > 1) html += '<span style="color:var(--mut,#94a3b8)">...</span>';
  for (var p = startPage; p <= endPage; p++) {
    if (p === currentPage) {
      html += '<span style="padding:2px 8px;border-radius:4px;background:var(--blue,#3b82f6);color:#fff;font-weight:700;font-size:.78rem">' + p + '</span>';
    } else {
      html += '<button onclick="gdpSetPage(\'' + sectionId + '\',' + p + ',' + renderFn.name + ')" style="padding:2px 8px;border:1px solid var(--bdr,#334155);border-radius:4px;background:var(--s1,#1e293b);color:var(--txt,#f1f5f9);cursor:pointer;font-size:.78rem">' + p + '</button>';
    }
  }
  if (endPage < totalPages) html += '<span style="color:var(--mut,#94a3b8)">...</span>';

  // Botao proximo
  if (currentPage < totalPages) {
    html += '<button onclick="gdpSetPage(\'' + sectionId + '\',' + (currentPage + 1) + ',' + renderFn.name + ')" style="padding:2px 8px;border:1px solid var(--bdr,#334155);border-radius:4px;background:var(--s1,#1e293b);color:var(--txt,#f1f5f9);cursor:pointer;font-size:.78rem">&raquo;</button>';
  }

  html += '<span style="color:var(--mut,#94a3b8);margin-left:8px">' + total + ' itens | Pag ' + currentPage + '/' + totalPages + '</span>';
  html += '</div>';
  container.innerHTML = html;
}
