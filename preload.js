const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fila: {
    get: () => ipcRenderer.invoke('fila:get'),
    add: (rascunho) => ipcRenderer.invoke('fila:add', rascunho),
    update: (id, updates) => ipcRenderer.invoke('fila:update', id, updates),
    remove: (id) => ipcRenderer.invoke('fila:remove', id),
    removeByIds: (ids) => ipcRenderer.invoke('fila:removeByIds', ids),
    processar: (itens) => ipcRenderer.invoke('fila:processar', itens),
    onStatus: (cb) => ipcRenderer.on('fila:status', (e, data) => cb(data)),
    onItemConcluido: (cb) => ipcRenderer.on('fila:item-concluido', (e, data) => cb(data))
  },
  historico: {
    get: () => ipcRenderer.invoke('historico:get'),
    add: (entry) => ipcRenderer.invoke('historico:add', entry)
  },
  credenciais: {
    get: () => ipcRenderer.invoke('credenciais:get'),
    save: (cred) => ipcRenderer.invoke('credenciais:save', cred)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  }
});
