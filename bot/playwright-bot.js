const { chromium } = require('playwright');
const path = require('path');

const PORTAL_URL = 'https://portaldocliente.praxio.com.br';
const TICKET_URL = PORTAL_URL + '/Ticket/NovoTicketAnalista';
const LOGIN_URL = PORTAL_URL + '/Home/Index';

function log(msg) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[BOT ${ts}] ${msg}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
  }

  async init() {
    log('Iniciando browser headless...');
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'pt-BR',
      ignoreHTTPSErrors: true
    });
    this.page = await context.newPage();

    this.page.on('console', msg => {
      if (msg.type() === 'error') log('[PAGE ERROR] ' + msg.text());
    });
    this.page.on('pageerror', err => log('[PAGE EXCEPTION] ' + err.message));

    log('Browser iniciado.');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      log('Browser fechado.');
    }
  }

  async screenshot(name) {
    try {
      const dir = path.join(__dirname, '..', 'db');
      const file = path.join(dir, `${name}.png`);
      await this.page.screenshot({ path: file, fullPage: true });
      log(`Screenshot: ${file}`);
    } catch (e) {
      log('Erro screenshot: ' + e.message);
    }
  }

  async login(usuario, senha) {
    log('Navegando para login...');
    await this.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    const loginField = await this.page.$('#txtLogin');
    const passField = await this.page.$('#txtSenha');
    const btnEntrar = await this.page.$('#btnEntrar');

    if (!loginField || !passField || !btnEntrar) {
      await this.screenshot('login-erro');
      throw new Error('Campos de login nao encontrados');
    }

    await loginField.fill(usuario);
    await sleep(200);
    await passField.fill(senha);
    await sleep(300);

    log('Clicando Entrar...');
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
      btnEntrar.click()
    ]);
    await sleep(3000);

    if (this.page.url().includes('/Home/Index')) {
      await this.screenshot('login-falhou');
      throw new Error('Login falhou - credenciais invalidas');
    }

    log('Login OK, indo para ticket...');
    await this.page.goto(TICKET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);

    const pageType = await this.detectPage();
    if (pageType === 'login') {
      await this.screenshot('sessao-expirada');
      throw new Error('Sessao expirada');
    }

    log('Pronto para processar tickets.');
  }

  async detectPage() {
    return await this.page.evaluate(() => {
      if (document.querySelector('#txtLogin')) return 'login';
      if (document.querySelector('#frmNovoTicket') || document.querySelector('#TicketMlo_Cliente_Codigo')) return 'ticket';
      return 'lista';
    });
  }

  async selectFromChosen(containerId, searchText) {
    log(`  Chosen: "${searchText}" em #${containerId}`);

    const result = await withTimeout(
      this.page.evaluate(({ cid, text }) => {
        const container = document.getElementById(cid);
        if (!container) return { ok: false, reason: 'container not found' };

        const single = container.querySelector('.chosen-single');
        if (!single) return { ok: false, reason: 'chosen-single not found' };

        single.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        return { ok: true };
      }, { cid: containerId, text: searchText }),
      5000, 'selectFromChosen-open'
    );

    if (!result.ok) {
      log(`    Falhou: ${result.reason}`);
      return false;
    }

    await sleep(500);

    const typeResult = await withTimeout(
      this.page.evaluate(({ cid, text }) => {
        const container = document.getElementById(cid);
        const searchInput = container.querySelector('.chosen-search input');
        if (!searchInput) return { ok: false, reason: 'search input not found' };

        searchInput.focus();
        searchInput.value = text;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        return { ok: true };
      }, { cid: containerId, text: searchText }),
      5000, 'selectFromChosen-type'
    );

    if (!typeResult.ok) {
      log(`    Falhou: ${typeResult.reason}`);
      return false;
    }

    await sleep(1000);

    const clickResult = await withTimeout(
      this.page.evaluate(({ cid, text }) => {
        const container = document.getElementById(cid);
        const items = container.querySelectorAll('.chosen-results li');
        const search = text.toUpperCase();
        let found = null;

        for (let i = 0; i < items.length; i++) {
          if (items[i].offsetParent === null) continue;
          const txt = items[i].textContent.trim().toUpperCase();
          if (txt === search) { found = items[i]; break; }
          if (txt.indexOf(search) !== -1 || search.indexOf(txt) !== -1) {
            if (!found) found = items[i];
          }
        }

        if (!found) {
          for (let j = 0; j < items.length; j++) {
            if (items[j].offsetParent !== null) { found = items[j]; break; }
          }
        }

        if (found) {
          found.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          found.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          return { ok: true, text: found.textContent.trim() };
        }

        return {
          ok: false,
          reason: 'item not found',
          available: Array.from(items).filter(i => i.offsetParent !== null).map(i => i.textContent.trim()).slice(0, 10)
        };
      }, { cid: containerId, text: searchText }),
      5000, 'selectFromChosen-click'
    );

    if (clickResult.ok) {
      log(`    OK: "${clickResult.text}"`);
    } else {
      log(`    Nao encontrado: ${clickResult.reason}`);
      if (clickResult.available) log(`    Opcoes: ${clickResult.available.join(' | ')}`);
    }

    return clickResult.ok;
  }

  async corrigirAbertura() {
    log('  Corrigindo campo Abertura...');
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
    log(`  Abertura: ${corrigido.ok ? corrigido.value : corrigido.reason}`);
    return corrigido.ok;
  }

  async processarItem(item) {
    log('=== Item ===');
    log(`Empresa: ${item.empresa} | Contato: ${item.contato} | Modulo: ${item.modulo}`);

    await this.ensureTicketPage();
    await sleep(1500);

    log('Etapa 1: Empresa...');
    const empresaOk = await this.selectFromChosen('TicketMlo_Cliente_Codigo_chosen', item.empresa);
    if (!empresaOk) {
      await this.screenshot('erro-empresa');
      throw new Error('Empresa nao encontrada: ' + item.empresa);
    }
    await sleep(3000);

    if (item.contato) {
      log('Etapa 2: Contato...');
      await this.selectFromChosen('TicketMlo_OperadorContato_Id_chosen', item.contato);
      await sleep(1500);
    }

    log('Etapa 3: Sistema...');
    await this.selectFromChosen('Sistema_chosen', 'SIGA');
    await sleep(2000);

    if (item.modulo) {
      log('Etapa 4: Modulo...');
      await this.selectFromChosen('TicketMlo_Modulo_Id_chosen', item.modulo);
      await sleep(1000);
    }

    if (item.titulo) {
      log('Etapa 5: Assunto...');
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

    if (item.descricao) {
      log('Etapa 6: Descricao...');
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
        }, item.descricao),
        10000, 'preencher-descricao'
      );
    }

    await this.corrigirAbertura();
    await sleep(500);

    log('Etapa 7: Gravar...');
    await this.screenshot('antes-gravar');

    const gravou = await this.page.evaluate(() => {
      const btn = document.querySelector('#btnGravar');
      if (!btn) return false;
      btn.click();
      return true;
    });

    if (!gravou) {
      throw new Error('Botao Gravar nao encontrado');
    }

    log('Aguardando redirect...');
    try {
      await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
      log('Nao houve redirect, verificando URL...');
    }
    await sleep(3000);

    const urlAtual = this.page.url();
    log('URL apos gravar: ' + urlAtual);
    await this.screenshot('pos-gravar');

    const erros = await this.page.evaluate(() => {
      const errosEl = document.querySelectorAll('.validation-summary-errors li, .alert-danger, .field-validation-error');
      return Array.from(errosEl).map(el => el.textContent.trim()).filter(Boolean);
    });

    if (erros.length > 0) {
      log('Erros de validacao: ' + erros.join(' | '));
    }

    const ticketNum = await this.getTicketNumber();
    log(`Ticket: ${ticketNum || 'NAO CAPTURADO'}`);

    return ticketNum;
  }

  async ensureTicketPage() {
    const page = await this.detectPage();
    log('Pagina: ' + page);

    if (page === 'login') throw new Error('Sessao expirada');

    if (page !== 'ticket') {
      await this.page.goto(TICKET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(4000);
    }
  }

  async getTicketNumber() {
    return await this.page.evaluate(() => {
      const url = window.location.href;
      let m = url.match(/TicketPrincipal\/(\d+)/i) || url.match(/Ticket\/(\d+)/i);
      if (m) return m[1];

      const h1 = document.querySelector('.page-header h1');
      if (h1) {
        const hm = h1.textContent.match(/(\d{3}-\d{5})/);
        if (hm) return hm[1];
      }

      const bread = document.querySelector('.breadcrumb .active');
      if (bread) {
        const bm = bread.textContent.match(/(\d{3}-\d{5})/);
        if (bm) return bm[1];
      }

      return null;
    });
  }
}

module.exports = PlaywrightBot;
