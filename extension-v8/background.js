var lastNumber = null;
var totalCaptured = 0;
var isConnected = false;

var DOMAINS = ['betfury.com', 'betfury.io', 'pinnacle.com'];

function isSupported(url) {
  if (!url) return false;
  for (var i = 0; i < DOMAINS.length; i++) {
    if (url.indexOf(DOMAINS[i]) >= 0) return true;
  }
  return false;
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
  }).then(function() {}).catch(function() {});
}

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return;
  if (!isSupported(tab.url)) return;
  injectMainScript(tabId);
});

chrome.webNavigation.onCompleted.addListener(function(details) {
  if (details.frameId === 0) return;
  chrome.tabs.get(details.tabId, function(tab) {
    if (!isSupported(tab.url)) return;
    injectMainScript(details.tabId, [details.frameId]);
  });
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
  chrome.tabs.get(activeInfo.tabId, function(tab) {
    if (!isSupported(tab.url)) return;
    injectMainScript(activeInfo.tabId);
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
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false });
      }
    });
  }
  return true;
});