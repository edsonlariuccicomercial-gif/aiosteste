// ===== USUARIOS (ESCOLAS) =====
const USUARIOS_KEY = "gdp.usuarios.v1";
let usuarios = [];
let clienteMenuAtualId = null;
let clienteDetalheAtualId = null;

function loadUsuarios() {
  try { usuarios = JSON.parse(localStorage.getItem(USUARIOS_KEY)) || []; } catch(_) { usuarios = []; }
}
function saveUsuarios() {
  localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuarios));
  schedulCloudSync();
}

function getClienteById(id) {
  return usuarios.find((item) => item.id === id) || null;
}

function getPedidosDoCliente(cliente) {
  if (!cliente) return [];
  const contratosCliente = new Set(cliente.contratos_vinculados || []);
  return pedidos.filter((pedido) => {
    const pedidoClienteNome = (pedido.cliente?.nome || pedido.escola || "").trim().toLowerCase();
    const clienteNome = (cliente.nome || "").trim().toLowerCase();
    return (pedido.contratoId && contratosCliente.has(pedido.contratoId)) || (clienteNome && pedidoClienteNome === clienteNome);
  }).sort((a, b) => new Date(b.dataEntrega || b.data || 0) - new Date(a.dataEntrega || a.data || 0));
}

function renderUsuarios() {
  const busca = (document.getElementById("busca-usuario").value || "").toLowerCase();
  const filtered = usuarios.filter(u => {
    return !busca || (u.nome||'').toLowerCase().includes(busca) || (u.cnpj||'').includes(busca) || (u.email||'').toLowerCase().includes(busca) || (u.municipio||'').toLowerCase().includes(busca);
  });

  // Update tab count to reflect filtered results
  document.getElementById("tab-count-usuarios").textContent = filtered.length;

  const tbody = document.getElementById("usuarios-tbody");
  const empty = document.getElementById("usuarios-empty");

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    atualizarSelecaoClientes();
    return;
  }
  empty.classList.add("hidden");

  tbody.innerHTML = filtered.map(u => `<tr>
    <td class="text-center"><input type="checkbox" class="cliente-chk" value="${u.id}" onchange="atualizarSelecaoClientes()"></td>
    <td class="text-center"><button class="btn btn-outline btn-sm" onclick="abrirMenuCliente('${u.id}')" title="Abrir menu do cliente" style="min-width:auto;padding:.2rem .5rem;font-weight:700">...</button></td>
    <td><button onclick="abrirDetalheCliente('${u.id}')" style="background:none;border:none;padding:0;color:var(--blue);font-weight:700;cursor:pointer;text-align:left">${esc(u.nome)}</button></td>
    <td class="font-mono" style="font-size:.8rem">${esc(u.cnpj)}</td>
    <td>${esc(u.municipio)}</td>
    <td style="font-size:.8rem">${esc(u.email)}</td>
    <td style="font-size:.8rem">${esc(u.telefone)}</td>
    <td class="font-mono">${esc(u.login)}</td>
  </tr>`).join("");
  atualizarSelecaoClientes();
}

function toggleSelectAllClientes(checked) {
  document.querySelectorAll('.cliente-chk').forEach(cb => cb.checked = checked);
  atualizarSelecaoClientes();
}

function atualizarSelecaoClientes() {
  const all = [...document.querySelectorAll('.cliente-chk')];
  const selected = all.filter(cb => cb.checked);
  const bulk = document.getElementById("clientes-bulk-actions");
  const summary = document.getElementById("clientes-bulk-summary");
  const selectAll = document.getElementById("clientes-select-all");
  if (selectAll) {
    selectAll.checked = all.length > 0 && selected.length === all.length;
    selectAll.indeterminate = selected.length > 0 && selected.length < all.length;
  }
  if (summary) summary.textContent = `${selected.length} cadastro(s) selecionado(s)`;
  if (bulk) bulk.classList.toggle("hidden", selected.length === 0);
}

function excluirClientesSelecionados() {
  const sel = [...document.querySelectorAll('.cliente-chk:checked')].map(cb => cb.value);
  if (sel.length === 0) { showToast("Selecione clientes para excluir.", 3000); return; }
  if (!confirm(`Excluir ${sel.length} cliente(s) selecionado(s)?`)) return;
  usuarios = usuarios.filter(u => !sel.includes(u.id));
  saveUsuarios();
  renderUsuarios();
  showToast(`${sel.length} cliente(s) excluído(s).`);
}

function novoUsuario() {
  clienteDetalheAtualId = null;
  renderFormUsuario(null);
  document.getElementById("modal-usuario").classList.remove("hidden");
}

function editarUsuario(id) {
  const u = usuarios.find(x => x.id === id);
  if (!u) return;
  clienteDetalheAtualId = id;
  renderFormUsuario(u);
  document.getElementById("modal-usuario").classList.remove("hidden");
}

function renderFormUsuario(u, draft = {}) {
  const dataBase = { ...(draft || {}), ...(u || {}) };
  const isEdit = !!u;
  document.getElementById("modal-usuario-titulo").textContent = isEdit ? "Editar Cliente" : "Cadastrar Cliente";
  document.getElementById("modal-usuario-editar-btn").classList.add("hidden");

  // Build contract checkboxes
  const vinculados = dataBase?.contratos_vinculados || [];
  const contratosOpts = contratos.map(c => {
    const checked = vinculados.includes(c.id) ? 'checked' : '';
    const label = c.id + ' — ' + esc(c.escola.length > 45 ? c.escola.slice(0,43)+'...' : c.escola);
    return '<label style="display:flex;align-items:center;gap:.5rem;font-size:.82rem;padding:.3rem 0;cursor:pointer"><input type="checkbox" class="usr-contrato-chk" value="' + c.id + '" ' + checked + '> ' + label + '</label>';
  }).join("");
  const contratosSection = contratos.length > 0
    ? '<div style="max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:.5rem .8rem;background:var(--surface)">' + contratosOpts + '</div>'
    : '<div style="color:var(--mut);font-size:.82rem">Nenhum contrato importado ainda.</div>';

  document.getElementById("modal-usuario-body").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Nome do Cliente</label><input type="text" id="usr-nome" value="${esc(dataBase?.nome||'')}" style="width:100%"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">CNPJ</label><input type="text" id="usr-cnpj" value="${esc(dataBase?.cnpj||'')}" style="width:100%"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Inscricao Estadual</label><input type="text" id="usr-ie" value="${esc(dataBase?.ie||'ISENTO')}" style="width:100%"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Contribuinte ICMS</label><select id="usr-contribuinte-icms" style="width:100%"><option value="9"${(dataBase?.contribuinte_icms||dataBase?.sre||'9')==='9'?' selected':''}>9 - Nao Contribuinte</option><option value="1"${(dataBase?.contribuinte_icms||'')==='1'?' selected':''}>1 - Contribuinte ICMS</option><option value="2"${(dataBase?.contribuinte_icms||'')==='2'?' selected':''}>2 - Contribuinte isento de Inscricao</option></select></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Email</label><input type="text" id="usr-email" value="${esc(dataBase?.email||'')}" style="width:100%"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Telefone</label><input type="text" id="usr-telefone" value="${esc(dataBase?.telefone||'')}" style="width:100%"></div>
    </div>
    <input type="hidden" id="usr-responsavel" value="${esc(dataBase?.responsavel||'')}">
    <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--brd,#475569)">
      <div style="font-size:.8rem;font-weight:700;margin-bottom:.8rem;color:var(--acc,#3b82f6)">Endereco (para NF-e)</div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:1rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Logradouro</label><input type="text" id="usr-logradouro" value="${esc(dataBase?.logradouro||'')}" placeholder="Rua, Av, Pca..." style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Numero</label><input type="text" id="usr-numero" value="${esc(dataBase?.numero||'')}" placeholder="S/N" style="width:100%"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:.5rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Complemento</label><input type="text" id="usr-complemento" value="${esc(dataBase?.complemento||'')}" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Bairro</label><input type="text" id="usr-bairro" value="${esc(dataBase?.bairro||'')}" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">CEP</label><input type="text" id="usr-cep" value="${esc(dataBase?.cep||'')}" placeholder="00000-000" style="width:100%"></div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:1rem;margin-top:.5rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Municipio</label><input type="text" id="usr-municipio" value="${esc(dataBase?.municipio||'')}" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">UF</label><input type="text" id="usr-uf" value="${esc(dataBase?.uf||'MG')}" maxlength="2" style="width:100%"></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem">
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Login</label><input type="text" id="usr-login" value="${esc(dataBase?.login||'')}" style="width:100%"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Senha</label><input type="text" id="usr-senha" value="${esc(dataBase?.senha||'escola2025')}" style="width:100%"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">ARP Vinculada</label><input type="text" id="usr-arp" value="${esc(dataBase?.arp_vinculada||'ARP-LARIUCCI-2025')}" style="width:100%"></div>
      <div></div>
    </div>
    <input type="hidden" id="usr-cargo" value="${esc(dataBase?.cargo||'')}">
    <input type="hidden" id="usr-catalogo" value="${esc(dataBase?.categoria_catalogo||'')}">
    <input type="hidden" id="usr-saldo-total" value="${dataBase?.saldo_total||0}">
    <input type="hidden" id="usr-saldo-disp" value="${dataBase?.saldo_disponivel||0}">
    <div style="margin-top:1.5rem;display:flex;gap:.8rem;justify-content:flex-end">
      <button class="btn btn-outline" onclick="fecharModalUsuario()">Cancelar</button>
      <button class="btn btn-green" onclick="salvarUsuario('${isEdit ? u.id : ''}')">${isEdit ? 'Salvar' : 'Cadastrar'}</button>
    </div>
  `;
}

function salvarUsuario(editId) {
  const nome = document.getElementById("usr-nome").value.trim();
  const login = document.getElementById("usr-login").value.trim();
  if (!nome || !login) { showToast("Nome e Login sao obrigatorios.", 3000); return; }

  const data = {
    nome: nome,
    cnpj: document.getElementById("usr-cnpj").value.trim(),
    municipio: document.getElementById("usr-municipio").value.trim(),
    contribuinte_icms: document.getElementById("usr-contribuinte-icms").value,
    responsavel: document.getElementById("usr-responsavel").value.trim(),
    cargo: document.getElementById("usr-cargo").value.trim(),
    email: document.getElementById("usr-email").value.trim(),
    telefone: document.getElementById("usr-telefone").value.trim(),
    logradouro: document.getElementById("usr-logradouro").value.trim(),
    numero: document.getElementById("usr-numero").value.trim(),
    complemento: document.getElementById("usr-complemento").value.trim(),
    bairro: document.getElementById("usr-bairro").value.trim(),
    cep: document.getElementById("usr-cep").value.trim(),
    uf: document.getElementById("usr-uf").value.trim() || "MG",
    ie: document.getElementById("usr-ie").value.trim() || "ISENTO",
    login: login,
    senha: document.getElementById("usr-senha").value.trim() || 'escola2025',
    categoria_catalogo: document.getElementById("usr-catalogo").value.trim(),
    arp_vinculada: document.getElementById("usr-arp").value.trim(),
    saldo_total: parseFloat(document.getElementById("usr-saldo-total").value) || 0,
    saldo_disponivel: parseFloat(document.getElementById("usr-saldo-disp").value) || 0,
    contratos_vinculados: [...document.querySelectorAll(".usr-contrato-chk:checked")].map(cb => cb.value)
  };

  if (editId) {
    const u = usuarios.find(x => x.id === editId);
    if (u) Object.assign(u, data);
  } else {
    data.id = login.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    usuarios.push(data);
  }

  saveUsuarios();
  fecharModalUsuario();
  renderUsuarios();
  if (pendingContratoDraft) {
    pendingContratoDraft = { ...pendingContratoDraft, escola: data.nome };
    switchTab("contratos");
    novoContratoManual();
    showToast("Cliente cadastrado. Revise e confirme o contrato.", 3500);
    return;
  }
  showToast(editId ? "Cliente atualizado!" : "Cliente cadastrado!");
}

function excluirUsuario(id) {
  if (!confirm("Excluir este cadastro?")) return;
  usuarios = usuarios.filter(u => u.id !== id);
  saveUsuarios();
  renderUsuarios();
  fecharMenuCliente();
  if (clienteDetalheAtualId === id) fecharModalUsuario();
  showToast("Cadastro excluido.");
}

function abrirDetalheCliente(id) {
  const cliente = getClienteById(id);
  if (!cliente) return;
  clienteDetalheAtualId = id;
  const ultimosPedidos = getPedidosDoCliente(cliente).slice(0, 5);
  const vinculados = (cliente.contratos_vinculados || []).map((contratoId) => {
    const contrato = contratos.find((item) => item.id === contratoId);
    return contrato ? `<span style="display:inline-flex;align-items:center;padding:.3rem .55rem;border-radius:999px;background:var(--s1);border:1px solid var(--bdr);font-size:.76rem">${esc(contrato.id)}${contrato.processo ? ` • ${esc(contrato.processo)}` : ''}</span>` : '';
  }).filter(Boolean).join('');

  document.getElementById("modal-usuario-titulo").textContent = "Cadastro do Cliente";
  document.getElementById("modal-usuario-editar-btn").classList.remove("hidden");
  document.getElementById("modal-usuario-body").innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin-bottom:1.25rem">
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Cliente</div><div style="font-weight:700;font-size:1.1rem">${esc(cliente.nome || '-')}</div></div>
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">CNPJ</div><div class="font-mono" style="font-weight:700">${esc(cliente.cnpj || '-')}</div></div>
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Inscricao Estadual</div><div style="font-weight:700">${esc(cliente.ie || 'ISENTO')}</div></div>
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Contribuinte ICMS</div><div style="font-weight:700">${esc({'1':'1 - Contribuinte ICMS','2':'2 - Contribuinte isento','9':'9 - Nao Contribuinte'}[cliente.contribuinte_icms] || cliente.contribuinte_icms || '-')}</div></div>
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Email</div><div style="font-weight:700">${esc(cliente.email || '-')}</div></div>
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Telefone</div><div style="font-weight:700">${esc(cliente.telefone || '-')}</div></div>
    </div>
    <div style="padding:1rem;border:1px solid var(--bdr);border-radius:12px;background:var(--s1);margin-bottom:1rem">
      <div style="font-size:.78rem;font-weight:700;margin-bottom:.75rem;color:var(--acc,#3b82f6)">Endereco para NF-e</div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.9rem">
        <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.25rem">Logradouro</div><div style="font-weight:700">${esc(cliente.logradouro || '-')}</div></div>
        <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.25rem">Numero</div><div style="font-weight:700">${esc(cliente.numero || '-')}</div></div>
        <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.25rem">Complemento</div><div style="font-weight:700">${esc(cliente.complemento || '-')}</div></div>
        <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.25rem">Bairro</div><div style="font-weight:700">${esc(cliente.bairro || '-')}</div></div>
        <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.25rem">CEP</div><div style="font-weight:700">${esc(cliente.cep || '-')}</div></div>
        <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.25rem">UF</div><div style="font-weight:700">${esc(cliente.uf || 'MG')}</div></div>
      </div>
    </div>
    <div style="padding:1rem;border:1px solid var(--bdr);border-radius:12px;background:var(--s1);margin-bottom:1rem">
      <div style="font-size:.78rem;font-weight:700;margin-bottom:.75rem;color:var(--acc,#3b82f6)">Contratos vinculados</div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">${vinculados || '<span style="color:var(--mut)">Nenhum contrato vinculado.</span>'}</div>
    </div>
    <div style="padding:1rem;border:1px solid var(--bdr);border-radius:12px;background:var(--s1)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:.75rem">
        <div style="font-size:.78rem;font-weight:700;color:var(--acc,#3b82f6)">Ultimas vendas</div>
        <button class="btn btn-outline btn-sm" onclick="consultarUltimasVendasCliente('${cliente.id}')">Ver lista completa</button>
      </div>
      ${ultimosPedidos.length ? `<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Data</th><th>Status</th><th class="text-right">Valor</th></tr></thead><tbody>${ultimosPedidos.map((pedido) => `<tr><td><button onclick="verPedidoDetalhe('${pedido.id}')" style="background:none;border:none;padding:0;color:var(--blue);cursor:pointer;font-weight:700">${esc(pedido.id)}</button></td><td>${esc(pedido.dataEntrega || pedido.data || '-')}</td><td>${esc(pedido.status || '-')}</td><td class="text-right">${brl.format(pedido.valor || 0)}</td></tr>`).join('')}</tbody></table></div>` : '<div style="font-size:.85rem;color:var(--mut)">Nenhuma venda encontrada para este cliente.</div>'}
    </div>
  `;
  document.getElementById("modal-usuario").classList.remove("hidden");
}

function editarClienteDoDetalhe() {
  if (!clienteDetalheAtualId) return;
  editarUsuario(clienteDetalheAtualId);
}

function fecharModalUsuario() {
  clienteDetalheAtualId = null;
  document.getElementById("modal-usuario").classList.add("hidden");
}

function abrirMenuCliente(id) {
  const cliente = getClienteById(id);
  if (!cliente) return;
  clienteMenuAtualId = id;
  document.getElementById("cliente-side-menu-nome").textContent = cliente.nome || "Cliente";
  document.getElementById("cliente-side-menu").classList.remove("hidden");
}

function fecharMenuCliente() {
  clienteMenuAtualId = null;
  document.getElementById("cliente-side-menu").classList.add("hidden");
}

function consultarUltimasVendasClienteAtual() {
  if (!clienteMenuAtualId) return;
  consultarUltimasVendasCliente(clienteMenuAtualId);
}

function consultarUltimasVendasCliente(id) {
  const cliente = getClienteById(id);
  if (!cliente) return;
  const vendas = getPedidosDoCliente(cliente);
  document.getElementById("modal-cliente-vendas-titulo").textContent = `Ultimas Vendas • ${cliente.nome || ''}`;
  document.getElementById("modal-cliente-vendas-body").innerHTML = vendas.length
    ? `<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Contrato</th><th>Data</th><th>Status</th><th class="text-right">Valor</th></tr></thead><tbody>${vendas.map((pedido) => `<tr><td><button onclick="verPedidoDetalhe('${pedido.id}')" style="background:none;border:none;padding:0;color:var(--blue);cursor:pointer;font-weight:700">${esc(pedido.id)}</button></td><td>${esc(pedido.contratoId || '-')}</td><td>${esc(pedido.dataEntrega || pedido.data || '-')}</td><td>${esc(pedido.status || '-')}</td><td class="text-right">${brl.format(pedido.valor || 0)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div style="font-size:.85rem;color:var(--mut)">Nenhuma venda encontrada para este cliente.</div>';
  fecharMenuCliente();
  document.getElementById("modal-cliente-vendas").classList.remove("hidden");
}

function fecharModalClienteVendas() {
  document.getElementById("modal-cliente-vendas").classList.add("hidden");
}

function excluirClienteAtual() {
  if (!clienteMenuAtualId) return;
  const id = clienteMenuAtualId;
  fecharMenuCliente();
  excluirUsuario(id);
}

// ===== IMPORTAR CLIENTES =====
let _importClientesData = [];

function handleImportClientes(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;

  // Validate extension
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv', 'pdf'].includes(ext)) {
    showToast("Formato inválido. Use .xlsx, .xls, .csv ou .pdf", 3000);
    return;
  }
  // Validate size (10MB)
  if (file.size > 10 * 1024 * 1024) {
    showToast("Arquivo muito grande (máx. 10MB).", 3000);
    return;
  }

  document.getElementById("import-clientes-filename").textContent = file.name;

  if (ext === 'pdf') {
    parsePdfClientes(file);
  } else {
    parseExcelClientes(file);
  }
}

function parseExcelClientes(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      _importClientesData = rows.map(r => {
        // Normalize column keys: strip BOM, trim, lowercase for matching
        const norm = {};
        for (const k of Object.keys(r)) {
          const clean = k.replace(/^\uFEFF/, '').replace(/^["']|["']$/g, '').trim();
          norm[clean] = r[k];
        }
        // Smart get: try exact, then normalize both sides
        const get = (...keys) => {
          for (const k of keys) {
            if (norm[k] !== undefined && norm[k] !== '') return String(norm[k]).trim();
          }
          // Fallback: fuzzy match (lowercase, strip accents/special chars)
          const simplify = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
          const simpleKeys = keys.map(simplify);
          for (const col of Object.keys(norm)) {
            if (simpleKeys.includes(simplify(col)) && norm[col] !== '') return String(norm[col]).trim();
          }
          // Partial match (column contains key or key contains column)
          for (const col of Object.keys(norm)) {
            const sc = simplify(col);
            for (const sk of simpleKeys) {
              if ((sc.includes(sk) || sk.includes(sc)) && sc.length > 2 && norm[col] !== '') return String(norm[col]).trim();
            }
          }
          return '';
        };
        return {
          nome: get('Nome', 'nome', 'escola', 'Escola', 'NOME', 'ESCOLA', 'nome_escola', 'Razão Social', 'Razao Social', 'razao_social'),
          cnpj: get('CNPJ / CPF', 'CNPJ/CPF', 'cnpj', 'CNPJ', 'Cnpj', 'cpf_cnpj', 'CPF/CNPJ', 'CPF_CNPJ'),
          municipio: get('Cidade', 'cidade', 'municipio', 'Municipio', 'MUNICIPIO', 'CIDADE', 'município'),
          contribuinte_icms: get('contribuinte_icms', 'Contribuinte ICMS', 'contribuinte', 'CONTRIBUINTE', 'indContribuinte', 'Contrib. ICMS') || '9',
          responsavel: get('Observações do contato', 'responsavel', 'Responsavel', 'RESPONSAVEL', 'contato', 'Contato', 'responsável', 'Responsável'),
          email: get('E-mail', 'e-mail', 'email', 'Email', 'EMAIL', 'E-MAIL', 'E-mail para envio de notas fiscais'),
          telefone: get('Fone', 'fone', 'telefone', 'Telefone', 'TELEFONE', 'Celular', 'celular', 'cel'),
          logradouro: get('Endereço', 'endereco', 'Endereco', 'ENDERECO', 'endereço', 'logradouro', 'Logradouro', 'LOGRADOURO', 'rua', 'Rua'),
          numero: get('Número', 'numero', 'Numero', 'NUMERO', 'número', 'nro', 'Nro', 'num'),
          complemento: get('Complemento', 'complemento', 'COMPLEMENTO'),
          bairro: get('Bairro', 'bairro', 'BAIRRO'),
          cep: get('CEP', 'cep', 'Cep', 'codigo_postal'),
          uf: get('Estado', 'estado', 'uf', 'UF', 'Uf', 'ESTADO'),
          ie: get('IE / RG', 'IE/RG', 'ie', 'IE', 'Ie', 'IE isento')
        };
      }).filter(r => r.nome || r.cnpj); // at least one field

      mostrarPreviewClientes();
    } catch(err) {
      showToast("Erro ao ler arquivo: " + err.message, 3000);
    }
  };
  reader.readAsArrayBuffer(file);
}

async function parsePdfClientes(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }

    // Try to parse tabular data from text
    const lines = text.split('\n').filter(l => l.trim());
    _importClientesData = [];

    for (const line of lines) {
      // Match CNPJ pattern
      const cnpjMatch = line.match(/(\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2})/);
      if (cnpjMatch) {
        const cnpj = cnpjMatch[1].replace(/[^\d]/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
        // Text before CNPJ is likely the name
        const beforeCnpj = line.substring(0, line.indexOf(cnpjMatch[0])).trim();
        const afterCnpj = line.substring(line.indexOf(cnpjMatch[0]) + cnpjMatch[0].length).trim();
        // Try to find email
        const emailMatch = afterCnpj.match(/[\w.+-]+@[\w.-]+\.\w+/);
        // Try to find phone
        const phoneMatch = afterCnpj.match(/\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/);

        _importClientesData.push({
          nome: beforeCnpj || '',
          cnpj: cnpj,
          municipio: '',
          contribuinte_icms: '9',
          responsavel: '',
          email: emailMatch ? emailMatch[0] : '',
          telefone: phoneMatch ? phoneMatch[0] : ''
        });
      }
    }

    if (_importClientesData.length === 0) {
      showToast("Nenhum dado de cliente detectado no PDF. Tente um arquivo Excel.", 4000);
      return;
    }

    mostrarPreviewClientes();
  } catch(err) {
    showToast("Erro ao processar PDF: " + err.message, 3000);
  }
}

function mostrarPreviewClientes() {
  const existingCnpjs = new Set(usuarios.map(u => (u.cnpj || '').replace(/[^\d]/g, '')));

  let html = '<div class="table-wrap" style="max-height:350px;overflow-y:auto"><table style="font-size:.78rem"><thead><tr><th>Nome</th><th>CNPJ</th><th>Município</th><th>Contrib. ICMS</th><th>Endereço</th><th>Email</th><th>Telefone</th><th>Status</th></tr></thead><tbody>';

  let countNew = 0, countDup = 0, countIncomplete = 0;

  _importClientesData.forEach((r, i) => {
    const cnpjClean = (r.cnpj || '').replace(/[^\d]/g, '');
    const isDup = cnpjClean && existingCnpjs.has(cnpjClean);
    const isIncomplete = !r.nome || !r.cnpj;
    const rowStyle = isDup ? 'opacity:.5;text-decoration:line-through' : isIncomplete ? 'background:rgba(245,158,11,.1)' : '';

    if (isDup) countDup++;
    else if (isIncomplete) countIncomplete++;
    else countNew++;

    const badge = isDup ? '<span style="color:var(--dim);font-size:.65rem">duplicado</span>' :
                  isIncomplete ? '<span style="color:#f59e0b;font-size:.65rem">incompleto</span>' :
                  '<span style="color:var(--green);font-size:.65rem">novo</span>';

    const endereco = [r.logradouro, r.numero, r.bairro, r.cep].filter(Boolean).join(', ') || '-';
    html += `<tr style="${rowStyle}"><td>${esc(r.nome)}</td><td>${esc(r.cnpj)}</td><td>${esc(r.municipio)}</td><td>${esc({'1':'1-Contrib.','2':'2-Isento','9':'9-Nao Contrib.'}[r.contribuinte_icms] || r.contribuinte_icms || '-')}</td><td style="font-size:.72rem">${esc(endereco)}</td><td>${esc(r.email)}</td><td>${esc(r.telefone)}</td><td>${badge}</td></tr>`;
  });

  html += '</tbody></table></div>';
  document.getElementById("import-clientes-preview").innerHTML = html;
  document.getElementById("import-clientes-stats").innerHTML =
    `<strong>${_importClientesData.length}</strong> linhas detectadas: <span style="color:var(--green)">${countNew} novos</span>, <span style="color:#f59e0b">${countIncomplete} incompletos</span>, <span style="color:var(--dim)">${countDup} duplicados (ignorados)</span>`;

  // Show modal
  const modal = document.getElementById("modal-import-clientes");
  modal.classList.remove("hidden");
  modal.style.display = "flex";
}

function fecharImportClientes() {
  const modal = document.getElementById("modal-import-clientes");
  modal.classList.add("hidden");
  modal.style.display = "none";
  _importClientesData = [];
}

function confirmarImportClientes() {
  const allowSemCnpj = document.getElementById("chk-import-sem-cnpj").checked;
  const existingCnpjs = new Set(usuarios.map(u => (u.cnpj || '').replace(/[^\d]/g, '')));

  let imported = 0;
  for (const r of _importClientesData) {
    const cnpjClean = (r.cnpj || '').replace(/[^\d]/g, '');

    // Skip duplicates
    if (cnpjClean && existingCnpjs.has(cnpjClean)) continue;

    // Skip incomplete unless allowed
    if (!r.cnpj && !allowSemCnpj) continue;
    if (!r.nome) continue;

    const login = (r.cnpj || r.nome).replace(/[^\w]/g, '').toLowerCase().slice(0, 20);
    usuarios.push({
      id: 'imp-' + Date.now().toString(36) + '-' + imported,
      nome: r.nome,
      cnpj: r.cnpj,
      municipio: r.municipio,
      contribuinte_icms: r.contribuinte_icms || '9',
      responsavel: r.responsavel,
      email: r.email,
      telefone: r.telefone,
      logradouro: r.logradouro || '',
      numero: r.numero || '',
      complemento: r.complemento || '',
      bairro: r.bairro || '',
      cep: r.cep || '',
      uf: r.uf || 'MG',
      ie: r.ie || 'ISENTO',
      login: login,
      senha: 'escola2025',
      cargo: 'Presidente da Caixa Escolar',
      categoria_catalogo: '',
      arp_vinculada: 'ARP-LARIUCCI-2025',
      saldo_total: 0,
      saldo_disponivel: 0,
      contratos_vinculados: []
    });

    if (cnpjClean) existingCnpjs.add(cnpjClean);
    imported++;
  }

  saveUsuarios();
  renderUsuarios();
  fecharImportClientes();
  showToast(`${imported} cliente(s) importado(s) com sucesso!`, 3000);
}
