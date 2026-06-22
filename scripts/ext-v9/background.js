// RollerWin Capture v9.0 — Background Service Worker
// Inyecta el script de deteccion en MUNDO PRINCIPAL en TODOS los frames
var lastNumber = null;
var totalCaptured = 0;
var isConnected = false;

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
  return url.indexOf('betfury.com') >= 0 ||
         url.indexOf('betfury.io') >= 0 ||
         url.indexOf('pinnacle.com') >= 0;
}

// Cuando una tab carga completamente
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return;
  if (!isCasino(tab.url)) return;
  injectMainScript(tabId);
});

// Cuando un frame dentro de una tab carga (para iframes cross-origin)
chrome.webNavigation.onCompleted.addListener(function(details) {
  if (details.frameId === 0) return; // Solo iframes
  if (!isCasino(details.url)) return;
  injectMainScript(details.tabId, [details.frameId]);
});

// Cuando el usuario activa una tab
chrome.tabs.onActivated.addListener(function(activeInfo) {
  chrome.tabs.get(activeInfo.tabId, function(tab) {
    if (!isCasino(tab.url)) return;
    injectMainScript(activeInfo.tabId);
  });
});

// Al instalar — inyectar en tabs abiertas
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

// Mensajes desde content script
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
    totalCaptured = 0;
    lastNumber = null;
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ ok: true });
  }
  if (msg.type === 'forceInject') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        injectMainScript(tabs[0].id);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false });
      }
    });
  }
  return true;
});