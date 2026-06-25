document.addEventListener('DOMContentLoaded', () => {
  const MSG_PADRAO = 'Prezados,\n\ntudo bem?\n\nEstou criando esse ticket a fim de formalizar um atendimento.\n\n';

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
    config: 'Configuracoes'
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

  // ========== MODAL EDITAR ==========
  const modal = document.getElementById('modal-editar');
  const formEditar = document.getElementById('form-editar');
  let editandoId = null;

  function abrirEditar(item) {
    editandoId = item._id;
    document.getElementById('edit-empresa').value = item.empresa || '';
    document.getElementById('edit-contato').value = item.contato || '';
    document.getElementById('edit-modulo').value = item.modulo || '';
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
      titulo: document.getElementById('edit-titulo').value.trim(),
      descricao: document.getElementById('edit-descricao').value.trim()
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
      titulo: document.getElementById('campo-titulo').value.trim(),
      descricao: document.getElementById('campo-descricao').value.trim(),
      concluido: false,
      criadoEm: new Date().toISOString()
    };

    await window.api.fila.add(rascunho);
    e.target.reset();
    document.getElementById('campo-descricao').value = MSG_PADRAO;
    showToast('Rascunho salvo na fila!');
    updateBadge();
  });

  // ========== FILA ==========
  async function renderFila() {
    const fila = await window.api.fila.get();
    const container = document.getElementById('lista-fila');
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

    container.innerHTML = fila.map(r => {
      const isConcluido = r.concluido === true;
      return `
      <div class="rascunho-card ${isConcluido ? 'card-concluido' : ''}">
        <div class="rascunho-top">
          <span class="rascunho-empresa">${esc(r.empresaNome || r.empresa)}</span>
          <span class="rascunho-modulo">${esc(r.moduloNome || r.modulo)}</span>
        </div>
        <div class="rascunho-contato">Contato: ${esc(r.contato)}</div>
        <div class="rascunho-titulo">${esc(r.titulo)}</div>
        <div class="rascunho-desc" title="${esc(r.descricao)}">${esc(r.descricao)}</div>
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

  window.api.fila.onItemConcluido((data) => {
    if (data.sucesso) {
      const num = String(data.ticketNum);
      const msg = data.item.concluido
        ? `Ticket #${num} criado e CONCLUIDO!`
        : `Ticket #${num} criado com sucesso!`;
      showToast(msg, 5000);
    } else {
      showToast(`Erro: ${data.erro}`, 5000);
    }
    renderFila();
    renderHistorico();
    updateBadge();
  });

  // ========== HISTORICO ==========
  async function renderHistorico() {
    const hist = await window.api.historico.get();
    const container = document.getElementById('lista-historico');

    if (hist.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <p>Nenhum ticket criado ainda</p>
        </div>`;
      return;
    }

    container.innerHTML = hist.map(h => `
      <div class="historico-card">
        <div class="historico-left">
          <div class="historico-icon">#</div>
          <div class="historico-info">
            <span class="historico-ticket">#${esc(String(h.numero))}</span>
            <span class="historico-empresa">${esc(h.empresa)}</span>
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
