const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Datastore = require('nedb-promises');

const PORTAL_URL = 'https://portaldocliente.praxio.com.br';
const TICKET_URL = PORTAL_URL + '/Ticket/NovoTicketAnalista';
const LOGIN_URL = PORTAL_URL + '/Home/Index';

let mainWindow;
let db = {};

function initDB() {
  const dbPath = path.join(__dirname, 'db');
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
  await db.fila.persistence.compactDatafile();
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
  return await db.historico.find({}).sort({ criadoEm: -1 }).limit(5);
});

ipcMain.handle('historico:add', async (event, entry) => {
  await db.historico.insert(entry);
  const count = await db.historico.count({});
  if (count > 5) {
    const all = await db.historico.find({}).sort({ criadoEm: -1 });
    for (const old of all.slice(5)) {
      await db.historico.remove({ _id: old._id });
    }
  }
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

function logMain(msg) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[MAIN ${ts}] ${msg}`);
}

ipcMain.handle('fila:processar', async (event, itens) => {
  logMain(`fila:processar chamado com ${itens.length} item(s)`);
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

    await bot.init();
    await bot.login(creds.usuario, creds.senha);

    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      logMain(`Processando item ${i + 1}/${itens.length}: ${item.empresa}`);
      try {
        const ticketNum = await bot.processarItem(item);
        logMain(`Item ${i + 1} resultado: ticket=${ticketNum}`);
        if (ticketNum) {
          await db.historico.insert({
            numero: String(ticketNum),
            empresa: item.empresaNome || item.empresa,
            criadoEm: new Date().toISOString()
          });
          const count = await db.historico.count({});
          if (count > 5) {
            const all = await db.historico.find({}).sort({ criadoEm: -1 });
            for (const old of all.slice(5)) {
              await db.historico.remove({ _id: old._id });
            }
          }
          await db.fila.remove({ _id: item._id });
          idsProcessados.push(item._id);
          mainWindow.webContents.send('fila:item-concluido', {
            item,
            ticketNum,
            sucesso: true
          });
        } else {
          mainWindow.webContents.send('fila:item-concluido', {
            item,
            ticketNum: null,
            sucesso: false,
            erro: 'Nao foi possivel capturar o numero do ticket'
          });
        }
      } catch (err) {
        logMain(`Erro no item ${i + 1}: ${err.message}`);
        mainWindow.webContents.send('fila:item-concluido', {
          item,
          ticketNum: null,
          sucesso: false,
          erro: err.message
        });
      }
    }

    await bot.close();
    logMain('Processamento concluido.');
  } catch (err) {
    logMain('Erro geral: ' + err.message);
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
