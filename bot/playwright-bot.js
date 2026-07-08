const { chromium } = require('playwright-core');
const path = require('path');
const logger = require('./logger');

const PORTAL_URL = 'https://portaldocliente.praxio.com.br';
const TICKET_URL = PORTAL_URL + '/Ticket/NovoTicketAnalista';
const LOGIN_URL = PORTAL_URL + '/Home/Index';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function normalizar(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${ms}ms: ${label}`)), ms)
    )
  ]);
}

class PlaywrightBot {
  constructor() {
    this.browser = null;
    this.page = null;
    this.usuario = null;
  }

  async init() {
    const browserPath = path.join(__dirname, '..', 'browser', 'chrome-win64', 'chrome.exe');
    this.browser = await chromium.launch({
      headless: true,
      executablePath: browserPath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'pt-BR',
      ignoreHTTPSErrors: true
    });
    this.page = await context.newPage();

    this.page.on('console', msg => {
      if (msg.type() === 'error') logger.pageError(msg.text());
    });
    this.page.on('pageerror', err => logger.pageError(err.message));
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async login(usuario, senha) {
    this.usuario = usuario;
    await this.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    const loginField = await this.page.$('#txtLogin');
    const passField = await this.page.$('#txtSenha');
    const btnEntrar = await this.page.$('#btnEntrar');

    if (!loginField || !passField || !btnEntrar) {
      throw new Error('Campos de login nao encontrados');
    }

    await loginField.fill(usuario);
    await sleep(150);
    await passField.fill(senha);
    await sleep(200);

    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
      btnEntrar.click()
    ]);
    await sleep(2000);

    if (this.page.url().includes('/Home/Index')) {
      throw new Error('Login falhou - credenciais invalidas');
    }

    logger.loginSuccess();
    await this.page.goto(TICKET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    const pageType = await this.detectPage();
    if (pageType === 'login') {
      throw new Error('Sessao expirada');
    }

    logger.systemReady();
  }

  async detectPage() {
    return await this.page.evaluate(() => {
      if (document.querySelector('#txtLogin')) return 'login';
      if (document.querySelector('#frmNovoTicket')) return 'criacao';
      if (document.querySelector('#TicketMlo_Cliente_Codigo')) return 'detalhes';
      if (document.querySelector('.nav.nav-list') || document.querySelector('[class*="NovoTicket"]')) return 'detalhes';
      return 'lista';
    });
  }

  async selectFromChosen(containerId, searchText) {
    const normalizedSearch = normalizar(searchText);

    const resultado = await withTimeout(
      this.page.evaluate(({ cid, normalizedSearch }) => {
        const container = document.getElementById(cid);
        if (!container) return { ok: false, reason: 'container not found' };

        const selectId = cid.replace(/_chosen$/, '');
        const selectEl = document.getElementById(selectId);
        if (!selectEl) return { ok: false, reason: 'select not found: #' + selectId };

        const options = selectEl.querySelectorAll('option');
        const allOpts = [];
        let exactMatch = null;
        let startsWithMatch = null;
        let containsMatch = null;

        for (const opt of options) {
          if (!opt.value || opt.value === '') continue;
          const txt = opt.textContent.trim();
          const upper = txt.toUpperCase();
          const normTxt = upper.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          allOpts.push(txt);

          // Match exato (100% confiança)
          if (normTxt === normalizedSearch) {
            exactMatch = opt;
            break;
          }

          // Match no início do texto (ex: "LOCAFAST" em "LOCAFAST LTDA")
          if (!startsWithMatch && normTxt.startsWith(normalizedSearch)) {
            startsWithMatch = opt;
          }

          // Match em qualquer parte do texto (ex: "FR" em "FRE - Fretamento")
          if (!containsMatch && normTxt.includes(normalizedSearch)) {
            containsMatch = opt;
          }
        }

        // Priorizar: exato > startsWith > contains
        const bestMatch = exactMatch || startsWithMatch || containsMatch;

        if (bestMatch) {
          selectEl.value = bestMatch.value;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof $ !== 'undefined' && $(selectEl).trigger) {
            $(selectEl).trigger('chosen:updated');
          }
          return {
            ok: true,
            text: bestMatch.textContent.trim(),
            exact: !!exactMatch
          };
        }

        return {
          ok: false,
          reason: 'Nenhum resultado para "' + normalizedSearch + '"',
          available: allOpts.slice(0, 15)
        };
      }, { cid: containerId, normalizedSearch }),
      5000, 'selectFromChosen-direct'
    );

    return resultado;
  }

  async corrigirAbertura() {
    const corrigido = await this.page.evaluate(() => {
      const abertura = document.querySelector('#TicketMlo_DataAbertura') ||
                       document.querySelector('[name*="Abertura"]') ||
                       document.querySelector('[name*="abertura"]');
      if (!abertura) return { ok: false, reason: 'campo nao encontrado' };

      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const dataAtual = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      abertura.value = dataAtual;
      abertura.dispatchEvent(new Event('input', { bubbles: true }));
      abertura.dispatchEvent(new Event('change', { bubbles: true }));

      return { ok: true, value: dataAtual };
    });
    return corrigido;
  }

  async processarItem(item) {
    await this.ensureTicketPage();
    await sleep(1000);

    // 1. Selecionar empresa
    const empresaResult = await this.selectFromChosen('TicketMlo_Cliente_Codigo_chosen', item.empresa);
    if (!empresaResult.ok) {
      logger.step('Selecionando empresa', false, empresaResult.reason);
      try { await this.ensureTicketPage(); } catch (e) {}
      return { ok: false, erro: 'Empresa não encontrada: ' + item.empresa };
    }
    const empresaInfo = empresaResult.exact ? null : `Encontrado: "${empresaResult.text}" (busca: "${item.empresa}")`;
    logger.step('Selecionando empresa', true, empresaInfo);
    await sleep(1500);

    // 2. Selecionar contato
    if (item.contato) {
      const contatoResult = await this.selectFromChosen('TicketMlo_OperadorContato_Id_chosen', item.contato);
      if (!contatoResult.ok) {
        logger.step('Selecionando contato', false, 'Contato não encontrado, buscando fallback ADM...');
        const admResult = await this.selectAdmContact();
        if (admResult.ok) {
          logger.step('Selecionando contato (fallback ADM)', true, `Encontrado: "${admResult.text}"`);
        } else {
          logger.step('Selecionando contato', false, 'Nenhum contato ADM encontrado');
        }
      } else {
        const contatoInfo = contatoResult.exact ? null : `Encontrado: "${contatoResult.text}" (busca: "${item.contato}")`;
        logger.step('Selecionando contato', true, contatoInfo);
      }
      await sleep(1000);
    }

    // 3. Selecionar sistema
    const sistema = item.sistema || 'SIGA';
    const sistemaResult = await this.selectFromChosen('Sistema_chosen', sistema);
    if (!sistemaResult.ok) {
      logger.step('Selecionando sistema', false, sistemaResult.reason);
      try { await this.ensureTicketPage(); } catch (e) {}
      return { ok: false, erro: 'Sistema não encontrado: ' + sistema };
    }
    const sistemaInfo = sistemaResult.exact ? null : `Encontrado: "${sistemaResult.text}" (busca: "${sistema}")`;
    logger.step('Selecionando sistema', true, sistemaInfo);
    await sleep(1500);

    // 4. Selecionar módulo
    if (item.modulo) {
      const moduloResult = await this.selectFromChosen('TicketMlo_Modulo_Id_chosen', item.modulo);
      if (!moduloResult.ok) {
        logger.step('Selecionando módulo', false, moduloResult.reason);
        try { await this.ensureTicketPage(); } catch (e) {}
        return { ok: false, erro: 'Módulo não encontrado: ' + item.modulo };
      }
      const moduloInfo = moduloResult.exact ? null : `Encontrado: "${moduloResult.text}" (busca: "${item.modulo}")`;
      logger.step('Selecionando módulo', true, moduloInfo);
      await sleep(1500);
    }

    // 5. Definir responsável
    const responsavelOk = await this.selectResponsavel(this.usuario);
    logger.step('Definindo responsável', responsavelOk, responsavelOk ? null : 'Responsável não encontrado');
    await sleep(800);

    // 6. Preencher informações
    if (item.titulo) {
      await withTimeout(
        this.page.evaluate((text) => {
          const el = document.querySelector('#TicketMlo_Assunto');
          if (!el) return false;
          el.value = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }, item.titulo),
        5000, 'preencher-assunto'
      );
    }

    const textoChamado = 'Chamado telefônico';
    await withTimeout(
      this.page.evaluate((text) => {
        const editor = document.querySelector('#EditorDescricao');
        if (!editor) return false;
        editor.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, text);

        const hidden = document.querySelector('#TramiteMlo_Descricao');
        if (hidden) hidden.value = text;
        return true;
      }, textoChamado),
      10000, 'preencher-descricao'
    );

    const aberturaResult = await this.corrigirAbertura();
    logger.step('Preenchendo informações', aberturaResult.ok, aberturaResult.ok ? null : 'Erro ao preencher abertura');
    await sleep(500);

    // 7. Salvar chamado
    const gravou = await this.page.evaluate(() => {
      const btn = document.querySelector('#btnGravar');
      if (!btn) return false;
      btn.click();
      return true;
    });

    if (!gravou) {
      throw new Error('Botao Gravar nao encontrado');
    }

    try {
      await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
      // Não houve redirect
    }
    await sleep(2000);

    const erros = await this.page.evaluate(() => {
      const errosEl = document.querySelectorAll('.validation-summary-errors li, .alert-danger, .field-validation-error');
      return Array.from(errosEl).map(el => el.textContent.trim()).filter(Boolean);
    });

    if (erros.length > 0) {
      logger.step('Salvando chamado', false, 'Erros de validação: ' + erros.join(' | '));
      return { ok: false, erro: erros.join(' | ') };
    }

    const ticketNum = await this.getTicketNumber();
    if (!ticketNum) {
      logger.step('Salvando chamado', false, 'Não foi possível capturar o número do ticket');
      return { ok: false, erro: 'Nao foi possivel capturar o numero do ticket' };
    }

    logger.step('Salvando chamado', true);
    logger.ticketGenerated(ticketNum);

    // 8. Inserir descrição
    if (item.descricao) {
      await sleep(2000);
      await this.inserirTramite(item.descricao);
      await sleep(1500);
      logger.step('Inserindo descrição', true);
    }

    // 9. Definir prioridade
    await sleep(1000);
    await this.preencherNaturezaPrioridade();
    await sleep(1000);
    logger.step('Definindo prioridade', true);

    // 10. Enviar para atendimento
    await sleep(1000);
    await this.enviarTramite('Em andamento');
    await sleep(1500);
    logger.step('Enviando para atendimento', true);

    if (item.concluido) {
      await sleep(2000);
      const textoConclusao = `Olá.

Estamos concluindo o atendimento.
Em caso de necessidade, salientamos que esse ticket pode ser reaberto em até 5 dias ou um novo ticket pode ser aberto a qualquer instante.

A sua satisfação é o nosso maior objetivo! Agradecemos se puder avaliar o nosso atendimento e também a solução dada para a sua demanda.
:)`;
      await this.inserirTramite(textoConclusao);
      await sleep(1500);
      await this.enviarTramite('Concluido');
    }

    return { ok: true, ticketNum };
  }

  async selectResponsavel(usuario) {
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const responsavelValue = await this.page.evaluate(() => {
        const el = document.querySelector('#TicketMlo_OperadorResponsavel_Id');
        return el ? el.value : null;
      });

      if (responsavelValue) {
        return true;
      }

      const username = (usuario || this.usuario || '').toUpperCase().trim();

      const selecionado = await this.page.evaluate((searchName) => {
        const select = document.querySelector('#Responsavel');
        if (!select) return { ok: false, reason: '#Responsavel nao encontrado' };

        const operadorId = document.querySelector('#TicketMlo_OperadorResponsavel_Id');
        if (operadorId && operadorId.value) return { ok: true, value: operadorId.value };

        const options = select.querySelectorAll('option');

        if (searchName) {
          for (const opt of options) {
            if (!opt.value || opt.value === '') continue;
            if (opt.parentElement.matches('optgroup[label=""]')) continue;
            const texto = opt.textContent.trim().toUpperCase();
            if (texto === searchName || texto.includes(searchName) || searchName.includes(texto)) {
              select.value = opt.value;
              operadorId.value = opt.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              return { ok: true, value: opt.value, texto: opt.textContent.trim() };
            }
          }
        }

        return { ok: false, reason: 'nenhum operador encontrado' };
      }, username);

      if (selecionado.ok) return true;

      if (tentativa < 2) {
        await sleep(1000);
      }
    }

    return false;
  }

  async selectAdmContact() {
    return await this.page.evaluate(() => {
      const containerId = 'TicketMlo_OperadorContato_Id_chosen';
      const container = document.getElementById(containerId);
      if (!container) return { ok: false, reason: 'container not found' };

      const selectId = containerId.replace(/_chosen$/, '');
      const selectEl = document.getElementById(selectId);
      if (!selectEl) return { ok: false, reason: 'select not found' };

      const options = selectEl.querySelectorAll('option');
      let admMatch = null;

      for (const opt of options) {
        if (!opt.value || opt.value === '') continue;
        const txt = opt.textContent.trim().toUpperCase();
        if (txt.includes('ADM')) {
          admMatch = opt;
          break;
        }
      }

      if (admMatch) {
        selectEl.value = admMatch.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof $ !== 'undefined' && $(selectEl).trigger) {
          $(selectEl).trigger('chosen:updated');
        }
        return { ok: true, text: admMatch.textContent.trim() };
      }

      return { ok: false, reason: 'Nenhum contato ADM encontrado' };
    });
  }

  async preencherNaturezaPrioridade() {
    await this.page.evaluate(() => {
      const btn = document.querySelector('#btnOpcoesNatureza');
      if (btn) btn.click();
    });
    await sleep(800);

    await this.page.evaluate(() => {
      const itens = document.querySelectorAll('#listaNatureza li a.itemNatureza');
      for (const item of itens) {
        const li = item.closest('li');
        if (li && !li.classList.contains('hide')) {
          item.click();
          break;
        }
      }
    });
    await sleep(800);

    await this.page.evaluate(() => {
      const btn = document.querySelector('#btnOpcoesPrioridade');
      if (btn) btn.click();
    });
    await sleep(800);

    await this.page.evaluate(() => {
      const itens = document.querySelectorAll('#listaPrioridade li a.itemPrioridade');
      for (const item of itens) {
        const li = item.closest('li');
        if (li && !li.classList.contains('hide')) {
          item.click();
          break;
        }
      }
    });
    await sleep(800);
  }

  async enviarTramite(statusTexto) {
    const statusMap = {
      'Em andamento': '1',
      'Concluido': '7',
      'Concluído': '7'
    };

    const statusVal = statusMap[statusTexto] || '1';

    await this.page.evaluate((val) => {
      const s = document.querySelector('#TicketMlo_Status');
      if (s) {
        s.value = val;
        if (typeof $ !== 'undefined') $(s).trigger('chosen:updated');
      }
    }, statusVal);
    await sleep(800);

    await this.page.evaluate(() => {
      const btn = document.querySelector('#btnListaStatus');
      if (btn) btn.click();
    });
    await sleep(1000);

    const itemId = statusVal;
    await this.page.evaluate((id) => {
      const itens = document.querySelectorAll('#listaStatus a.itemStatus');
      for (const item of itens) {
        if (item.id === id) { item.click(); break; }
      }
    }, itemId);
    await sleep(800);

    await this.page.evaluate(() => {
      const btn = document.querySelector('#btnEnviar');
      if (btn) btn.click();
    });
    await sleep(2000);

    let encontrouDialog = await this.page.evaluate(() => {
      const botoes = document.querySelectorAll('button[data-bb-handler="confirm"]');
      for (const b of botoes) {
        if (b.offsetParent !== null || window.getComputedStyle(b.closest('.modal')).display !== 'none') {
          b.click();
          return { ok: true, texto: b.textContent.trim() };
        }
      }
      const todosBtns = document.querySelectorAll('.modal.in button, .modal[style*="display: block"] button');
      for (const b of todosBtns) {
        const txt = b.textContent.trim().toUpperCase();
        if (txt === 'SIM' || txt === 'OK') {
          b.click();
          return { ok: true, texto: b.textContent.trim() };
        }
      }
      return { ok: false };
    });

    await sleep(1000);

    if (!encontrouDialog.ok) {
      await this.page.evaluate(() => {
        const form = document.querySelector('#frmTicketPrincipal');
        if (form) {
          const disabled = form.querySelectorAll(':input:disabled');
          disabled.forEach(d => d.removeAttribute('disabled'));
          form.submit();
        }
      });
      await sleep(2000);
    }
  }

  async inserirTramite(texto) {
    const htmlTramite = '<div>' + texto.replace(/\n/g, '</div><div>') + '</div>';

    await withTimeout(
      this.page.evaluate((html) => {
        const editor = document.querySelector('#EditorTramite');
        if (editor) {
          editor.focus();
          editor.innerHTML = html;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const hiddenDesc = document.querySelector('#TramiteMlo_Descricao');
        if (hiddenDesc) hiddenDesc.value = html;
      }, htmlTramite),
      10000, 'preencher-editor-tramite'
    );
    
    await sleep(1000);
  }

  async ensureTicketPage() {
    const page = await this.detectPage();

    if (page === 'login') throw new Error('Sessao expirada');

    if (page === 'detalhes') {
      const clicked = await this.page.evaluate(() => {
        const links = document.querySelectorAll('a, button, span, li');
        for (const el of links) {
          const texto = el.textContent.trim().toUpperCase();
          if (texto.includes('NOVO TICKET') || texto.includes('NOVOTICKET')) {
            el.click();
            return true;
          }
        }
        const navLink = document.querySelector('.nav.nav-list a[href*="NovoTicket"], .nav.nav-list a[href*="Ticket"]');
        if (navLink) {
          navLink.click();
          return true;
        }
        return false;
      });

      if (clicked) {
        await sleep(2000);
      } else {
        await this.page.goto(TICKET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(2000);
      }
    }

    if (page === 'criacao') {
      return;
    }

    if (page === 'lista') {
      await this.page.goto(TICKET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
    }
  }

  async getTicketNumber() {
    return await this.page.evaluate(() => {
      const allText = document.body.innerText;

      const labelMatch = allText.match(/(?:Numero\s*(?:do\s*)?Ticket|N[uú]mero\s*(?:do\s*)?)[:\s]*(\d{4}[-.]?\d{6})/i);
      if (labelMatch) return labelMatch[1].replace('.', '-');

      const spans = document.querySelectorAll('span, td, div, label, strong, b, p');
      for (const el of spans) {
        const txt = el.textContent.trim();
        if (/(?:numero|ticket)/i.test(txt)) {
          const m = txt.match(/(\d{4}[-.]?\d{6})/);
          if (m) return m[1].replace('.', '-');
        }
      }

      const genericMatch = allText.match(/(\d{4}-\d{6})/);
      if (genericMatch) return genericMatch[1];

      return null;
    });
  }
}

module.exports = PlaywrightBot;
