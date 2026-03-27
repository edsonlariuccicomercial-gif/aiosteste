# SOP — Inteligência de Preços V2: Especificação Completa

**Versão:** 2.0 | **Data:** 2026-03-12
**Fábrica:** SOP Factory — Deming
**Squad:** Caixa Escolar
**Módulo:** Inteligência de Preços
**Branch:** `feat/caixa-escolar-fase3-sgd`

---

## Sumário Executivo

7 fluxos de processo que transformam o módulo de Inteligência de Preços de um sistema passivo (banco + simulador) em um **motor ativo de decisão competitiva** com ciclo completo: cotação → envio → resultado → contrato → histórico → referência.

---

## ARQUITETURA DE ABAS (Nova Estrutura)

### Antes (5 abas)
```
Pré-Orçamento | Banco de Preços | Dashboard | Rentabilidade | SGD
```

### Depois (7 abas)
```
Pré-Orçamento | Aprovados | Envio SGD | Histórico | Banco de Preços | Dashboard | Rentabilidade
```

### Mapeamento Técnico

```
index.html — nav#tabs-intel-precos (Linha 120-126)
ATUAL:
  <button data-tab="pre-orcamento">      → MANTER (melhorar marca→obs)
  <button data-tab="banco-precos">        → MANTER (adicionar AI Import)
  <button data-tab="dashboard-precos">    → MANTER
  <button data-tab="rentabilidade">       → MANTER
  <button data-tab="sgd">                 → RENOMEAR para "Envio SGD"

ADICIONAR:
  <button data-tab="aprovados">           → NOVA — Orçamentos Aprovados / Contratos
  <button data-tab="historico">           → NOVA — Histórico Ganhos/Perdidos

ORDEM FINAL:
  pre-orcamento → aprovados → envio-sgd → historico → banco-precos → dashboard-precos → rentabilidade
```

### Containers HTML (adicionar em index.html após linha ~530)

```html
<!-- Aba: Orçamentos Aprovados / Contratos -->
<div id="tab-aprovados" class="tab-content" style="display:none;">
  <div class="section-header">
    <h3>Orçamentos Aprovados & Contratos</h3>
    <div class="kpi-row" id="kpi-aprovados"></div>
  </div>
  <div class="filters-row" id="filtros-aprovados"></div>
  <div id="lista-aprovados"></div>
</div>

<!-- Aba: Histórico Ganhos/Perdidos -->
<div id="tab-historico" class="tab-content" style="display:none;">
  <div class="section-header">
    <h3>Histórico de Propostas — Referência de Preços</h3>
    <div class="kpi-row" id="kpi-historico"></div>
  </div>
  <div class="sub-tabs" id="sub-tabs-historico">
    <button class="sub-tab active" data-sub="ganhos">Ganhos</button>
    <button class="sub-tab" data-sub="perdidos">Perdidos</button>
    <button class="sub-tab" data-sub="analise">Análise Comparativa</button>
  </div>
  <div id="lista-historico"></div>
</div>
```

### switchTab() — Atualizar (app.js linha 1804-1817)

```javascript
// ADICIONAR nos cases:
case "aprovados":
  renderAprovados();
  break;
case "historico":
  renderHistorico();
  break;
case "envio-sgd":  // renomear de "sgd"
  renderSgdTab();
  break;
```

---

## FLUXO 1 — MARCA → OBSERVAÇÃO SGD

### Contexto do Problema
O usuário preenche o campo `marca` no pré-orçamento (ex: "Ventisol"), mas ao enviar ao SGD, o campo `txItemObservation` não inclui essa informação. O SGD precisa da marca na observação para identificar o produto corretamente.

### Ponto de Intervenção

**Arquivo:** `app.js`
**Função:** `buildSgdPayload()` (Linha 2899-2940)
**Campo alvo:** `observacao` (Linha 2933)
**Segundo ponto:** `browserSgdSubmit()` (Linha 3174) — `txItemObservation`

### Regra de Negócio

```
SE item.marca existir E item.marca não estiver vazio:
  observacao = "[Marca: {item.marca}] {item.observacao || item.descricao || item.nome}"
SENÃO:
  observacao = item.observacao || item.descricao || item.nome || "Conforme especificado"
```

### Implementação Detalhada

#### Passo 1: Helper function (adicionar antes de buildSgdPayload)

```javascript
/**
 * Monta o campo observação do SGD incluindo marca quando disponível.
 * @param {Object} item - Item do pré-orçamento
 * @returns {string} Texto formatado para txItemObservation
 */
function buildObservacaoSgd(item) {
  const marca = (item.marca || "").trim();
  const obs = (item.observacao || item.descricao || item.nome || "Conforme especificado").trim();

  if (marca) {
    // Evita duplicar se já contém a marca
    if (obs.toLowerCase().includes(marca.toLowerCase())) {
      return obs;
    }
    return `[Marca: ${marca}] ${obs}`;
  }
  return obs;
}
```

#### Passo 2: Atualizar buildSgdPayload() (Linha 2933)

```javascript
// ANTES:
observacao: item.observacao || item.descricao || "",

// DEPOIS:
observacao: buildObservacaoSgd(item),
```

#### Passo 3: Atualizar browserSgdSubmit() (Linha 3174)

```javascript
// ANTES:
txItemObservation: item.observacao || item.nome,

// DEPOIS:
txItemObservation: buildObservacaoSgd(item),
```

#### Passo 4: Atualizar renderSgdFields() (Linha 3563)

```javascript
// ANTES:
const obs = item.observacao || (item.descricao ? item.descricao.slice(0, 200) : "");

// DEPOIS:
const obs = buildObservacaoSgd(item);
```

### Validação
- [ ] Pré-orçamento com marca "Ventisol" → observação SGD contém "[Marca: Ventisol]"
- [ ] Pré-orçamento sem marca → observação SGD usa fallback normal
- [ ] Marca já presente na observação → não duplica
- [ ] Preview do payload (download JSON) mostra marca na observação

---

## FLUXO 2 — REGISTRO MANUAL DE RESULTADOS SGD

### Contexto do Problema
A API SGD NÃO retorna status de aprovação/rejeição de propostas. O usuário consulta manualmente no portal SGD e precisa registrar o resultado no sistema para alimentar o histórico.

### Data Schema — Resultado de Proposta

```javascript
// Nova chave localStorage: "caixaescolar.resultados.v1"
{
  resultados: [
    {
      id: "res-{timestamp}",
      orcamentoId: String,          // Ref ao pré-orçamento original
      escola: String,
      municipio: String,
      grupo: String,
      resultado: "ganho" | "perdido",
      dataResultado: "YYYY-MM-DD",  // Data que consultou no portal
      valorProposto: Number,        // Nosso valor
      valorVencedor: Number,        // Valor que ganhou (se perdeu)
      fornecedorVencedor: String,   // Quem ganhou (se perdeu)
      motivoPerda: String,          // "preco" | "tecnico" | "desclassificado" | "outro"
      observacoes: String,
      itens: [                      // Cópia dos itens com resultado
        {
          nome: String,
          marca: String,
          precoUnitario: Number,     // Nosso preço
          precoVencedor: Number,     // Preço que ganhou (se perdeu)
          delta: Number,             // Diferença percentual
          ganhou: Boolean,
        }
      ],
      // Metadados para contrato (se ganhou)
      contrato: {
        gerado: Boolean,
        contratoId: String,         // Ref ao contrato criado
      }
    }
  ]
}
```

### Interface — Registro de Resultado

**Localização:** Aba "Envio SGD" (tab-envio-sgd), seção inferior
**Trigger:** Botão "Registrar Resultado" ao lado de cada proposta enviada

#### Modal: Registrar Resultado

```html
<div id="modal-resultado" class="modal">
  <div class="modal-content card">
    <h3>Registrar Resultado — {escola}</h3>

    <!-- Resultado Geral -->
    <div class="resultado-toggle">
      <button class="btn-resultado btn-ganho" data-resultado="ganho">
        ✓ GANHEI
      </button>
      <button class="btn-resultado btn-perdido" data-resultado="perdido">
        ✗ PERDI
      </button>
    </div>

    <!-- Se PERDEU — campos extras -->
    <div id="campos-perda" style="display:none;">
      <label>Valor do vencedor (total)</label>
      <input type="number" id="res-valor-vencedor" step="0.01">

      <label>Fornecedor vencedor</label>
      <input type="text" id="res-fornecedor-vencedor">

      <label>Motivo principal</label>
      <select id="res-motivo">
        <option value="preco">Preço mais alto</option>
        <option value="tecnico">Critério técnico</option>
        <option value="desclassificado">Desclassificado</option>
        <option value="outro">Outro</option>
      </select>
    </div>

    <!-- Se GANHOU — campos extras -->
    <div id="campos-ganho" style="display:none;">
      <label>Gerar contrato automaticamente?</label>
      <label class="switch">
        <input type="checkbox" id="res-gerar-contrato" checked>
        <span class="slider"></span>
      </label>
    </div>

    <!-- Detalhamento por item (se perdeu e quer registrar preço vencedor por item) -->
    <details>
      <summary>Detalhar por item (opcional)</summary>
      <div id="res-itens-detail"></div>
    </details>

    <label>Observações</label>
    <textarea id="res-observacoes" rows="3"></textarea>

    <label>Data do resultado</label>
    <input type="date" id="res-data" value="{hoje}">

    <div class="modal-actions">
      <button class="btn" onclick="fecharModalResultado()">Cancelar</button>
      <button class="btn btn-accent" onclick="salvarResultado()">Salvar Resultado</button>
    </div>
  </div>
</div>
```

### Lógica — salvarResultado()

```javascript
function salvarResultado() {
  const orcamentoId = currentResultadoOrcamentoId;
  const pre = preOrcamentos.find(p => p.orcamentoId === orcamentoId);

  const resultado = {
    id: `res-${Date.now()}`,
    orcamentoId,
    escola: pre.escola,
    municipio: pre.municipio,
    grupo: pre.grupo || "Geral",
    resultado: selectedResultado,                    // "ganho" | "perdido"
    dataResultado: document.getElementById("res-data").value,
    valorProposto: pre.totalGeral,
    valorVencedor: parseFloat(document.getElementById("res-valor-vencedor").value) || null,
    fornecedorVencedor: document.getElementById("res-fornecedor-vencedor").value || null,
    motivoPerda: selectedResultado === "perdido"
      ? document.getElementById("res-motivo").value : null,
    observacoes: document.getElementById("res-observacoes").value,
    itens: pre.itens.map(item => ({
      nome: item.nome,
      marca: item.marca,
      precoUnitario: item.precoUnitario,
      precoVencedor: null,  // Preenchido no detalhe por item
      delta: null,
      ganhou: selectedResultado === "ganho",
    })),
    contrato: {
      gerado: false,
      contratoId: null,
    },
  };

  // Calcular deltas se perdeu e informou valor vencedor
  if (resultado.resultado === "perdido" && resultado.valorVencedor) {
    const deltaTotal = ((resultado.valorProposto - resultado.valorVencedor)
      / resultado.valorVencedor * 100).toFixed(1);
    resultado.deltaTotalPercent = parseFloat(deltaTotal);
  }

  // Salvar
  let resultados = JSON.parse(localStorage.getItem("caixaescolar.resultados.v1") || "[]");
  resultados.push(resultado);
  localStorage.setItem("caixaescolar.resultados.v1", JSON.stringify(resultados));

  // Atualizar status do pré-orçamento
  pre.status = selectedResultado === "ganho" ? "ganho" : "perdido";
  savePreOrcamentos();

  // Se ganhou e checkbox marcado → gerar contrato
  if (resultado.resultado === "ganho"
    && document.getElementById("res-gerar-contrato").checked) {
    const contrato = gerarContratoDeResultado(resultado, pre);
    resultado.contrato = { gerado: true, contratoId: contrato.contratoId };
    // Atualizar resultado salvo
    resultados[resultados.length - 1] = resultado;
    localStorage.setItem("caixaescolar.resultados.v1", JSON.stringify(resultados));
  }

  // Alimentar banco de preços com referência
  alimentarBancoComResultado(resultado);

  fecharModalResultado();
  renderSgdTab();
  showToast(resultado.resultado === "ganho"
    ? "Resultado registrado — contrato gerado!"
    : "Resultado registrado — histórico atualizado");
}
```

### Sincronização com Supabase

```javascript
// Adicionar ao SYNC_KEYS (app.js, onde estão os outros):
"caixaescolar.resultados.v1"

// Adicionar ao SYNC_KEYS do cloud sync handler
```

---

## FLUXO 3 — PROPOSTA APROVADA → CONTRATO POR ESCOLA

### Data Schema — Contrato

```javascript
// Nova chave localStorage: "caixaescolar.contratos.v1"
{
  contratos: [
    {
      contratoId: "CTR-{escolaId}-{ano}-{seq}",
      resultadoId: String,          // Ref ao resultado que originou
      orcamentoId: String,          // Ref ao pré-orçamento original
      escola: {
        nome: String,
        municipio: String,
        cnpj: String,               // Do sre-uberaba.json se disponível
      },
      status: "ativo" | "em_entrega" | "entregue" | "cancelado",
      dataContrato: "YYYY-MM-DD",
      dataLimiteEntrega: "YYYY-MM-DD",
      valorTotal: Number,
      itens: [
        {
          nome: String,
          marca: String,
          unidade: String,
          quantidade: Number,
          precoUnitario: Number,
          precoTotal: Number,
          entregue: Number,          // Quantidade já entregue
          pendente: Number,          // Quantidade pendente
        }
      ],
      entregas: [
        {
          entregaId: String,
          data: "YYYY-MM-DD",
          itensEntregues: [{nome, quantidade}],
          notaFiscal: String,
          status: "pendente" | "entregue" | "confirmado",
          observacoes: String,
        }
      ],
      historico: [
        { data: String, evento: String, usuario: String }
      ],
    }
  ]
}
```

### Função — gerarContratoDeResultado()

```javascript
function gerarContratoDeResultado(resultado, pre) {
  const contratos = JSON.parse(
    localStorage.getItem("caixaescolar.contratos.v1") || "[]"
  );

  // Gerar ID sequencial por escola
  const escolaContratos = contratos.filter(c => c.escola.nome === pre.escola);
  const seq = (escolaContratos.length + 1).toString().padStart(3, "0");
  const ano = new Date().getFullYear();
  const escolaId = pre.escola.replace(/\s+/g, "-").substring(0, 20).toUpperCase();

  const contrato = {
    contratoId: `CTR-${escolaId}-${ano}-${seq}`,
    resultadoId: resultado.id,
    orcamentoId: pre.orcamentoId,
    escola: {
      nome: pre.escola,
      municipio: pre.municipio,
      cnpj: findEscolaCnpj(pre.escola),  // Busca no sre-uberaba.json
    },
    status: "ativo",
    dataContrato: new Date().toISOString().split("T")[0],
    dataLimiteEntrega: pre.dtGoodsDelivery
      ? pre.dtGoodsDelivery.split("T")[0]
      : null,
    valorTotal: pre.totalGeral,
    itens: pre.itens.map(item => ({
      nome: item.nome,
      marca: item.marca,
      unidade: item.unidade,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
      precoTotal: item.precoTotal,
      entregue: 0,
      pendente: item.quantidade,
    })),
    entregas: [],
    historico: [
      {
        data: new Date().toISOString(),
        evento: "Contrato gerado a partir de proposta aprovada",
        usuario: "sistema",
      }
    ],
  };

  contratos.push(contrato);
  localStorage.setItem("caixaescolar.contratos.v1", JSON.stringify(contratos));

  return contrato;
}
```

### Aba Aprovados — renderAprovados()

```javascript
function renderAprovados() {
  const contratos = JSON.parse(
    localStorage.getItem("caixaescolar.contratos.v1") || "[]"
  );

  // KPIs
  const ativos = contratos.filter(c => c.status === "ativo");
  const emEntrega = contratos.filter(c => c.status === "em_entrega");
  const entregues = contratos.filter(c => c.status === "entregue");
  const valorAtivo = ativos.reduce((s, c) => s + c.valorTotal, 0);

  document.getElementById("kpi-aprovados").innerHTML = `
    <div class="kpi-card">
      <div class="kpi-value">${ativos.length}</div>
      <div class="kpi-label">Contratos Ativos</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${emEntrega.length}</div>
      <div class="kpi-label">Em Entrega</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${entregues.length}</div>
      <div class="kpi-label">Concluídos</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">R$ ${valorAtivo.toLocaleString("pt-BR")}</div>
      <div class="kpi-label">Valor em Contratos</div>
    </div>
  `;

  // Lista de contratos agrupados por escola
  const porEscola = {};
  contratos.forEach(c => {
    if (!porEscola[c.escola.nome]) porEscola[c.escola.nome] = [];
    porEscola[c.escola.nome].push(c);
  });

  let html = "";
  for (const [escola, ctrs] of Object.entries(porEscola)) {
    html += `
      <div class="card mb-2">
        <h4>${escola} <span class="badge">${ctrs.length} contratos</span></h4>
        <table class="table">
          <thead>
            <tr>
              <th>Contrato</th><th>Data</th><th>Valor</th>
              <th>Status</th><th>Entrega</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${ctrs.map(c => `
              <tr>
                <td><strong>${c.contratoId}</strong></td>
                <td>${formatDate(c.dataContrato)}</td>
                <td>R$ ${c.valorTotal.toLocaleString("pt-BR")}</td>
                <td><span class="badge badge-${statusClass(c.status)}">${c.status}</span></td>
                <td>${c.itens.reduce((s,i) => s+i.entregue, 0)}/${c.itens.reduce((s,i) => s+i.quantidade, 0)} itens</td>
                <td>
                  <button class="btn btn-sm" onclick="verContrato('${c.contratoId}')">Detalhes</button>
                  <button class="btn btn-sm btn-accent" onclick="registrarEntrega('${c.contratoId}')">Entrega</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  document.getElementById("lista-aprovados").innerHTML = html ||
    '<p class="text-muted">Nenhum contrato registrado. Registre resultados na aba "Envio SGD".</p>';
}
```

---

## FLUXO 4 — HISTÓRICO GANHOS/PERDIDOS (Referência de Preços)

### Aba Histórico — renderHistorico()

```javascript
function renderHistorico() {
  const resultados = JSON.parse(
    localStorage.getItem("caixaescolar.resultados.v1") || "[]"
  );

  const ganhos = resultados.filter(r => r.resultado === "ganho");
  const perdidos = resultados.filter(r => r.resultado === "perdido");
  const totalProposto = resultados.reduce((s, r) => s + r.valorProposto, 0);
  const totalGanho = ganhos.reduce((s, r) => s + r.valorProposto, 0);
  const taxaConversao = resultados.length
    ? ((ganhos.length / resultados.length) * 100).toFixed(0) : 0;

  // Análise de perdas por motivo
  const motivosPerdas = {};
  perdidos.forEach(r => {
    const motivo = r.motivoPerda || "outro";
    motivosPerdas[motivo] = (motivosPerdas[motivo] || 0) + 1;
  });

  // Delta médio quando perde por preço
  const perdasPorPreco = perdidos.filter(r =>
    r.motivoPerda === "preco" && r.deltaTotalPercent
  );
  const deltaMediaPreco = perdasPorPreco.length
    ? (perdasPorPreco.reduce((s, r) => s + r.deltaTotalPercent, 0) / perdasPorPreco.length).toFixed(1)
    : null;

  // KPIs
  document.getElementById("kpi-historico").innerHTML = `
    <div class="kpi-card">
      <div class="kpi-value">${resultados.length}</div>
      <div class="kpi-label">Total Propostas</div>
    </div>
    <div class="kpi-card kpi-success">
      <div class="kpi-value">${ganhos.length}</div>
      <div class="kpi-label">Ganhas</div>
    </div>
    <div class="kpi-card kpi-danger">
      <div class="kpi-value">${perdidos.length}</div>
      <div class="kpi-label">Perdidas</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${taxaConversao}%</div>
      <div class="kpi-label">Taxa de Conversão</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">R$ ${totalGanho.toLocaleString("pt-BR")}</div>
      <div class="kpi-label">Faturamento Ganho</div>
    </div>
    ${deltaMediaPreco ? `
      <div class="kpi-card kpi-warning">
        <div class="kpi-value">${deltaMediaPreco}%</div>
        <div class="kpi-label">Delta Médio (perdas por preço)</div>
      </div>
    ` : ""}
  `;

  // Sub-tabs content
  const activeSubTab = document.querySelector("#sub-tabs-historico .sub-tab.active")
    ?.dataset.sub || "ganhos";

  renderHistoricoSubTab(activeSubTab, ganhos, perdidos, resultados);
}
```

### Sub-tab: Análise Comparativa

```javascript
function renderAnaliseComparativa(resultados) {
  // Agrupa por grupo de produto para encontrar padrões
  const porGrupo = {};
  resultados.forEach(r => {
    const grupo = r.grupo || "Geral";
    if (!porGrupo[grupo]) porGrupo[grupo] = { ganhos: [], perdidos: [] };
    porGrupo[grupo][r.resultado === "ganho" ? "ganhos" : "perdidos"].push(r);
  });

  let html = `
    <h4>Análise por Grupo de Produto</h4>
    <table class="table">
      <thead>
        <tr>
          <th>Grupo</th>
          <th>Ganhos</th>
          <th>Perdidos</th>
          <th>Taxa</th>
          <th>Preço Médio que Ganha</th>
          <th>Margem Segura</th>
          <th>Insight</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const [grupo, dados] of Object.entries(porGrupo)) {
    const total = dados.ganhos.length + dados.perdidos.length;
    const taxa = ((dados.ganhos.length / total) * 100).toFixed(0);

    // Preço médio que ganha = média dos nossos preços quando ganhamos
    const precoMedioGanho = dados.ganhos.length
      ? (dados.ganhos.reduce((s, r) => s + r.valorProposto, 0) / dados.ganhos.length)
      : null;

    // Margem segura = margem média das propostas ganhas
    const margemSegura = dados.ganhos.length
      ? dados.ganhos.reduce((s, r) => {
          const pre = preOrcamentos.find(p => p.orcamentoId === r.orcamentoId);
          return s + (pre?.margemMedia || 0);
        }, 0) / dados.ganhos.length
      : null;

    // Insight automático
    let insight = "";
    if (dados.perdidos.length > dados.ganhos.length) {
      insight = "⚠️ Revisar precificação — mais perdas que ganhos";
    } else if (parseInt(taxa) >= 80) {
      insight = "✅ Domínio competitivo — manter estratégia";
    } else if (parseInt(taxa) >= 50) {
      insight = "📊 Competitivo — margem de otimização";
    }

    html += `
      <tr>
        <td><strong>${grupo}</strong></td>
        <td class="text-success">${dados.ganhos.length}</td>
        <td class="text-danger">${dados.perdidos.length}</td>
        <td>${taxa}%</td>
        <td>${precoMedioGanho ? "R$ " + precoMedioGanho.toLocaleString("pt-BR") : "—"}</td>
        <td>${margemSegura ? (margemSegura * 100).toFixed(0) + "%" : "—"}</td>
        <td>${insight}</td>
      </tr>
    `;
  }

  html += `</tbody></table>`;

  // Referência de preços por item (alimenta o banco)
  html += `
    <h4 style="margin-top:2rem;">Referência de Preços por Item (Últimas Propostas)</h4>
    <p class="text-muted">Preços que ganharam vs. preços que perderam — use como base para próximos orçamentos.</p>
    <table class="table" id="tabela-referencia-precos">
      <thead>
        <tr>
          <th>Item</th>
          <th>Preço Médio (Ganhos)</th>
          <th>Preço Médio (Perdas)</th>
          <th>Preço Vencedor Médio</th>
          <th>Delta</th>
          <th>Sugestão</th>
        </tr>
      </thead>
      <tbody id="tbody-referencia-precos"></tbody>
    </table>
  `;

  return html;
}
```

### Alimentar Banco de Preços com Resultado

```javascript
/**
 * Quando um resultado é registrado, atualiza o banco de preços
 * com dados de referência do mercado.
 */
function alimentarBancoComResultado(resultado) {
  let banco = JSON.parse(localStorage.getItem("caixaescolar.banco.v1") || "null");
  if (!banco) return;

  resultado.itens.forEach(itemRes => {
    const bp = banco.itens.find(b =>
      b.item.toLowerCase().includes(itemRes.nome.toLowerCase()) ||
      itemRes.nome.toLowerCase().includes(b.item.toLowerCase())
    );

    if (bp) {
      // Inicializar arrays se não existem
      if (!bp.historicoResultados) bp.historicoResultados = [];

      bp.historicoResultados.push({
        data: resultado.dataResultado,
        resultado: resultado.resultado,
        precoPraticado: itemRes.precoUnitario,
        precoVencedor: itemRes.precoVencedor,
        escola: resultado.escola,
        margem: null, // Calcular se necessário
      });

      // Atualizar preço de referência baseado nos ganhos
      if (resultado.resultado === "ganho") {
        const ganhos = bp.historicoResultados.filter(h => h.resultado === "ganho");
        if (ganhos.length >= 2) {
          bp.precoReferenciaHistorico = ganhos.reduce((s, h) =>
            s + h.precoPraticado, 0) / ganhos.length;
        }
      }

      // Se perdeu, registrar concorrente
      if (resultado.resultado === "perdido" && resultado.fornecedorVencedor) {
        if (!bp.concorrentes) bp.concorrentes = [];
        bp.concorrentes.push({
          nome: resultado.fornecedorVencedor,
          preco: itemRes.precoVencedor || resultado.valorVencedor,
          data: resultado.dataResultado,
          edital: resultado.escola,
        });
      }
    }
  });

  localStorage.setItem("caixaescolar.banco.v1", JSON.stringify(banco));
}
```

---

## FLUXO 5 — AI IMPORT PARSER (Netlify Function)

### Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────┐
│ Upload File │────▶│ Client-side  │────▶│ Netlify Function │────▶│ Preview  │
│ (any format)│     │ Extract Text │     │ api/ai-parse.js  │     │ & Commit │
└─────────────┘     └──────────────┘     └─────────────────┘     └──────────┘
                    │                    │
                    │ XLSX→JSON          │ OpenAI API Call
                    │ CSV→text           │ gpt-4o-mini
                    │ PDF→text (pdf.js)  │ ~$0.01/parse
                    │ JPG→text (OCR)     │
                    │ DOCX→text          │
```

### Netlify Function: api/ai-parse-price.js

```javascript
// Arquivo: api/ai-parse-price.js (NOVO)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { texto, formato, fornecedor, contexto } = JSON.parse(event.body);

  if (!texto || texto.trim().length < 10) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Texto insuficiente para análise" }),
    };
  }

  const systemPrompt = `Você é um especialista em extrair dados de tabelas de preços de fornecedores para licitações públicas de Caixas Escolares em Minas Gerais.

REGRAS:
1. Extraia TODOS os itens encontrados no texto
2. Para cada item, retorne EXATAMENTE este formato JSON
3. Se um campo não existir no texto, use null
4. Preços devem ser numéricos (sem R$, sem pontos de milhar, vírgula como decimal → ponto)
5. Se o preço for "total" e houver quantidade, calcule o unitário
6. Identifique a marca quando aparecer junto ao item
7. Agrupe por categoria quando possível
8. Se for tabela de distribuidor, identifique embalagem/unidade de venda

FORMATO DE SAÍDA (JSON array):
[
  {
    "nome": "Nome do item limpo (sem códigos internos do fornecedor)",
    "marca": "Marca ou null",
    "unidade": "Un/Kg/Cx/Pct/Lt/etc",
    "preco": 0.00,
    "embalagem": "Descrição da embalagem ou null",
    "categoria": "Categoria identificada ou null",
    "codigo_fornecedor": "Código original do fornecedor ou null",
    "observacao": "Qualquer info relevante ou null"
  }
]

CONTEXTO DO FORNECEDOR: ${fornecedor || "Não informado"}
FORMATO ORIGINAL: ${formato || "Não informado"}
${contexto ? "CONTEXTO ADICIONAL: " + contexto : ""}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",        // Barato: ~$0.15/1M input tokens
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extraia os itens desta tabela de preços:\n\n${texto.slice(0, 15000)}` },
        ],
        temperature: 0.1,             // Baixa temperatura = mais preciso
        response_format: { type: "json_object" },
        max_tokens: 4000,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Erro na API OpenAI",
          detail: data.error?.message
        }),
      };
    }

    const parsed = JSON.parse(data.choices[0].message.content);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itens: parsed.itens || parsed,
        tokens_usados: data.usage?.total_tokens || 0,
        custo_estimado: ((data.usage?.total_tokens || 0) * 0.00000015).toFixed(4),
        modelo: "gpt-4o-mini",
        fornecedor: fornecedor,
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
```

### Custo Estimado

| Cenário | Input Tokens | Output Tokens | Custo |
|---------|-------------|--------------|-------|
| Planilha 50 itens | ~2.000 | ~3.000 | ~$0.001 |
| Planilha 200 itens | ~8.000 | ~12.000 | ~$0.003 |
| PDF 5 páginas OCR | ~5.000 | ~5.000 | ~$0.002 |
| JPG tabela grande | ~3.000 | ~4.000 | ~$0.001 |
| **Média por import** | — | — | **~$0.002** |
| **500 imports/mês** | — | — | **~$1.00/mês** |

### Client-side: Import com AI Toggle

```javascript
/**
 * Novo botão no modal de import: "Importar com IA"
 * Fica ao lado do botão de import manual existente
 */
async function importarComIA(textoExtraido, formato, arquivo) {
  const btnAI = document.getElementById("btn-import-ai");
  btnAI.disabled = true;
  btnAI.textContent = "Analisando com IA...";

  try {
    // 1. Perguntar fornecedor
    const fornecedor = prompt("Nome do fornecedor (opcional):");

    // 2. Chamar Netlify Function
    const resp = await fetch("/.netlify/functions/ai-parse-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texto: textoExtraido,
        formato: formato,
        fornecedor: fornecedor,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) throw new Error(data.error);

    // 3. Popular preview table com resultado da IA
    importData.rows = data.itens.map(item => [
      item.nome,
      item.marca || "",
      item.unidade || "Un",
      item.preco || 0,
      item.embalagem || "",
      item.categoria || "",
      item.codigo_fornecedor || "",
    ]);
    importData.headers = ["Item", "Marca", "Unidade", "Preço", "Embalagem", "Categoria", "Cód.Fornecedor"];
    importData.mapping = { item: 0, fornecedor: 1, unidade: 2, preco: 3 };
    importData.aiParsed = true;
    importData.fornecedor = fornecedor;

    // 4. Renderizar preview
    renderImportPreview();

    // 5. Mostrar stats
    document.getElementById("import-stats").innerHTML = `
      <div class="alert alert-success">
        <strong>IA identificou ${data.itens.length} itens</strong> |
        Tokens: ${data.tokens_usados} |
        Custo: ~$${data.custo_estimado} |
        Fornecedor: ${data.fornecedor || "Não informado"}
      </div>
    `;

  } catch (err) {
    showToast("Erro no AI Parse: " + err.message, "error");
  } finally {
    btnAI.disabled = false;
    btnAI.textContent = "Importar com IA";
  }
}
```

### Fuzzy Match com Banco Existente

```javascript
/**
 * Após AI parse, faz matching inteligente com banco de preços.
 * Retorna: { matched: [], new: [], ambiguous: [] }
 */
function matchAIResultWithBanco(aiItens) {
  const banco = JSON.parse(localStorage.getItem("caixaescolar.banco.v1") || '{"itens":[]}');
  const result = { matched: [], new: [], ambiguous: [] };

  aiItens.forEach(aiItem => {
    const nome = aiItem.nome.toLowerCase().trim();

    // Score de similaridade simples (pode melhorar com Levenshtein)
    let bestMatch = null;
    let bestScore = 0;

    banco.itens.forEach(bp => {
      const bpNome = bp.item.toLowerCase().trim();

      // Calcular overlap de palavras
      const words1 = nome.split(/\s+/);
      const words2 = bpNome.split(/\s+/);
      const common = words1.filter(w => words2.some(w2 =>
        w2.includes(w) || w.includes(w2)
      ));
      const score = common.length / Math.max(words1.length, words2.length);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = bp;
      }
    });

    if (bestScore >= 0.8) {
      result.matched.push({ ai: aiItem, banco: bestMatch, score: bestScore });
    } else if (bestScore >= 0.5) {
      result.ambiguous.push({ ai: aiItem, banco: bestMatch, score: bestScore });
    } else {
      result.new.push({ ai: aiItem });
    }
  });

  return result;
}
```

### Atualização do vercel.json (rewrite para Netlify)

```json
{
  "rewrites": [
    { "source": "/.netlify/functions/sgd-proxy", "destination": "/api/sgd-proxy" },
    { "source": "/.netlify/functions/ai-parse-price", "destination": "/api/ai-parse-price" }
  ]
}
```

### Variável de Ambiente (Netlify)

```
OPENAI_API_KEY=sk-...  (configurar em Netlify Dashboard > Site Settings > Environment Variables)
```

---

## FLUXO 6 — PREÇOS B2B (Fornecedores B2B)

### Schema de Fornecedor B2B

```javascript
// Adicionar ao banco-precos item:
{
  // Campos existentes...

  // NOVOS campos para B2B
  fontesPreco: [
    {
      tipo: "manual" | "b2b_portal" | "b2b_api" | "tabela_fornecedor",
      fornecedor: String,
      preco: Number,
      dataAtualizacao: "YYYY-MM-DD",
      validade: "YYYY-MM-DD",        // Quando expira esta cotação
      frequencia: "semanal" | "quinzenal" | "mensal" | "sob_demanda",
      url: String,                    // URL do portal B2B (se aplicável)
      observacao: String,
      ativo: Boolean,
    }
  ]
}
```

### Interface: Gerenciador de Fontes de Preço

**Localização:** Aba "Banco de Preços", botão extra em cada item

```javascript
/**
 * Modal para gerenciar fontes de preço de um item do banco
 */
function abrirGerenciadorFontes(itemId) {
  const banco = getBancoLocal();
  const item = banco.itens.find(i => i.id === itemId);

  const fontes = item.fontesPreco || [];

  let html = `
    <div class="modal-header">
      <h3>Fontes de Preço: ${item.item}</h3>
    </div>
    <div class="fontes-list">
      <table class="table">
        <thead>
          <tr>
            <th>Fornecedor</th><th>Tipo</th><th>Preço</th>
            <th>Atualizado</th><th>Válido até</th><th>Freq.</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${fontes.map((f, idx) => {
            const expirado = f.validade && new Date(f.validade) < new Date();
            return `
              <tr class="${expirado ? 'row-expired' : ''}">
                <td>${f.fornecedor}</td>
                <td><span class="badge badge-${f.tipo}">${tipoLabel(f.tipo)}</span></td>
                <td>R$ ${f.preco.toFixed(2)}</td>
                <td>${formatDate(f.dataAtualizacao)}</td>
                <td>${f.validade ? formatDate(f.validade) : "—"}
                  ${expirado ? '<span class="badge badge-danger">Expirado</span>' : ''}</td>
                <td>${f.frequencia || "—"}</td>
                <td>
                  <button class="btn btn-sm" onclick="removerFonte('${itemId}', ${idx})">✕</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>

    <!-- Adicionar nova fonte -->
    <h4>Adicionar Fonte</h4>
    <div class="form-row">
      <select id="fonte-tipo">
        <option value="manual">Upload Manual (planilha/JPG)</option>
        <option value="tabela_fornecedor">Tabela do Fornecedor</option>
        <option value="b2b_portal">Portal B2B</option>
        <option value="b2b_api">API Fornecedor</option>
      </select>
      <input type="text" id="fonte-fornecedor" placeholder="Nome do fornecedor">
      <input type="number" id="fonte-preco" placeholder="Preço" step="0.01">
      <input type="date" id="fonte-validade">
      <select id="fonte-frequencia">
        <option value="semanal">Semanal</option>
        <option value="quinzenal">Quinzenal</option>
        <option value="mensal">Mensal</option>
        <option value="sob_demanda">Sob demanda</option>
      </select>
      <button class="btn btn-accent" onclick="adicionarFonte('${itemId}')">Adicionar</button>
    </div>

    <!-- Melhor preço automático -->
    <div class="best-price-summary">
      <strong>Melhor preço atual:</strong>
      R$ ${Math.min(...fontes.filter(f => f.ativo && !isExpired(f)).map(f => f.preco)).toFixed(2)}
      (${fontes.find(f => f.preco === Math.min(...fontes.filter(x => x.ativo).map(x => x.preco)))?.fornecedor || "—"})
    </div>
  `;

  openModal("modal-fontes-preco", html);
}
```

### Alerta de Validade Expirada

```javascript
// Adicionar ao sistema de alertas (pricing-intel.js, Linha 164)
function checkFontesExpiradas() {
  const banco = getBancoLocal();
  const alertas = [];

  banco.itens.forEach(item => {
    (item.fontesPreco || []).forEach(fonte => {
      if (fonte.validade && fonte.ativo) {
        const diasRestantes = Math.ceil(
          (new Date(fonte.validade) - new Date()) / (1000 * 60 * 60 * 24)
        );

        if (diasRestantes < 0) {
          alertas.push({
            tipo: "danger",
            msg: `${item.item}: Preço de "${fonte.fornecedor}" EXPIRADO há ${Math.abs(diasRestantes)} dias`,
            acao: `abrirGerenciadorFontes('${item.id}')`,
          });
        } else if (diasRestantes <= 3) {
          alertas.push({
            tipo: "warning",
            msg: `${item.item}: Preço de "${fonte.fornecedor}" expira em ${diasRestantes} dias`,
            acao: `abrirGerenciadorFontes('${item.id}')`,
          });
        }
      }
    });
  });

  return alertas;
}
```

---

## FLUXO 7 — INTEGRAÇÃO PNCP (Real)

### API PNCP — Endpoints Disponíveis

```
Base URL: https://pncp.gov.br/api/consulta/v1

Endpoints:
1. GET /contratacoes?q={termo}&uf=MG&dataInicial=YYYY-MM-DD&dataFinal=YYYY-MM-DD
2. GET /contratacoes/{cnpjOrgao}/{ano}/{sequencial}
3. GET /contratacoes/{cnpjOrgao}/{ano}/{sequencial}/itens
```

### Netlify Function: api/pncp-search.js

```javascript
// Arquivo: api/pncp-search.js (NOVO)

const PNCP_BASE = "https://pncp.gov.br/api/consulta/v1";

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { action, termo, uf, dataInicial, dataFinal, pagina, cnpj, ano, seq } =
    JSON.parse(event.body);

  const headers = {
    "Accept": "application/json",
    "User-Agent": "PainelCaixaEscolar/1.0",
  };

  try {
    let url;

    switch (action) {
      case "search":
        // Busca por termo (descrição do item)
        const params = new URLSearchParams({
          q: termo,
          uf: uf || "MG",
          dataInicial: dataInicial || getDataMesesAtras(6),
          dataFinal: dataFinal || getHoje(),
          pagina: pagina || 1,
          tamanhoPagina: 20,
          // Filtrar por compras de educação/caixas escolares
          tipos: "ata_registro_precos,contrato",
        });
        url = `${PNCP_BASE}/contratacoes?${params}`;
        break;

      case "detail":
        // Detalhes de uma contratação específica
        url = `${PNCP_BASE}/contratacoes/${cnpj}/${ano}/${seq}`;
        break;

      case "items":
        // Itens de uma contratação
        url = `${PNCP_BASE}/contratacoes/${cnpj}/${ano}/${seq}/itens`;
        break;

      default:
        return { statusCode: 400, body: JSON.stringify({ error: "Action inválida" }) };
    }

    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      const errText = await resp.text();
      return {
        statusCode: resp.status,
        body: JSON.stringify({
          error: `PNCP retornou ${resp.status}`,
          detail: errText
        }),
      };
    }

    const data = await resp.json();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

function getHoje() {
  return new Date().toISOString().split("T")[0];
}

function getDataMesesAtras(meses) {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().split("T")[0];
}
```

### Client-side: Consulta PNCP no Banco de Preços

```javascript
/**
 * Busca preço de referência PNCP para um item do banco.
 * Chamado individualmente por item ou em batch.
 */
async function consultarPNCP(itemNome, itemId) {
  const btn = document.getElementById(`btn-pncp-${itemId}`);
  if (btn) { btn.disabled = true; btn.textContent = "Buscando..."; }

  try {
    const resp = await fetch("/.netlify/functions/pncp-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "search",
        termo: itemNome,
        uf: "MG",
      }),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);

    // Extrair preços dos resultados
    const resultados = data.data || data || [];

    if (resultados.length === 0) {
      showToast(`PNCP: Nenhum resultado para "${itemNome}"`, "warning");
      return null;
    }

    // Para cada contratação, buscar itens e filtrar pelo nosso item
    const precos = [];
    for (const contratacao of resultados.slice(0, 5)) { // Max 5 consultas
      try {
        const itemsResp = await fetch("/.netlify/functions/pncp-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "items",
            cnpj: contratacao.orgaoEntidade?.cnpj,
            ano: contratacao.anoCompra,
            seq: contratacao.sequencialCompra,
          }),
        });

        const itemsData = await itemsResp.json();
        const itensMatch = (itemsData || []).filter(i =>
          i.descricao?.toLowerCase().includes(itemNome.toLowerCase().split(" ")[0])
        );

        itensMatch.forEach(i => {
          if (i.valorUnitarioEstimado || i.valorHomologado) {
            precos.push({
              preco: i.valorHomologado || i.valorUnitarioEstimado,
              orgao: contratacao.orgaoEntidade?.razaoSocial,
              data: contratacao.dataPublicacaoPncp,
              descricao: i.descricao,
              unidade: i.unidadeMedida,
              quantidade: i.quantidadeHomologada || i.quantidade,
            });
          }
        });
      } catch (e) { /* skip failed item lookup */ }
    }

    if (precos.length === 0) {
      showToast(`PNCP: Resultados encontrados mas sem preços extraíveis`, "info");
      return null;
    }

    // Calcular estatísticas
    const valores = precos.map(p => p.preco);
    const stats = {
      mediana: calcMediana(valores),
      media: valores.reduce((a, b) => a + b, 0) / valores.length,
      min: Math.min(...valores),
      max: Math.max(...valores),
      amostras: valores.length,
      detalhes: precos,
      dataConsulta: new Date().toISOString(),
    };

    // Salvar no banco de preços
    const banco = getBancoLocal();
    const item = banco.itens.find(i => i.id === itemId);
    if (item) {
      item.pncp = stats;
      item.precoReferencia = stats.mediana;  // Mediana como referência
      item.ultimaConsultaPncp = stats.dataConsulta;
      saveBancoLocal();
    }

    // Cache local (7 dias)
    const cache = JSON.parse(localStorage.getItem("caixaescolar.pncp.cache") || "{}");
    cache[itemId] = { ...stats, expira: Date.now() + (7 * 24 * 60 * 60 * 1000) };
    localStorage.setItem("caixaescolar.pncp.cache", JSON.stringify(cache));

    return stats;

  } catch (err) {
    showToast("Erro PNCP: " + err.message, "error");
    return null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "PNCP"; }
  }
}

function calcMediana(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
```

### Indicador PNCP no Pré-Orçamento

```javascript
/**
 * Exibe indicador de competitividade PNCP ao lado do preço no pré-orçamento.
 * Verde: abaixo da mediana, Amarelo: na faixa, Vermelho: acima
 */
function renderPncpIndicator(item) {
  const banco = getBancoLocal();
  const bp = banco.itens.find(b =>
    b.item.toLowerCase().includes(item.nome.toLowerCase())
  );

  if (!bp?.pncp?.mediana) return "";

  const mediana = bp.pncp.mediana;
  const nossoPreco = item.precoUnitario;
  const delta = ((nossoPreco - mediana) / mediana * 100).toFixed(1);

  let cor, icone, label;
  if (nossoPreco <= mediana) {
    cor = "success"; icone = "▼"; label = "Competitivo";
  } else if (nossoPreco <= mediana * 1.10) {
    cor = "warning"; icone = "■"; label = "Na faixa";
  } else {
    cor = "danger"; icone = "▲"; label = "Acima";
  }

  return `
    <span class="pncp-badge pncp-${cor}" title="Mediana PNCP: R$ ${mediana.toFixed(2)} | ${bp.pncp.amostras} amostras">
      ${icone} ${delta > 0 ? "+" : ""}${delta}% PNCP
    </span>
  `;
}
```

### Consulta Batch PNCP

```javascript
/**
 * Consulta PNCP para todos os itens do banco de preços.
 * Respeita rate limit: 1 consulta/segundo
 */
async function consultarPncpBatch() {
  const banco = getBancoLocal();
  const cache = JSON.parse(localStorage.getItem("caixaescolar.pncp.cache") || "{}");

  const itensPendentes = banco.itens.filter(item => {
    const cached = cache[item.id];
    return !cached || cached.expira < Date.now();
  });

  if (itensPendentes.length === 0) {
    showToast("Todos os itens já têm consulta PNCP válida (cache 7 dias)");
    return;
  }

  const progressBar = document.getElementById("pncp-progress");
  if (progressBar) progressBar.style.display = "block";

  let processados = 0;
  for (const item of itensPendentes) {
    await consultarPNCP(item.item, item.id);
    processados++;
    if (progressBar) {
      progressBar.querySelector(".bar").style.width =
        `${(processados / itensPendentes.length * 100).toFixed(0)}%`;
      progressBar.querySelector(".label").textContent =
        `${processados}/${itensPendentes.length} itens consultados`;
    }
    // Rate limit: 1 req/sec
    await new Promise(r => setTimeout(r, 1200));
  }

  showToast(`PNCP: ${processados} itens atualizados`);
  renderBancoPrecos();  // Re-renderiza banco com indicadores PNCP
}
```

---

## FLUXO COMPLETO — CICLO DE VIDA DE UM ORÇAMENTO

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  1. PRÉ-ORÇAMENTO (Aba: Pré-Orçamento)                                │
│     └─ Cria proposta com itens + marca + margem                         │
│     └─ Simulador de cenários (conservador/moderado/agressivo)           │
│     └─ Indicador PNCP em cada item (Fluxo 7)                          │
│     └─ Marca auto-replica em observação (Fluxo 1)                      │
│                                                                          │
│  2. APROVAÇÃO → Aba: Aprovados                                         │
│     └─ Status: pendente → aprovado                                      │
│                                                                          │
│  3. ENVIO SGD (Aba: Envio SGD)                                         │
│     └─ Payload com marca na observação                                  │
│     └─ Status: aprovado → enviado                                       │
│     └─ Botão "Registrar Resultado" (Fluxo 2)                          │
│                                                                          │
│  4. RESULTADO MANUAL (Modal no Envio SGD)                              │
│     └─ Marca: GANHEI → gera contrato (Fluxo 3)                        │
│     └─ Marca: PERDI → registra vencedor + delta                        │
│     └─ Alimenta banco de preços automaticamente                        │
│                                                                          │
│  5. CONTRATO (Aba: Aprovados → detalhe)                                │
│     └─ CTR-{escola}-{ano}-{seq}                                        │
│     └─ Rastreia entregas por item                                       │
│     └─ Integra com GDP para logística                                   │
│                                                                          │
│  6. HISTÓRICO (Aba: Histórico)                                         │
│     └─ Ganhos vs Perdidos                                               │
│     └─ Análise por grupo: taxa conversão, margem segura                │
│     └─ Referência: "preço que ganha" por item                          │
│     └─ Insights automáticos                                             │
│                                                                          │
│  7. BANCO ALIMENTADO (Aba: Banco de Preços)                            │
│     └─ AI Import de tabelas de fornecedores (Fluxo 5)                  │
│     └─ Múltiplas fontes B2B com validade (Fluxo 6)                     │
│     └─ Referência PNCP real (Fluxo 7)                                  │
│     └─ Histórico de preços que ganharam (Fluxo 4)                      │
│     └─ Alertas: preço expirado, margem apertada                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## CHECKLIST DE IMPLEMENTAÇÃO

### Sprint 1 — P0 + P1 (Foundation) — IMPLEMENTADO
- [x] **F1** — buildObservacaoSgd() + patch nos 3 pontos do app.js
- [x] **F4** — Adicionar abas "aprovados" e "historico" no HTML + switchTab()
- [x] **F2** — Schema de resultados + modal registro + salvarResultado()
- [x] **F3** — Schema de contratos + gerarContratoDeResultado() + renderAprovados()
- [x] **F4** — renderHistorico() + sub-tabs (ganhos/perdidos/análise)
- [x] **F2+F4** — alimentarBancoComResultado() + sync Supabase

### Sprint 2 — P2 (Intelligence) — IMPLEMENTADO
- [x] **F5** — Netlify Function api/ai-parse-price.js + env var OPENAI_API_KEY
- [x] **F5** — Client-side importarComIA() + matchAIResultWithBanco()
- [x] **F5** — Botão "Importar com IA" no modal de import
- [x] **F7** — Netlify Function api/pncp-search.js
- [x] **F7** — consultarPNCP() + consultarPncpBatch() + cache 7 dias
- [x] **F7** — renderPncpIndicator() no banco de preços
- [x] **F7** — Rewrite no vercel.json para as novas functions

### Sprint 3 — P3 (B2B + Polish) — IMPLEMENTADO
- [x] **F6** — Schema fontesPreco + abrirGerenciadorFontes()
- [x] **F6** — checkFontesExpiradas() integrado nos alertas
- [x] **F6** — Melhor preço automático por item
- [ ] **Polish** — CSS para novas abas, badges, indicadores PNCP
- [x] **Polish** — Exportar contratos como CSV
- [ ] **Polish** — Dashboard atualizado com métricas de conversão

---

## NOTAS PARA O @dev

1. **Não quebrar o que funciona.** O envio ao SGD, import multi-formato e sync Supabase estão operacionais. Todas as mudanças são ADITIVAS.

2. **localStorage keys novas:**
   - `caixaescolar.resultados.v1` — resultados de propostas
   - `caixaescolar.contratos.v1` — contratos gerados
   - `caixaescolar.pncp.cache` — cache de consultas PNCP

3. **Sync Supabase:** Adicionar as novas keys ao array SYNC_KEYS.

4. **Netlify Functions novas:**
   - `api/ai-parse-price.js` — requer env OPENAI_API_KEY
   - `api/pncp-search.js` — sem auth, API pública

5. **vercel.json:** Adicionar rewrites para as 2 novas functions.

6. **Status do pré-orçamento:** Adicionar dois novos estados:
   - `"ganho"` — proposta vencedora
   - `"perdido"` — proposta não selecionada
   (Além dos existentes: pendente, aprovado, enviado, recusado)

7. **Ordem de implementação:** Seguir a checklist. F1 primeiro (quick win), depois F4 (abas), depois F2+F3 (registros), depois F5+F7 (AI+PNCP).

---

*SOP fabricado por Deming — SOP Factory v2.0*
*Grau de detalhe: EXECUTION-READY — nenhuma ambiguidade para o @dev*
