// RollerWin Capture v10.0.1 — Background Service Worker
// Inyecta el script de deteccion en MUNDO PRINCIPAL en TODOS los frames
// v10.0.1 FIX: webNavigation inyecta en iframes cross-origin (Evolution *.click)
// v10.0: Basado en motor v7.6 probado, limitado a 4 mesas especificas
var lastNumber = null;
var totalCaptured = 0;
var isConnected = false;

// 4 mesas autorizadas
var ALLOWED_TABLES = [
  'betfury.com/es/casino/games/roulette-azure-by-pragmatic-play',
  'betfury.com/es/casino/games/roulette-live-by-evolution',
  'casino.pinnacle.com/es/live-casino/games/roulette-azure/',
  'casino.pinnacle.com/es/live-casino/games/european-roulette/'
];

function injectMainScript(tabId, frameIds) {
  var target = { tabId: tabId };
  if (frameIds && frameIds.length > 0) {
    target.frameIds = frameIds;
  } else {
    target.allFrames = true;
  }

  chrome.scripting.executeScript({
    target: target,
    files: ['inject-main.js'],
    injectImmediately: true,
    world: 'MAIN'
  }).catch(function(err) {
    // Silently fail — errors are expected for some frames (about:blank, etc.)
  });
}

function isCasino(url) {
  if (!url) return false;
  return url.indexOf('betfury.com') >= 0 || url.indexOf('betfury.io') >= 0 || url.indexOf('pinnacle.com') >= 0;
}

function isAllowedTable(url) {
  if (!url) return false;
  for (var i = 0; i < ALLOWED_TABLES.length; i++) {
    if (url.indexOf(ALLOWED_TABLES[i]) >= 0) return true;
  }
  return false;
}

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return;
  if (!isCasino(tab.url)) return;
  // Inyectar en todas las pestañas de casino (el filtro de mesa se hace en inject-main.js)
  injectMainScript(tabId);
});

// v10.0.1 FIX: Inyectar en TODOS los iframes de tabs de casino
// El iframe de Evolution tiene dominio *.click, NO betfury.com
// Por eso isCasino(details.url) fallaba — nunca se inyectaba en el iframe
chrome.webNavigation.onCompleted.addListener(function(details) {
  if (details.frameId === 0) return;
  // Verificar la URL del TAB padre, no del iframe
  chrome.tabs.get(details.tabId, function(tab) {
    if (tab && isCasino(tab.url)) {
      injectMainScript(details.tabId, [details.frameId]);
    }
  });
});

// Tambien inyectar en DOMContentLoaded (mas temprano que onCompleted)
chrome.webNavigation.onDOMContentLoaded.addListener(function(details) {
  if (details.frameId === 0) return;
  chrome.tabs.get(details.tabId, function(tab) {
    if (tab && isCasino(tab.url)) {
      injectMainScript(details.tabId, [details.frameId]);
    }
  });
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
  chrome.tabs.get(activeInfo.tabId, function(tab) {
    if (!isCasino(tab.url)) return;
    injectMainScript(activeInfo.tabId);
  });
});

chrome.runtime.onInstalled.addListener(function() {
  chrome.tabs.query({ url: '*://*.betfury.com/*' }, function(tabs) {
    tabs.forEach(function(tab) { injectMainScript(tab.id); });
  });
  chrome.tabs.query({ url: '*://*.betfury.io/*' }, function(tabs) {
    tabs.forEach(function(tab) { injectMainScript(tab.id); });
  });
  chrome.tabs.query({ url: '*://*.pinnacle.com/*' }, function(tabs) {
    tabs.forEach(function(tab) { injectMainScript(tab.id); });
  });
});

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'number') {
    lastNumber = { number: msg.number, color: msg.color, time: Date.now() };
    totalCaptured = msg.total || (totalCaptured + 1);
    isConnected = true;
    chrome.action.setBadgeText({ text: String(totalCaptured) });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  }
  if (msg.type === 'getStatus') {
    sendResponse({ lastNumber: lastNumber, totalCaptured: totalCaptured, isConnected: isConnected });
  }
  if (msg.type === 'reset') {
    totalCaptured = 0; lastNumber = null;
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ ok: true });
  }
  if (msg.type === 'forceInject') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) { injectMainScript(tabs[0].id); sendResponse({ ok: true }); }
      else { sendResponse({ ok: false }); }
    });
  }
  return true;
});