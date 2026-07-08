/**
 * Sistema de logs limpo e apresentável
 */

let startTime = null;
let currentStep = 0;
let totalSteps = 10;
let sendToRenderer = null;

function setRendererSender(sender) {
  sendToRenderer = sender;
}

function emit(msg, type) {
  console.log(`[${timestamp()}] ${msg}`);
  if (sendToRenderer) {
    sendToRenderer({ text: msg, type: type || 'info', time: new Date().toLocaleTimeString('pt-BR') });
  }
}

function timestamp() {
  return new Date().toLocaleTimeString('pt-BR');
}

function log(msg) {
  emit(msg, 'info');
}

function separator() {
  console.log('\n--------------------------------------------------');
}

function startAutomation() {
  startTime = Date.now();
  emit('Iniciando automação...', 'info');
}

function loginSuccess() {
  emit('Login realizado com sucesso.', 'success');
}

function systemReady() {
  emit('Sistema pronto para processar chamados.', 'info');
}

function startTicket(itemIndex, totalItems, item) {
  separator();
  emit(`Processando chamado ${itemIndex} de ${totalItems}`, 'info');
  emit(`Empresa : ${item.empresa}`, 'info');
  emit(`Contato : ${item.contato || 'N/A'}`, 'info');
  emit(`Sistema : ${item.sistema || 'SIGA'}`, 'info');
  emit(`Módulo  : ${item.modulo || 'N/A'}`, 'info');
  currentStep = 0;
}

function step(description, success = true, detail = null) {
  currentStep++;
  const status = success ? 'OK' : 'ERRO';
  const type = success ? 'success' : 'error';
  let line = `[${currentStep}/${totalSteps}] ${description}... ${status}`;
  emit(line, type);
  if (detail) {
    emit(`        ${detail}`, type);
  }
}

function ticketGenerated(ticketNum) {
  emit(`        Ticket gerado: ${ticketNum}`, 'success');
}

function result(success, ticketNum = null, errorMsg = null) {
  separator();
  if (success) {
    emit(`Status : SUCESSO`, 'success');
    emit(`Ticket : ${ticketNum}`, 'success');
  } else {
    emit(`Status : ERRO`, 'error');
    emit(`Erro   : ${errorMsg}`, 'error');
  }

  if (startTime) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    emit(`Tempo  : ${elapsed} segundos`, 'info');
  }

  emit('Processamento concluído.', 'info');
  separator();
}

function error(msg) {
  emit(`ERRO: ${msg}`, 'error');
}

function skip(reason) {
  separator();
  emit(`PULANDO CHAMADO: ${reason}`, 'warning');
  separator();
}

function info(msg) {
  emit(msg, 'info');
}

function pageError(msg) {
  // silencioso
}

module.exports = {
  timestamp,
  log,
  separator,
  startAutomation,
  loginSuccess,
  systemReady,
  startTicket,
  step,
  ticketGenerated,
  result,
  error,
  skip,
  info,
  pageError,
  setRendererSender
};
