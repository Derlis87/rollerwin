// RollerWin Capture v7.7 — Background Service Worker
// Inyecta el script de deteccion en MUNDO PRINCIPAL en TODOS los frames
var lastNumber = null;
var totalCaptured = 0;
var isConnected = false;

// ══════════════════════════════════════
// INYECCION en MAIN world en TODOS los frames
// ══════════════════════════════════════
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
  }).then(function() {
    console.log('[RW BG] Inyeccion MAIN world OK en tab', tabId);
  }).catch(function(err) {
    console.log('[RW BG] Error inyeccion MAIN:', err.message);
  });
}

function isBetfury(url) {
  if (!url) return false;
  return url.indexOf('betfury.com') >= 0 || url.indexOf('betfury.io') >= 0;
}

function isBetfuryGame(url) {
  if (!url) return false;
  return url.indexOf('betfury.com') >= 0 && url.indexOf('/casino/games/') >= 0;
}

// ══════════════════════════════════════
// v7.7: CERRAR pestañas duplicadas de betfury game
// Cuando recovery abre una nueva pestaña, detectarla y cerrarla.
// Solo mantener UNA pestaña de juego abierta.
// ══════════════════════════════════════
function closeDuplicateBetfuryTabs(newTabId) {
  chrome.tabs.query({ url: '*://*.betfury.com/*casino/games/*' }, function(tabs) {
    if (tabs.length > 1) {
      // Hay mas de una pestaña de juego — cerrar la mas nueva
      // (la original es la que ya estaba capturando)
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].id === newTabId && tabs[i].url && tabs[i].url.indexOf('/casino/games/') !== -1) {
          console.log('[RW BG] Cerrando pestaña DUPLICADA de juego (tab ' + tabs[i].id + '):', tabs[i].url);
          chrome.tabs.remove(tabs[i].id);
          return;
        }
      }
    }
  });
}

// Detectar cuando se abre una nueva pestaña — verificar duplicados
chrome.tabs.onCreated.addListener(function(tab) {
  // Esperar un poco a que la URL se resuelva (puede empezar como about:blank)
  if (!tab.url || tab.url === 'about:blank' || !isBetfuryGame(tab.url)) {
    // Programar verificación retrasada
    setTimeout(function() {
      chrome.tabs.get(tab.id, function(t) {
        if (t && isBetfuryGame(t.url)) {
          console.log('[RW BG] Nueva pestaña de juego detectada (retrasada):', t.url);
          closeDuplicateBetfuryTabs(tab.id);
        }
      });
    }, 3000);
    return;
  }
  console.log('[RW BG] Nueva pestaña de juego detectada:', tab.url);
  closeDuplicateBetfuryTabs(tab.id);
});

// También verificar cuando una pestaña cambia de URL a betfury game
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.url && isBetfuryGame(changeInfo.url)) {
    setTimeout(function() {
      console.log('[RW BG] Tab navegó a juego:', changeInfo.url);
      closeDuplicateBetfuryTabs(tabId);
    }, 1000);
  }
});

// ══════════════════════════════════════
// Detectar carga de tab principal
// ══════════════════════════════════════
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return;
  if (!isBetfury(tab.url)) return;
  console.log('[RW BG] Betfury cargado, inyectando en todos los frames...');
  injectMainScript(tabId);
});

// ══════════════════════════════════════
// Detectar navegacion de iframes (sub-frames)
// ══════════════════════════════════════
chrome.webNavigation.onCompleted.addListener(function(details) {
  if (details.frameId === 0) return;
  chrome.tabs.get(details.tabId, function(tab) {
    if (!isBetfury(tab.url)) return;
    console.log('[RW BG] Frame detectado:', details.frameId, details.url);
    injectMainScript(details.tabId, [details.frameId]);
  });
});

// ══════════════════════════════════════
// Re-inyectar cuando usuario cambia a tab de betfury
// ══════════════════════════════════════
chrome.tabs.onActivated.addListener(function(activeInfo) {
  chrome.tabs.get(activeInfo.tabId, function(tab) {
    if (!isBetfury(tab.url)) return;
    injectMainScript(activeInfo.tabId);
  });
});

// ══════════════════════════════════════
// Mensajes desde content script y popup
// ══════════════════════════════════════
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'number') {
    lastNumber = { number: msg.number, color: msg.color, time: Date.now() };
    totalCaptured = msg.total || (totalCaptured + 1);
    isConnected = true;
    chrome.action.setBadgeText({ text: String(totalCaptured) });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  }
  if (msg.type === 'getStatus') {
    sendResponse({
      lastNumber: lastNumber,
      totalCaptured: totalCaptured,
      isConnected: isConnected
    });
  }
  if (msg.type === 'reset') {
    totalCaptured = 0;
    lastNumber = null;
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ ok: true });
  }
  if (msg.type === 'forceInject') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        injectMainScript(tabs[0].id);
        sendResponse({ ok: true, msg: 'Inyeccion forzada en tab ' + tabs[0].id });
      } else {
        sendResponse({ ok: false, msg: 'No hay tab activo' });
      }
    });
  }
  return true;
});

console.log('[RollerWin BG] Service Worker v7.7 iniciado');
