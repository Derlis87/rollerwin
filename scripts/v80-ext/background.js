var _ln = null;
var _tc = 0;
var _ic = false;

function _inj(tid, fids) {
  var t = { tabId: tid };
  if (fids && fids.length > 0) { t.frameIds = fids; } else { t.allFrames = true; }
  chrome.scripting.executeScript({
    target: t,
    files: ['inject-main.js'],
    injectImmediately: true,
    world: 'MAIN'
  }).catch(function(err) {
    // Silently fail — errors are expected for some frames (about:blank, etc.)
  });
}

function _ok(url) {
  if (!url) return false;
  return url.indexOf('betfury.com') >= 0 || url.indexOf('betfury.io') >= 0 || url.indexOf('pinnacle.com') >= 0;
}

chrome.tabs.onUpdated.addListener(function(tid, ci, tab) {
  if (ci.status !== 'complete') return;
  if (!_ok(tab.url)) return;
  _inj(tid);
});

chrome.webNavigation.onCompleted.addListener(function(d) {
  if (d.frameId === 0) return;
  // Use d.url (the frame's own URL) instead of tab.url for reliability
  if (!_ok(d.url)) return;
  _inj(d.tabId, [d.frameId]);
});

chrome.tabs.onActivated.addListener(function(ai) {
  chrome.tabs.get(ai.tabId, function(tab) {
    if (!_ok(tab.url)) return;
    _inj(ai.tabId);
  });
});

// Re-inject when the extension is installed/updated on already-open tabs
chrome.runtime.onInstalled.addListener(function() {
  chrome.tabs.query({ url: '*://*.betfury.com/*' }, function(tabs) {
    tabs.forEach(function(tab) { _inj(tab.id); });
  });
  chrome.tabs.query({ url: '*://*.betfury.io/*' }, function(tabs) {
    tabs.forEach(function(tab) { _inj(tab.id); });
  });
  chrome.tabs.query({ url: '*://*.pinnacle.com/*' }, function(tabs) {
    tabs.forEach(function(tab) { _inj(tab.id); });
  });
});

chrome.runtime.onMessage.addListener(function(msg, sender, sr) {
  if (msg.type === 'number') {
    _ln = { number: msg.number, color: msg.color, time: Date.now() };
    _tc = msg.total || (_tc + 1);
    _ic = true;
    chrome.action.setBadgeText({ text: String(_tc) });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  }
  if (msg.type === 'getStatus') {
    sr({ lastNumber: _ln, totalCaptured: _tc, isConnected: _ic });
  }
  if (msg.type === 'reset') {
    _tc = 0; _ln = null;
    chrome.action.setBadgeText({ text: '' });
    sr({ ok: true });
  }
  if (msg.type === 'forceInject') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) { _inj(tabs[0].id); sr({ ok: true }); }
      else { sr({ ok: false }); }
    });
  }
  return true;
});