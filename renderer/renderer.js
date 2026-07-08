document.addEventListener('DOMContentLoaded', () => {
  const MSG_PADRAO = 'Prezados,\n\ntudo bem?\n\nEstou criando esse ticket a fim de formalizar um atendimento.\n\n';

  // ========== SPLASH SCREEN ==========
  setTimeout(() => {
    document.getElementById('splash').classList.add('hidden');
  }, 1800);

  // ========== TITLEBAR ==========
  document.getElementById('btn-minimize').addEventListener('click', () => window.api.window.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.api.window.maximize());
  document.getElementById('btn-close').addEventListener('click', () => window.api.window.close());

  // ========== SIDEBAR NAV ==========
  const sidebarBtns = document.querySelectorAll('.sidebar-btn');
  const views = document.querySelectorAll('.view');
  const viewTitle = document.getElementById('view-title');
  const titles = {
    novo: 'Novo Atendimento',
    fila: 'Fila de Rascunhos',
    historico: 'Historico',
    config: 'Configuracoes',
    manual: 'Manual',
    logs: 'Logs do Processamento'
  };

  sidebarBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sidebarBtns.forEach(b => b.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      document.getElementById('view-' + view).classList.add('active');
      viewTitle.textContent = titles[view];
      if (view === 'fila') renderFila();
      if (view === 'historico') renderHistorico();
    });
  });

  // ========== TOAST ==========
  function showToast(msg, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, duration);
  }

  // ========== SKELETON LOADING ==========
  function showSkeletonFila(container) {
    const count = Math.floor(Math.random() * 2) + 3;
    container.innerHTML = Array(count).fill(`
      <div class="skeleton">
        <div class="skeleton-row">
          <div class="skeleton-line w60"></div>
          <div class="skeleton-line w40"></div>
        </div>
        <div class="skeleton-line w40"></div>
        <div class="skeleton-line w80"></div>
        <div class="skeleton-footer">
          <div class="skeleton-btn"></div>
          <div style="display:flex;gap:6px">
            <div class="skeleton-btn"></div>
            <div class="skeleton-btn"></div>
            <div class="skeleton-btn"></div>
          </div>
        </div>
      </div>
    `).join('');
  }

  function showSkeletonHistorico(container) {
    const count = Math.floor(Math.random() * 2) + 3;
    container.innerHTML = Array(count).fill(`
      <div class="skeleton" style="display:flex;align-items:center;gap:12px">
        <div class="skeleton-btn" style="width:36px;height:36px;border-radius:10px;flex-shrink:0"></div>
        <div style="flex:1">
          <div class="skeleton-line w40"></div>
          <div class="skeleton-line w60" style="margin-top:8px"></div>
        </div>
        <div class="skeleton-line" style="width:80px"></div>
      </div>
    `).join('');
  }

  // ========== MODAL EDITAR ==========
  const modal = document.getElementById('modal-editar');
  const formEditar = document.getElementById('form-editar');
  let editandoId = null;

  function abrirEditar(item) {
    editandoId = item._id;
    document.getElementById('edit-empresa').value = item.empresa || '';
    document.getElementById('edit-contato').value = item.contato || '';
    document.getElementById('edit-modulo').value = item.modulo || '';
    document.getElementById('edit-telefone').value = item.telefone || '';
    document.getElementById('edit-sistema').value = item.sistema || 'SIGA';
    document.getElementById('edit-titulo').value = item.titulo || '';
    document.getElementById('edit-descricao').value = item.descricao || '';
    modal.classList.add('active');
  }

  function fecharEditar() {
    modal.classList.remove('active');
    editandoId = null;
  }

  document.getElementById('btn-fechar-modal').addEventListener('click', fecharEditar);
  document.getElementById('btn-cancelar-editar').addEventListener('click', fecharEditar);
  modal.addEventListener('click', (e) => { if (e.target === modal) fecharEditar(); });

  formEditar.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editandoId) return;

    const updates = {
      empresa: document.getElementById('edit-empresa').value.trim(),
      empresaNome: document.getElementById('edit-empresa').value.trim(),
      contato: document.getElementById('edit-contato').value.trim(),
      modulo: document.getElementById('edit-modulo').value.trim(),
      moduloNome: document.getElementById('edit-modulo').value.trim(),
      sistema: document.getElementById('edit-sistema').value,
      telefone: document.getElementById('edit-telefone').value.trim(),
      titulo: document.getElementById('edit-titulo').value.trim(),
      descricao: document.getElementById('edit-descricao').value.trim(),
      erro: '' // Limpar erro ao editar
    };

    await window.api.fila.update(editandoId, updates);
    fecharEditar();
    showToast('Rascunho atualizado!');
    renderFila();
  });

  // ========== NOVO ATENDIMENTO ==========
  document.getElementById('form-novo').addEventListener('submit', async (e) => {
    e.preventDefault();

    const empresaVal = document.getElementById('campo-empresa').value.trim();
    const moduloVal = document.getElementById('campo-modulo').value.trim();

    const rascunho = {
      empresa: empresaVal,
      empresaNome: empresaVal,
      contato: document.getElementById('campo-contato').value.trim(),
      modulo: moduloVal,
      moduloNome: moduloVal,
      sistema: document.getElementById('campo-sistema').value,
      telefone: document.getElementById('campo-telefone').value.trim(),
      titulo: document.getElementById('campo-titulo').value.trim(),
      descricao: document.getElementById('campo-descricao').value.trim(),
      concluido: false,
      criadoEm: new Date().toISOString()
    };

    await window.api.fila.add(rascunho);
    e.target.reset();
    document.getElementById('campo-descricao').value = MSG_PADRAO;
    document.getElementById('campo-sistema').value = 'SIGA';
    showToast('Rascunho salvo na fila!');
    updateBadge();
  });

  // ========== FILA ==========
  async function renderFila() {
    const container = document.getElementById('lista-fila');
    showSkeletonFila(container);

    await new Promise(r => setTimeout(r, 400));

    const fila = await window.api.fila.get();
    const countEl = document.getElementById('fila-count');

    countEl.textContent = fila.length + ' rascunho(s)';

    if (fila.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          <p>Nenhum rascunho na fila</p>
        </div>`;
      return;
    }

    container.innerHTML = fila.map((r, i) => {
      const isConcluido = r.concluido === true;
      const temErro = r.erro && r.erro.trim() !== '';
      return `
      <div class="rascunho-card ${isConcluido ? 'card-concluido' : ''} ${temErro ? 'card-erro' : ''}" style="animation-delay: ${i * 0.05}s">
        <div class="rascunho-top">
          <span class="rascunho-empresa">${esc(r.empresaNome || r.empresa)}</span>
          <div class="rascunho-tags">
            <span class="rascunho-modulo">${esc(r.moduloNome || r.modulo)}</span>
            <span class="rascunho-sistema">${esc(r.sistema || 'SIGA')}</span>
          </div>
        </div>
        <div class="rascunho-contato">Contato: ${esc(r.contato)}</div>
        <div class="rascunho-titulo">${esc(r.titulo)}</div>
        <div class="rascunho-desc" title="${esc(r.descricao)}">${esc(r.descricao)}</div>
        ${temErro ? `<div class="rascunho-erro">${esc(r.erro)}</div>` : ''}
        <div class="rascunho-footer">
          <label class="check-concluido">
            <input type="checkbox" data-action="toggle-concluido" data-id="${r._id}" ${isConcluido ? 'checked' : ''}>
            <span class="checkmark"></span>
            Concluido
          </label>
          <div class="rascunho-actions">
            <button class="btn btn-edit btn-small" data-action="editar" data-id="${r._id}">Editar</button>
            <button class="btn btn-primary btn-small" data-action="enviar" data-id="${r._id}">Enviar</button>
            <button class="btn btn-danger btn-small" data-action="excluir" data-id="${r._id}">Excluir</button>
          </div>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('[data-action="toggle-concluido"]').forEach(cb => {
      cb.addEventListener('change', async () => {
        await window.api.fila.update(cb.dataset.id, { concluido: cb.checked });
        renderFila();
      });
    });

    container.querySelectorAll('[data-action="editar"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const all = await window.api.fila.get();
        const item = all.find(f => f._id === btn.dataset.id);
        if (item) abrirEditar(item);
      });
    });

    container.querySelectorAll('[data-action="enviar"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const all = await window.api.fila.get();
        const item = all.find(f => f._id === btn.dataset.id);
        if (item) {
          window.api.fila.processar([item]);
          showToast('Enviando atendimento...');
        }
      });
    });

    container.querySelectorAll('[data-action="excluir"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await window.api.fila.remove(btn.dataset.id);
        showToast('Rascunho removido.');
        updateBadge();
        renderFila();
      });
    });
  }

  document.getElementById('btn-processar-todos').addEventListener('click', async () => {
    const fila = await window.api.fila.get();
    if (fila.length === 0) { showToast('Fila vazia!'); return; }

    window.api.fila.processar(fila);
    showToast(`Processando ${fila.length} atendimento(s)...`);
  });

  // ========== LOGS ==========
  const logContainer = document.getElementById('lista-logs');
  const logCount = document.getElementById('logs-count');
  let logMessages = [];

  function renderLogEntry(entry) {
    const div = document.createElement('div');
    div.className = `log-entry log-${entry.type}`;
    div.innerHTML = `<span class="log-time">${esc(entry.time)}</span>${esc(entry.text)}`;
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
    logMessages.push(entry);
    logCount.textContent = logMessages.length + ' mensagem(ns)';
  }

  window.api.logs.onMessage((data) => {
    if (logContainer.querySelector('.empty-state')) {
      logContainer.innerHTML = '';
    }
    renderLogEntry(data);
  });

  window.api.logs.onClear(() => {
    logContainer.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
        <p>Nenhum log ainda. Inicie o processamento para ver os logs aqui.</p>
      </div>`;
    logMessages = [];
    logCount.textContent = '0 mensagem(ns)';
  });

  document.getElementById('btn-limpar-logs').addEventListener('click', () => {
    logContainer.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
        <p>Nenhum log ainda. Inicie o processamento para ver os logs aqui.</p>
      </div>`;
    logMessages = [];
    logCount.textContent = '0 mensagem(ns)';
  });

  // ========== IPC LISTENERS ==========
  window.api.fila.onStatus((data) => {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (data.processando) {
      dot.classList.add('processing');
      text.textContent = 'Processando...';
    } else {
      dot.classList.remove('processing');
      text.textContent = 'Pronto';
    }
  });

  window.api.fila.onItemIniciando((data) => {
    const text = document.getElementById('status-text');
    text.textContent = `${data.index}/${data.total}: ${data.item.empresa}`;
  });

  window.api.fila.onItemConcluido((data) => {
    if (data.sucesso) {
      const num = String(data.ticketNum);
      const msg = data.item.concluido
        ? `Ticket #${num} criado e CONCLUIDO!`
        : `Ticket #${num} criado com sucesso!`;
      showToast(msg, 5000);
    } else {
      // Salvar erro no item para exibir no card
      window.api.fila.update(data.item._id, { erro: data.erro });
      showToast(`Erro: ${data.erro}`, 5000);
    }
    renderFila();
    renderHistorico();
    updateBadge();
  });

  // ========== HISTORICO ==========
  document.getElementById('btn-limpar-historico').addEventListener('click', async () => {
    await window.api.historico.clear();
    showToast('Historico limpo!');
    renderHistorico();
  });

  async function renderHistorico() {
    const container = document.getElementById('lista-historico');
    showSkeletonHistorico(container);

    await new Promise(r => setTimeout(r, 400));

    const hist = await window.api.historico.get();

    if (hist.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <p>Nenhum ticket criado ainda</p>
        </div>`;
      return;
    }

    container.innerHTML = hist.map((h, i) => `
      <div class="historico-card" style="animation-delay: ${i * 0.05}s">
        <div class="historico-left">
          <div class="historico-icon">#</div>
          <div class="historico-info">
            <span class="historico-ticket">#${esc(String(h.numero))}</span>
            <span class="historico-empresa">${esc(h.empresa)}</span>
            ${h.telefone ? `<span class="historico-telefone">${esc(h.telefone)}</span>` : ''}
          </div>
        </div>
        <span class="historico-data">${fmtDate(h.criadoEm)}</span>
      </div>
    `).join('');
  }

  // ========== CONFIG ==========
  async function loadConfig() {
    const c = await window.api.credenciais.get();
    if (c.usuario) document.getElementById('campo-usuario').value = c.usuario;
    if (c.senha) document.getElementById('campo-senha').value = c.senha;
  }

  document.getElementById('form-config').addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario = document.getElementById('campo-usuario').value.trim();
    const senha = document.getElementById('campo-senha').value;

    await window.api.credenciais.save({ usuario, senha });

    const status = document.getElementById('config-status');
    status.textContent = 'Credenciais salvas com sucesso!';
    status.className = 'status-msg success';
    status.style.display = 'block';
    setTimeout(() => { status.style.display = 'none'; }, 3000);
  });

  // ========== THEME ==========
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fasticket-theme', theme);
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }

  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });

  const savedTheme = localStorage.getItem('fasticket-theme') || 'corporate-blue';
  applyTheme(savedTheme);

  // ========== HELPERS ==========
  async function updateBadge() {
    const fila = await window.api.fila.get();
    const badge = document.getElementById('badge-fila');
    if (fila.length > 0) {
      badge.textContent = fila.length;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }

  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // ========== INIT ==========
  document.getElementById('campo-descricao').value = MSG_PADRAO;
  loadConfig();
  renderFila();
  renderHistorico();
  updateBadge();
});
