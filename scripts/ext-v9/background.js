// RollerWin Capture v10.0 — Background Service Worker
// Injects MAIN world script into ALL frames of Betfury and Pinnacle tabs
var lastNumber = null;
var totalCaptured = 0;
var isConnected = false;

function isCasino(url) {
  if (!url) return false;
  return url.indexOf('betfury.com') >= 0 || url.indexOf('betfury.io') >= 0 || url.indexOf('pinnacle.com') >= 0;
}

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

// Detect tab load
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return;
  if (!isCasino(tab.url)) return;
  console.log('[RW BG] Casino cargado, inyectando en todos los frames...');
  injectMainScript(tabId);
});

// Detect iframe navigation
chrome.webNavigation.onCompleted.addListener(function(details) {
  if (details.frameId === 0) return;
  chrome.tabs.get(details.tabId, function(tab) {
    if (!isCasino(tab.url)) return;
    console.log('[RW BG] Frame detectado:', details.frameId, details.url.substring(0, 80));
    injectMainScript(details.tabId, [details.frameId]);
  });
});

// Re-inject when user switches to casino tab
chrome.tabs.onActivated.addListener(function(activeInfo) {
  chrome.tabs.get(activeInfo.tabId, function(tab) {
    if (!isCasino(tab.url)) return;
    injectMainScript(activeInfo.tabId);
  });
});

// Messages from content script and popup
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

console.log('[RollerWin BG] Service Worker v10.0 iniciado');