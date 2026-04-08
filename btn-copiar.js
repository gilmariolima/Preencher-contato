// ==UserScript==
// @name         SmartBus - Copiar dados ao clicar no botão
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Ao clicar em #btn-dados, copia nome, telefone e localizador para a área de transferência
// @match        https://prod-guanabara-frontoffice-smartbus.smarttravelit.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  function log(...args) {
    console.log('[TM-COPIAR-DADOS]', ...args);
  }

  function warn(...args) {
    console.warn('[TM-COPIAR-DADOS]', ...args);
  }

  function copiarTexto(texto) {
    try {
      GM_setClipboard(texto, 'text');
      return true;
    } catch (err) {
      console.error('[TM-COPIAR-DADOS] Erro ao copiar com GM_setClipboard:', err);
      return false;
    }
  }

  function mostrarAviso(texto, cor = '#198754') {
    let aviso = document.getElementById('tm-aviso-copiado');

    if (!aviso) {
      aviso = document.createElement('div');
      aviso.id = 'tm-aviso-copiado';
      aviso.style.position = 'fixed';
      aviso.style.top = '20px';
      aviso.style.right = '20px';
      aviso.style.zIndex = '999999';
      aviso.style.padding = '12px 16px';
      aviso.style.borderRadius = '10px';
      aviso.style.color = '#fff';
      aviso.style.fontSize = '14px';
      aviso.style.fontWeight = '700';
      aviso.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
      aviso.style.maxWidth = '320px';
      aviso.style.wordBreak = 'break-word';
      document.body.appendChild(aviso);
    }

    aviso.textContent = texto;
    aviso.style.background = cor;
    aviso.style.display = 'block';
    aviso.style.opacity = '1';

    clearTimeout(aviso._timer);
    aviso._timer = setTimeout(() => {
      aviso.style.opacity = '0';
      setTimeout(() => {
        aviso.style.display = 'none';
      }, 250);
    }, 2500);
  }

  function obterDados() {
    let tel = document.querySelectorAll('.card-coupon-area')[1]?.querySelectorAll('td')[4]?.textContent?.trim() || '';

    let nomePassageiro = document.querySelectorAll('.card-coupon-area')[1]?.querySelectorAll('td')[1]?.textContent?.trim() || '';

    let localizador = document.querySelectorAll('.coupon-summary-value')[1]?.textContent?.trim() || '';

    if (
      document.querySelectorAll('.coupon-issuer-info').length === 2 &&
      document.querySelectorAll('.coupon-issuer-info')[1]?.querySelectorAll('label')[4]?.textContent?.trim() === 'Telefone'
    ) {
      tel = document.querySelectorAll('.coupon-issuer-info')[1]
        ?.querySelectorAll('.lbl-value')[2]
        ?.textContent?.trim() || tel;
    }

    return {
      nome: nomePassageiro,
      telefone: tel,
      localizador: localizador
    };
  }

  function montarTextoParaCopiar(dados) {
    return [
      dados.nome || '',
      dados.telefone || '',
      dados.localizador || ''
    ].join('\n');
  }

  function processarClique() {
    const dados = obterDados();

    log('========== DADOS CAPTURADOS ==========');
    log('Nome:', dados.nome);
    log('Telefone:', dados.telefone);
    log('Localizador:', dados.localizador);
    log('Objeto:', dados);
    log('======================================');

    if (!dados.nome && !dados.telefone && !dados.localizador) {
      warn('Nenhum dado encontrado para copiar.');
      mostrarAviso('Nenhum dado encontrado para copiar.', '#dc3545');
      return;
    }

    const texto = montarTextoParaCopiar(dados);

    log('Texto copiado:');
    log(texto);

    const copiou = copiarTexto(texto);

    if (copiou) {
      mostrarAviso('Dados copiados. Agora é só colar.', '#198754');
    } else {
      mostrarAviso('Erro ao copiar os dados.', '#dc3545');
    }
  }

  function adicionarEventoAoBotao(botao) {
    if (!botao || botao.dataset.tmCopiarAtivo === 'true') return;

    botao.dataset.tmCopiarAtivo = 'true';

    log('Botão #btn-dados encontrado:', botao);

    botao.addEventListener('click', function () {
      processarClique();
    });
  }

  function iniciar() {
    const observer = new MutationObserver(() => {
      const botao = document.querySelector('#btn-dados');
      if (botao) {
        adicionarEventoAoBotao(botao);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    const botaoInicial = document.querySelector('#btn-dados');
    if (botaoInicial) {
      adicionarEventoAoBotao(botaoInicial);
    } else {
      warn('Botão #btn-dados ainda não encontrado.');
    }
  }

  iniciar();
})();
