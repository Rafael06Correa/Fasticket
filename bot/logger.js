/**
 * Sistema de logs limpo e apresentável
 */

let startTime = null;
let currentStep = 0;
let totalSteps = 10;

function timestamp() {
  return new Date().toLocaleTimeString('pt-BR');
}

function log(msg) {
  console.log(`[${timestamp()}] ${msg}`);
}

function separator() {
  console.log('\n--------------------------------------------------');
}

function startAutomation() {
  startTime = Date.now();
  log('Iniciando automação...');
}

function loginSuccess() {
  log('Login realizado com sucesso.');
}

function systemReady() {
  log('Sistema pronto para processar chamados.');
}

function startTicket(itemIndex, totalItems, item) {
  separator();
  console.log(`\nProcessando chamado ${itemIndex} de ${totalItems}\n`);
  console.log(`Empresa : ${item.empresa}`);
  console.log(`Contato : ${item.contato || 'N/A'}`);
  console.log(`Sistema : SIGA`);
  console.log(`Módulo  : ${item.modulo || 'N/A'}\n`);
  currentStep = 0;
}

function step(description, success = true, detail = null) {
  currentStep++;
  const status = success ? 'OK' : 'ERRO';
  let line = `[${currentStep}/${totalSteps}] ${description}... ${status}`;
  if (detail) {
    console.log(line);
    console.log(`        ${detail}`);
  } else {
    console.log(line);
  }
}

function ticketGenerated(ticketNum) {
  console.log(`        Ticket gerado: ${ticketNum}`);
}

function result(success, ticketNum = null, errorMsg = null) {
  separator();
  console.log('\nResultado\n');
  if (success) {
    console.log(`Status : SUCESSO`);
    console.log(`Ticket : ${ticketNum}`);
  } else {
    console.log(`Status : ERRO`);
    console.log(`Erro   : ${errorMsg}`);
  }
  
  if (startTime) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`Tempo  : ${elapsed} segundos`);
  }
  
  console.log('');
  log('Processamento concluído.');
  separator();
}

function error(msg) {
  log(`ERRO: ${msg}`);
}

function skip(reason) {
  separator();
  log(`PULANDO CHAMADO: ${reason}`);
  separator();
}

function info(msg) {
  log(msg);
}

// Log de erros de página (silencioso, apenas para debug)
function pageError(msg) {
  // Não mostra erros de página no console limpo
  // Apenas loga se precisar de debug
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
  pageError
};
