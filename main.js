const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Datastore = require('nedb-promises');
const logger = require('./bot/logger');

const PORTAL_URL = 'https://portaldocliente.praxio.com.br';
const TICKET_URL = PORTAL_URL + '/Ticket/NovoTicketAnalista';
const LOGIN_URL = PORTAL_URL + '/Home/Index';

let mainWindow;
let db = {};

function initDB() {
  const dbPath = path.join(app.getPath('userData'), 'db');
  if (!require('fs').existsSync(dbPath)) {
    require('fs').mkdirSync(dbPath, { recursive: true });
  }
  db.fila = Datastore.create({ filename: path.join(dbPath, 'fila.db'), autoload: true });
  db.historico = Datastore.create({ filename: path.join(dbPath, 'historico.db'), autoload: true });
  db.credenciais = Datastore.create({ filename: path.join(dbPath, 'credenciais.db'), autoload: true });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// ========== IPC HANDLERS ==========

ipcMain.handle('fila:get', async () => {
  return await db.fila.find({}).sort({ criadoEm: -1 });
});

ipcMain.handle('fila:add', async (event, rascunho) => {
  return await db.fila.insert(rascunho);
});

ipcMain.handle('fila:update', async (event, id, updates) => {
  await db.fila.update({ _id: id }, { $set: updates });
  await db.fila.compactDatafile();
  return await db.fila.findOne({ _id: id });
});

ipcMain.handle('fila:remove', async (event, id) => {
  return await db.fila.remove({ _id: id });
});

ipcMain.handle('fila:removeByIds', async (event, ids) => {
  for (const id of ids) {
    await db.fila.remove({ _id: id });
  }
});

ipcMain.handle('historico:get', async () => {
  return await db.historico.find({}).sort({ criadoEm: -1 });
});

ipcMain.handle('historico:add', async (event, entry) => {
  await db.historico.insert(entry);
});

ipcMain.handle('historico:clear', async () => {
  await db.historico.remove({}, { multi: true });
});

ipcMain.handle('credenciais:get', async () => {
  const creds = await db.credenciais.findOne({});
  return creds || { usuario: '', senha: '' };
});

ipcMain.handle('credenciais:save', async (event, cred) => {
  await db.credenciais.remove({}, { multi: true });
  return await db.credenciais.insert(cred);
});

// Processamento - NAO remove da fila antes, so remove apos sucesso
let isProcessing = false;

ipcMain.handle('fila:processar', async (event, itens) => {
  if (isProcessing) return { error: 'Ja existe processamento em andamento' };
  isProcessing = true;
  mainWindow.webContents.send('fila:status', { processando: true });

  const idsProcessados = [];

  try {
    const PlaywrightBot = require('./bot/playwright-bot');
    const bot = new PlaywrightBot();

    const creds = await db.credenciais.findOne({});
    if (!creds || !creds.usuario || !creds.senha) {
      throw new Error('Credenciais nao configuradas');
    }

    // Função para inicializar e logar
    async function initBot() {
      await bot.init();
      await bot.login(creds.usuario, creds.senha);
    }

    await initBot();
    logger.startAutomation();

    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];

      // Notificar início do processamento do item
      mainWindow.webContents.send('fila:item-iniciando', {
        item,
        index: i + 1,
        total: itens.length
      });

      // Validar dados obrigatórios antes de iniciar
      const camposObrigatorios = {
        empresa: 'Empresa',
        contato: 'Contato',
        modulo: 'Módulo',
        titulo: 'Título',
        descricao: 'Descrição'
      };
      const camposFaltando = [];
      for (const [campo, label] of Object.entries(camposObrigatorios)) {
        if (!item[campo] || item[campo].trim() === '') {
          camposFaltando.push(label);
        }
      }

      if (camposFaltando.length > 0) {
        const erroMsg = `Campos obrigatórios faltando: ${camposFaltando.join(', ')}`;
        mainWindow.webContents.send('fila:item-concluido', {
          item,
          ticketNum: null,
          sucesso: false,
          erro: erroMsg
        });
        logger.skip(erroMsg);
        continue;
      }

      logger.startTicket(i + 1, itens.length, item);

      try {
        const resultado = await bot.processarItem(item);

        if (resultado.ok) {
          await db.historico.insert({
            numero: String(resultado.ticketNum),
            empresa: item.empresaNome || item.empresa,
            criadoEm: new Date().toISOString()
          });
          await db.fila.remove({ _id: item._id });
          idsProcessados.push(item._id);
          mainWindow.webContents.send('fila:item-concluido', {
            item,
            ticketNum: resultado.ticketNum,
            sucesso: true
          });
          logger.result(true, resultado.ticketNum);

          // Tentar voltar para página de criação
          try {
            await bot.ensureTicketPage();
          } catch (e) {
            // Falha ao voltar — tentar refazer login
            logger.info('Falha ao voltar para criação, tentando refazer login...');
            try {
              await bot.close();
              await initBot();
              logger.info('Login refazido com sucesso.');
            } catch (loginErr) {
              logger.error('Falha ao refazer login: ' + loginErr.message);
              break;
            }
          }
        } else {
          mainWindow.webContents.send('fila:item-concluido', {
            item,
            ticketNum: null,
            sucesso: false,
            erro: resultado.erro || 'Erro desconhecido'
          });
          logger.result(false, null, resultado.erro || 'Erro desconhecido');

          // Tentar voltar para página de criação
          try {
            await bot.ensureTicketPage();
          } catch (e) {
            // Falha ao voltar — tentar refazer login
            logger.info('Falha ao voltar para criação, tentando refazer login...');
            try {
              await bot.close();
              await initBot();
              logger.info('Login refazido com sucesso.');
            } catch (loginErr) {
              logger.error('Falha ao refazer login: ' + loginErr.message);
              break;
            }
          }
        }
      } catch (err) {
        mainWindow.webContents.send('fila:item-concluido', {
          item,
          ticketNum: null,
          sucesso: false,
          erro: err.message
        });
        logger.result(false, null, err.message);

        // Tentar voltar para página de criação
        try {
          await bot.ensureTicketPage();
        } catch (e) {
          // Falha ao voltar — tentar refazer login
          logger.info('Falha ao voltar para criação, tentando refazer login...');
          try {
            await bot.close();
            await initBot();
            logger.info('Login refazido com sucesso.');
          } catch (loginErr) {
            logger.error('Falha ao refazer login: ' + loginErr.message);
            break;
          }
        }
      }
    }

    await bot.close();
  } catch (err) {
    logger.error(err.message);
  } finally {
    isProcessing = false;
    mainWindow.webContents.send('fila:status', { processando: false });
  }

  return { ok: true, processados: idsProcessados };
});

// Window controls
ipcMain.on('window:minimize', () => mainWindow.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow.close());

app.whenReady().then(() => {
  initDB();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
