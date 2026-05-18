// RollerWin Capture - Background Service Worker
var lastNumber = null
var totalCaptured = 0
var isConnected = false

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'number') {
    lastNumber = { number: msg.number, color: msg.color, time: Date.now() }
    totalCaptured = msg.total
    isConnected = true
    // Badge
    chrome.action.setBadgeText({ text: String(totalCaptured) })
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })
  }
  if (msg.type === 'getStatus') {
    sendResponse({
      lastNumber: lastNumber,
      totalCaptured: totalCaptured,
      isConnected: isConnected
    })
  }
  if (msg.type === 'reset') {
    totalCaptured = 0
    lastNumber = null
    chrome.action.setBadgeText({ text: '' })
    sendResponse({ ok: true })
  }
  return true
})
