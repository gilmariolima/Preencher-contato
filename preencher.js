// ==UserScript==
// @name         Tallos - Preencher contato
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Cola dados, preenche campos, seleciona Grupo Guanabara 1993 e define Consentimento nas bases legais
// @match        https://app.tallos.com.br/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const PAINEL_ID = 'tm-painel-colar-dados-tallos';
  const AVISO_ID = 'tm-aviso-preencher-dados';
  const NOME_GRUPO = 'Grupo Guanabara 1993';
  const BASE_LEGAL_TEXTO = 'Consentimento';
  const URL_ALVO = '/app/contacts/customers/create';

  const FAST_DELAY = 80;
  const MEDIUM_DELAY = 140;
  const LONG_DELAY = 220;

  let routeWatchStarted = false;
  let domObserver = null;
  let lastUrl = location.href;
  let panelVisible = false;

  function log(...args) {
    console.log('[TM-TALLOS-PREENCHER]', ...args);
  }

  function warn(...args) {
    console.warn('[TM-TALLOS-PREENCHER]', ...args);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function limparTexto(valor) {
    return String(valor || '').replace(/\r/g, '').trim();
  }

  function normalizarTexto(valor) {
    return limparTexto(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function estaNaPaginaDeCriacao() {
    return location.href.includes(URL_ALVO);
  }

  function setNativeValue(element, value) {
    if (!element) return;

    const prototype = Object.getPrototypeOf(element);
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function clickLikeUser(element) {
    if (!element) return;

    try {
      element.scrollIntoView({ block: 'center', inline: 'center' });
    } catch (_) {}

    try {
      element.focus?.();
    } catch (_) {}

    try {
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    } catch (_) {}

    try {
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    } catch (_) {}

    try {
      element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    } catch (_) {}

    try {
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    } catch (_) {}

    try {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    } catch (_) {}

    try {
      if (typeof element.click === 'function') {
        element.click();
      }
    } catch (_) {}
  }

  function mostrarAviso(texto, cor = '#198754') {
    let aviso = document.getElementById(AVISO_ID);

    if (!aviso) {
      aviso = document.createElement('div');
      aviso.id = AVISO_ID;
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
      aviso.style.maxWidth = '380px';
      aviso.style.wordBreak = 'break-word';
      aviso.style.transition = 'opacity 0.25s ease';
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
        if (aviso) aviso.style.display = 'none';
      }, 250);
    }, 2500);
  }

  function removerAviso() {
    const aviso = document.getElementById(AVISO_ID);
    if (aviso) aviso.remove();
  }

  function extrairDados(texto) {
    const linhas = limparTexto(texto)
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    return {
      nome: linhas[0] || '',
      telefone: linhas[1] || '',
      localizador: linhas[2] || ''
    };
  }

  function encontrarCampoNome() {
    return document.querySelectorAll('input')[0] || null;
  }

  function encontrarCampoTelefone() {
    return document.querySelectorAll('input')[3] || null;
  }

  function encontrarCampoDescricao() {
    return document.querySelectorAll('input')[10] || null;
  }

  function encontrarElementoPorTexto(texto, seletores = 'div, span, li, button') {
    const alvoTexto = normalizarTexto(texto);
    const elementos = Array.from(document.querySelectorAll(seletores));
    return elementos.find(el => normalizarTexto(el.textContent) === alvoTexto) || null;
  }

  function encontrarSelectChip() {
    const todos = Array.from(document.querySelectorAll('div'));
    return todos.find(el => normalizarTexto(el.textContent) === 'selecione um chip') || null;
  }

  function encontrarOpcaoGrupo() {
    return encontrarElementoPorTexto(NOME_GRUPO, 'div, span, li, [role="option"]');
  }

  function encontrarBotaoEditarProtecaoDados() {
    const botoes = Array.from(document.querySelectorAll('button'));
    const candidatos = botoes.filter(btn => normalizarTexto(btn.textContent) === 'editar');

    if (!candidatos.length) return null;

    const porSecao = candidatos.find(btn => {
      const bloco = btn.closest('section, article, div');
      return bloco && normalizarTexto(bloco.textContent).includes('protecao de dados');
    });

    return porSecao || candidatos[candidatos.length - 1] || null;
  }

  function encontrarCampoBaseLegalCima() {
    return document.querySelectorAll('.InputControl__Root-sc-1bx7dgp-2')[25] || null;
  }

  function encontrarCampoBaseLegalBaixo() {
    return document.querySelectorAll('.InputControl__Root-sc-1bx7dgp-2')[26] || null;
  }

  function encontrarOpcaoConsentimentoVisivel() {
    const alvo = normalizarTexto(BASE_LEGAL_TEXTO);
    const elementos = Array.from(document.querySelectorAll('div, span, li, [role="option"]'));

    const candidatos = elementos.filter(el => {
      const texto = normalizarTexto(el.textContent);
      if (texto !== alvo) return false;

      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

    if (!candidatos.length) return null;

    candidatos.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (ra.top !== rb.top) return ra.top - rb.top;
      return ra.left - rb.left;
    });

    return candidatos[0];
  }

  async function waitFor(fn, timeout = 2500, interval = 80) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const result = fn();
      if (result) return result;
      await sleep(interval);
    }

    return null;
  }

  async function selecionarGrupo() {
    const seletor = await waitFor(encontrarSelectChip, 1800, 70);

    if (!seletor) {
      warn('Não encontrei a div "Selecione um chip".');
      return false;
    }

    clickLikeUser(seletor);

    const opcao = await waitFor(encontrarOpcaoGrupo, 1800, 70);

    if (!opcao) {
      warn('Não encontrei a opção do grupo.');
      return false;
    }

    clickLikeUser(opcao);
    await sleep(FAST_DELAY);
    return true;
  }

  async function abrirEditarProtecaoDados() {
    let btnEditar = encontrarBotaoEditarProtecaoDados();

    if (!btnEditar) {
      btnEditar = await waitFor(
        () => encontrarElementoPorTexto('Editar', 'button, div, span'),
        1800,
        70
      );
    }

    if (!btnEditar) {
      warn('Botão Editar não encontrado.');
      return false;
    }

    clickLikeUser(btnEditar);
    await sleep(MEDIUM_DELAY);
    return true;
  }

  async function abrirCampoBaseLegal(campo, nomeCampo) {
    if (!campo) {
      warn(`Campo ${nomeCampo} não encontrado.`);
      return false;
    }

    clickLikeUser(campo);
    await sleep(FAST_DELAY);

    const inputInterno = campo.querySelector('input');
    if (inputInterno) {
      clickLikeUser(inputInterno);
      inputInterno.focus();
      await sleep(FAST_DELAY);
    }

    const seta = campo.querySelector('svg');
    if (seta) {
      clickLikeUser(seta);
      await sleep(FAST_DELAY);
    }

    return true;
  }

  async function selecionarConsentimentoNoCampo(campo, nomeCampo) {
    const abriu = await abrirCampoBaseLegal(campo, nomeCampo);
    if (!abriu) return false;

    const opcaoConsentimento = await waitFor(encontrarOpcaoConsentimentoVisivel, 1800, 70);

    if (!opcaoConsentimento) {
      warn(`Não encontrei a opção "${BASE_LEGAL_TEXTO}" no campo ${nomeCampo}.`);
      return false;
    }

    clickLikeUser(opcaoConsentimento);
    await sleep(FAST_DELAY);
    return true;
  }

  async function configurarBasesLegais() {
    const abriuEditar = await abrirEditarProtecaoDados();
    if (!abriuEditar) {
      warn('Não consegui abrir a edição de proteção de dados.');
      return false;
    }

    const campoCima = await waitFor(encontrarCampoBaseLegalCima, 2200, 80);
    const campoBaixo = await waitFor(encontrarCampoBaseLegalBaixo, 2200, 80);

    if (!campoCima || !campoBaixo) {
      warn('Não encontrei os campos de base legal nas posições 25 e 26.');
      return false;
    }

    const ok1 = await selecionarConsentimentoNoCampo(campoCima, 'de cima');
    await sleep(FAST_DELAY);
    const ok2 = await selecionarConsentimentoNoCampo(campoBaixo, 'de baixo');

    return !!(ok1 && ok2);
  }

  async function preencherCampos() {
    if (!estaNaPaginaDeCriacao()) {
      mostrarAviso('Você não está na tela de criação de contatos.', '#dc3545');
      return;
    }

    const textarea = document.getElementById('tm-area-colar-dados');
    if (!textarea) {
      warn('Textarea não encontrada.');
      return;
    }

    const texto = textarea.value || '';
    const dados = extrairDados(texto);

    if (!dados.nome && !dados.telefone && !dados.localizador) {
      mostrarAviso('Cole os dados primeiro.', '#dc3545');
      return;
    }

    const inputNome = await waitFor(encontrarCampoNome, 1500, 60);
    const inputTelefone = await waitFor(encontrarCampoTelefone, 1500, 60);
    const inputDescricao = await waitFor(encontrarCampoDescricao, 1500, 60);

    let preencheu = false;

    if (inputNome && dados.nome) {
      inputNome.focus();
      setNativeValue(inputNome, dados.nome);
      preencheu = true;
      await sleep(FAST_DELAY);
    }

    if (inputTelefone && dados.telefone) {
      inputTelefone.focus();
      setNativeValue(inputTelefone, dados.telefone);
      preencheu = true;
      await sleep(FAST_DELAY);
    }

    if (inputDescricao && dados.localizador) {
      inputDescricao.focus();
      setNativeValue(inputDescricao, dados.localizador);
      preencheu = true;
      await sleep(FAST_DELAY);
    }

    if (!preencheu) {
      mostrarAviso('Nenhum campo foi preenchido.', '#dc3545');
      return;
    }

    const grupoOk = await selecionarGrupo();
    const basesOk = await configurarBasesLegais();

    if (grupoOk && basesOk) {
      mostrarAviso('Campos preenchidos, grupo e base legal definidos com sucesso.');
    } else if (grupoOk && !basesOk) {
      mostrarAviso('Campos preenchidos e grupo ok, mas falhou na base legal.', '#f59e0b');
    } else if (!grupoOk && basesOk) {
      mostrarAviso('Campos preenchidos e base legal ok, mas falhou no grupo.', '#f59e0b');
    } else {
      mostrarAviso('Campos preenchidos, mas falhou grupo e base legal.', '#dc3545');
    }
  }

  function criarPainel() {
    if (!estaNaPaginaDeCriacao()) return;
    if (document.getElementById(PAINEL_ID)) return;

    const painel = document.createElement('div');
    painel.id = PAINEL_ID;
    painel.style.position = 'fixed';
    painel.style.top = '180px';
    painel.style.right = '20px';
    painel.style.width = '340px';
    painel.style.background = '#ffffff';
    painel.style.border = '1px solid #dcdcdc';
    painel.style.borderRadius = '12px';
    painel.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
    painel.style.padding = '14px';
    painel.style.zIndex = '999999';
    painel.style.fontFamily = 'Arial, sans-serif';

    const titulo = document.createElement('div');
    titulo.textContent = 'Colar dados do contato';
    titulo.style.fontSize = '15px';
    titulo.style.fontWeight = '700';
    titulo.style.marginBottom = '10px';

    const info = document.createElement('div');
    info.textContent = 'Cole em 3 linhas: nome, telefone e localizador.';
    info.style.fontSize = '12px';
    info.style.color = '#555';
    info.style.marginBottom = '10px';
    info.style.lineHeight = '1.4';

    const textarea = document.createElement('textarea');
    textarea.id = 'tm-area-colar-dados';
    textarea.placeholder = 'Exemplo:\nJadson Ferreira Gomes\n(88) 98841-0007\n1JH8Q1';
    textarea.style.width = '100%';
    textarea.style.height = '110px';
    textarea.style.resize = 'vertical';
    textarea.style.border = '1px solid #cfcfcf';
    textarea.style.borderRadius = '8px';
    textarea.style.padding = '10px';
    textarea.style.fontSize = '13px';
    textarea.style.boxSizing = 'border-box';
    textarea.style.marginBottom = '10px';

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = 'Preencher campos';
    botao.style.width = '100%';
    botao.style.border = '0';
    botao.style.borderRadius = '8px';
    botao.style.padding = '10px 12px';
    botao.style.cursor = 'pointer';
    botao.style.fontSize = '14px';
    botao.style.fontWeight = '700';
    botao.style.background = '#0d6efd';
    botao.style.color = '#fff';

    botao.addEventListener('click', preencherCampos);

    painel.appendChild(titulo);
    painel.appendChild(info);
    painel.appendChild(textarea);
    painel.appendChild(botao);

    document.body.appendChild(painel);
    panelVisible = true;
    log('Painel criado.');
  }

  function removerPainel() {
    const painel = document.getElementById(PAINEL_ID);
    if (painel) painel.remove();
    removerAviso();
    panelVisible = false;
  }

  function atualizarVisibilidadePainel() {
    const naPagina = estaNaPaginaDeCriacao();

    if (naPagina && !panelVisible) {
      criarPainel();
    } else if (!naPagina && panelVisible) {
      removerPainel();
    }
  }

  function observarDOMDaPaginaAlvo() {
    if (domObserver) return;

    domObserver = new MutationObserver(() => {
      if (!estaNaPaginaDeCriacao()) return;
      if (!document.getElementById(PAINEL_ID)) {
        criarPainel();
      }
    });

    domObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function interceptarHistorico() {
    if (routeWatchStarted) return;
    routeWatchStarted = true;

    const pushStateOriginal = history.pushState;
    const replaceStateOriginal = history.replaceState;

    history.pushState = function () {
      const result = pushStateOriginal.apply(this, arguments);
      setTimeout(verificarMudancaRota, 30);
      return result;
    };

    history.replaceState = function () {
      const result = replaceStateOriginal.apply(this, arguments);
      setTimeout(verificarMudancaRota, 30);
      return result;
    };

    window.addEventListener('popstate', () => setTimeout(verificarMudancaRota, 30));
    window.addEventListener('hashchange', () => setTimeout(verificarMudancaRota, 30));
  }

  function verificarMudancaRota() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    atualizarVisibilidadePainel();
  }

  function iniciarMonitoramentoLeve() {
    setInterval(verificarMudancaRota, 350);
  }

  function iniciar() {
    interceptarHistorico();
    observarDOMDaPaginaAlvo();
    iniciarMonitoramentoLeve();
    atualizarVisibilidadePainel();
    log('Script iniciado.');
  }

  iniciar();
})();
