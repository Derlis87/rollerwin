(function(){
'use strict';
if(window._x7k2m)return;
if(navigator.webdriver)return;
window._x7k2m=true;
var _S='https://rollerwin3.onrender.com',_ln=-1,_lt=0,_sc=0;
var _ts=0,_DW=9000,_ns={};
var _h=(window.self!==window.top),_hn=location.hostname||'';
var _R=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
function _c(n){return n===0?'green':_R.indexOf(n)>=0?'red':'black';}
function _q(){var n=Date.now();return n-_ts<_DW;}
function _m(n){var n=Date.now();_ts=n;_ns[n]=n;for(var k in _ns){if(n-_ns[k]>_DW+5000)delete _ns[k];}}
function _y(n){if(n>=0&&n<=36){_ns[n]=Date.now();}}
var _cn=_hn.indexOf('pinnacle')>=0?'pinnacle':'betfury';
var _RL={betfury:['https://betfury.com/es/casino/games/roulette-live-by-evolution','https://betfury.com/es/casino/games/roulette-azure-by-pragmatic-play'],pinnacle:['https://casino.pinnacle.com/es/live-casino/games/european-roulette/','https://casino.pinnacle.com/es/live-casino/games/roulette-azure/']};
function _gu(){var u=_RL[_cn];return u?u[0]:location.href;}

function _d(n,s){
if(n<0||n>36)return;
if(_q())return;
if(typeof _cs==='function'&&_cs(n))return;
_m(n);if(typeof _as==='function')_as(n);
_ln=n;_lt=Date.now();_sc++;
try{
var f=function(a){
fetch(_S+'/api/capture/receive?_t='+Date.now(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({number:n})}).then(function(r){if(!r.ok&&a<2)setTimeout(function(){f(a+1);},2000);}).catch(function(){if(a<2)setTimeout(function(){f(a+1);},2000);});
};f(0);
}catch(e){}
if(_h){try{window.parent.postMessage({source:'x-rc-8f3k',number:n,color:_c(n),hostname:_hn},'*');}catch(e){}}
else{try{document.dispatchEvent(new CustomEvent('x-d',{detail:{number:n,color:_c(n)}}));}catch(e){}}
}

if(!_h){
var _pln=-1;
window.addEventListener('message',function(e){
try{
var d=e.data;
if(d&&d.source==='x-rc-8f3k'&&typeof d.number==='number'){
_pln=d.number;
try{document.dispatchEvent(new CustomEvent('x-d',{detail:{number:d.number,color:d.color}}));}catch(e){}
}
if(d&&d.source==='x-sy'&&typeof d.lastNumber==='number'){
try{window.postMessage({source:'x-sy-r',lastNumber:_pln},'*');}catch(e){}
}
}catch(e){}
});

var _kc=0,_lct=Date.now(),_lkr='pending';
var _K='x_rw_v8',_rw=JSON.parse(localStorage.getItem(_K)||'{}');
var _rc=_rw.rc||0,_ir=!!_rw.ir,_se=!!_rw.se,_lcp=_rw.lct||Date.now();
var _gu2=_rw.gu||location.href,_rip=_rw.rip||false,_rt=_rw.rt||0;
if(_rip&&Date.now()-_rt>60000)_rip=false;

function _ss(){
try{
localStorage.setItem(_K,JSON.stringify({rc:_rc,ir:_ir,se:_se,lct:_lcp,gu:_gu2,rt:_rt,rip:_rip,t:Date.now()}));
}catch(e){}
}
_ss();

var _po=history.pushState,_ro=history.replaceState;
if(history.pushState){history.pushState=function(){var r=_po.apply(this,arguments);if(location.href.indexOf('/casino/')!==-1||location.href.indexOf('/live-casino/')!==-1){_gu2=location.href;_ss();}return r;};}
if(history.replaceState){history.replaceState=function(){var r=_ro.apply(this,arguments);if(location.href.indexOf('/casino/')!==-1||location.href.indexOf('/live-casino/')!==-1){_gu2=location.href;_ss();}return r;};}
setInterval(function(){if((location.href.indexOf('/casino/')!==-1||location.href.indexOf('/live-casino/')!==-1)&&_gu2!==location.href){_gu2=location.href;_ss();}},10000);

document.addEventListener('x-d',function(){_lct=Date.now();_lcp=_lct;if(!_rip){_ir=false;_se=false;}_ss();});
window.addEventListener('message',function(e){try{if(e.data&&e.data.source==='x-se'){_se=true;_ss();_he(e.data.reason);}}catch(er){}});

var _of=window.fetch;
if(_of&&!_of._xKA){
_of._xKA=true;
window.fetch=function(i,init){
var u='';try{u=typeof i==='string'?i:(i&&i.url?i.url:'');}catch(e){}
var p=_of.apply(this,arguments);
if(p&&u){
p.then(function(r){
if(r.redirected){var ru=(r.url||'').toLowerCase();if(ru.indexOf('login')!==-1||ru.indexOf('signin')!==-1||ru.indexOf('auth')!==-1){_se=true;_ss();_he('fr-'+ru);return;}}
if(r.status===401||r.status===403){_se=true;_ss();_he('fi-'+r.status);}
}).catch(function(){});
}return p;
};
}

var _xo=XMLHttpRequest.prototype.open,_xs=XMLHttpRequest.prototype.send;
if(!_xs._xKA){
_xs._xKA=true;
XMLHttpRequest.prototype.open=function(m,u){this._xu=String(u||'');return _xo.apply(this,arguments);};
XMLHttpRequest.prototype.send=function(){
var s=this;
this.addEventListener('load',function(){
var ru=(s.responseURL||'').toLowerCase();
if(ru.indexOf('login')!==-1||ru.indexOf('signin')!==-1){_se=true;_ss();_he('xr-l');return;}
if(s.status===401||s.status===403){_se=true;_ss();_he('xi-'+s.status);}
});
return _xs.apply(this,arguments);
};
}

function _kla(){
_kc++;
fetch(location.pathname||'/',{method:'GET',credentials:'include',redirect:'follow'}).then(function(r){
_lkr=r.status;
if(r.redirected){var ru=(r.url||'').toLowerCase();if(ru.indexOf('login')!==-1||ru.indexOf('signin')!==-1){_se=true;_ss();_he('kl-r');return;}}
r.clone().text().then(function(t){if(t&&t.length<5000&&t.indexOf('<')!==-1){var tl=t.toLowerCase();if((tl.indexOf('login')!==-1||tl.indexOf('sign in')!==-1)&&tl.indexOf('password')!==-1){_se=true;_ss();_he('kl-h');return;}}}).catch(function(){});
if(r.status===401||r.status===403){_se=true;_ss();_he('kl-'+r.status);}
}).catch(function(){});
}
setTimeout(_kla,1500);setInterval(_kla,30000);

function _cbt(tx){
var sels='button,a,[role="button"],div[onclick],span[onclick],[class*="btn"],[class*="button"]';
var all=document.querySelectorAll(sels);
for(var i=0;i<all.length;i++){
var bt=(all[i].textContent||'').trim();
for(var j=0;j<tx.length;j++){if(bt===tx[j]){all[i].click();return true;}}
}
var all2=document.querySelectorAll('div,span,a');
for(var i=0;i<all2.length;i++){
var bt=(all2[i].textContent||'').trim();
if(bt.length>0&&bt.length<=20){
var st=window.getComputedStyle(all2[i]);
if(st.cursor==='pointer'||all2[i].getAttribute('role')==='button'){
for(var j=0;j<tx.length;j++){if(bt===tx[j]){all2[i].click();return true;}}
}}
}
return false;
}

function _he(reason){
if(_rip)return;
var now=Date.now();
if(now-_rt<12000)return;
_rip=true;_rt=now;_ir=true;_se=true;_rc++;_ss();
var ck=_cbt(['OK','Ok','ok','ACEPTAR','Aceptar','aceptar','VOLVER','Volver','volver','INICIAR','Iniciar','iniciar','CONTINUAR','Continuar','continuar','CLOSE','Close','close']);
setTimeout(function(){
var tu=_gu();
if(_gu2&&(_gu2.indexOf('/casino/games/')!==-1||_gu2.indexOf('/live-casino/games/')!==-1))tu=_gu2;
location.replace(tu);
},ck?500:100);
setTimeout(function(){_rip=false;_ss();},20000);
}

function _dam(){
var all=document.querySelectorAll('div,p,span,h1,h2,h3,dialog,section,article,main,li,label,td,th');
for(var i=0;i<all.length;i++){
var t=(all[i].textContent||'').toLowerCase();
if((t.indexOf('sesi')!==-1&&t.indexOf('finalizada')!==-1)||(t.indexOf('session')!==-1&&(t.indexOf('expired')!==-1||t.indexOf('ended')!==-1))){
_he('ms');return true;
}
if((t.indexOf('saldo')!==-1&&t.indexOf('bajo')!==-1)||(t.indexOf('balance')!==-1&&t.indexOf('low')!==-1)||(t.indexOf('insufficient')!==-1&&t.indexOf('balance')!==-1)){
_cbt(['CERRAR','Cerrar','cerrar','CLOSE','Close','OK','Ok','ok']);return true;
}
}
return false;
}
setInterval(_dam,400);
try{new MutationObserver(function(){_dam();}).observe(document.body,{childList:true,subtree:true});}catch(e){}

var _pbc=0;
function _cpb(){
if(_pbc>Date.now())return false;
var og=location.href.indexOf('/casino/')!==-1||location.href.indexOf('/live-casino/')!==-1;
if(!og)return false;
var btns=document.querySelectorAll('button,a,[role="button"],div[onclick],[class*="btn"],[class*="button"]');
for(var i=0;i<btns.length;i++){
var bt=(btns[i].textContent||'').trim().toLowerCase();
if(bt==='jugar'||bt==='play'||bt==='play now'||bt==='spin'||bt==='start'){
if(btns[i].getAttribute('target')==='_blank')continue;
if(btns[i].tagName.toLowerCase()==='a'&&btns[i].getAttribute('target'))continue;
btns[i].click();_pbc=Date.now()+5000;_ir=true;_ss();return true;
}
}
return false;
}
setInterval(_cpb,400);

setInterval(function(){
var nc=Date.now()-_lct;
var og=location.href.indexOf('/casino/')!==-1||location.href.indexOf('/live-casino/')!==-1;
if(og&&nc>60000&&!_rip){_ir=true;_se=true;_ss();location.reload();}
},10000);

setTimeout(function(){
if(_ir||_se||_rc>0){
var og=location.href.indexOf('/casino/')!==-1||location.href.indexOf('/live-casino/')!==-1;
if(!og){_he('pl-r');return;}
_cpb();_dam();
setTimeout(function(){_cpb();_dam();},600);
setTimeout(function(){_cpb();_dam();},1200);
}
},100);

document.addEventListener('visibilitychange',function(){if(!document.hidden){_kla();if(_rc>0)var og=location.href.indexOf('/casino/')===-1&&location.href.indexOf('/live-casino/')===-1;if(og)_he('vis');if(location.href.indexOf('/casino/')!==-1||location.href.indexOf('/live-casino/')!==-1){_cpb();_dam();}}});
window.addEventListener('focus',function(){_kla();if(location.href.indexOf('/casino/')!==-1||location.href.indexOf('/live-casino/')!==-1){_cpb();_dam();}});

setInterval(function(){try{document.dispatchEvent(new CustomEvent('x-s',{detail:{status:_ir?'recovering':'alive',keepAliveCount:_kc,lastResponse:_lkr,noCaptureSec:Math.round((Date.now()-_lct)/1000),recoverCount:_rc,sessionExpired:_se,gameUrl:_gu2}}));}catch(e){}},10000);
}

var _imn=false;
function _dim(){
var all=document.querySelectorAll('div,p,span,h1,h2,h3,dialog,section,article,main,li,label,td,th');
for(var i=0;i<all.length;i++){
var t=(all[i].textContent||'').toLowerCase();
if((t.indexOf('sesi')!==-1&&t.indexOf('finalizada')!==-1)||(t.indexOf('session')!==-1&&(t.indexOf('ended')!==-1||t.indexOf('expired')!==-1))){
if(!_imn){_imn=true;try{window.parent.postMessage({source:'x-se',reason:'im-d'},'*');}catch(e){}}
var ob=all[i].closest&&all[i].closest('div,dialog')?all[i].closest('div,dialog').querySelectorAll('button,a,[role="button"],div[onclick],span[onclick]'):[];
for(var j=0;j<ob.length;j++){var bt=(ob[j].textContent||'').trim();if(bt==='OK'||bt==='Ok'||bt==='ok'||bt==='ACEPTAR'||bt==='Aceptar'){ob[j].click();}}
return true;
}
}
return false;
}
setInterval(_dim,500);
try{new MutationObserver(function(){_dim();}).observe(document.body,{childList:true,subtree:true});}catch(e){}

var _ila=Date.now(),_idn=false;
var _iof=window.fetch;
if(_iof&&!_iof._xIS){
_iof._xIS=true;
window.fetch=function(i,init){
_ila=Date.now();
var p=_iof.apply(this,arguments);
if(p){p.then(function(r){if(r.status===401||r.status===403||r.redirected){var ru=(r.url||'').toLowerCase();if(r.status===401||r.status===403||ru.indexOf('login')!==-1){try{window.parent.postMessage({source:'x-se',reason:'if-f-'+r.status},'*');}catch(e){}}}}).catch(function(){});}
return p;
};
}

setInterval(function(){if(!_idn&&Date.now()-_ila>45000){_idn=true;try{window.parent.postMessage({source:'x-se',reason:'if-d45'},'*');}catch(e){}_sgr();}},10000);

var _ilct=Date.now(),_gra=false,_grt=null,_GT=22000,_GSI=3000;
var _wsc=false,_wrc=0;

var _sq=[],_SM=5,_SW=10000;
function _cs(n){for(var i=0;i<_sq.length;i++){if(_sq[i].n===n&&Date.now()-_sq[i].t<_SW)return true;}return false;}
function _as(n){_sq.push({n:n,t:Date.now()});if(_sq.length>_SM)_sq.shift();_ilct=Date.now();if(_gra){_gra=false;}}

function _grs(){
var sel=['[class*="winning-number"]','[class*="winning-pocket"]','[class*="result-display"]','[class*="result-value"]','[class*="current-result"]','[class*="game-number-display"]','[class*="number-display"]','[data-result-number]','[data-winning-number]','[data-game-result]','[class*="overlay"] [class*="result"]','[class*="announced"]','[class*="round-result"]','[class*="roulette-result"]','[class*="live-result"]','[class*="last-number"]','[class*="lastnumber"]','[class*="game-result"]'];
for(var i=0;i<sel.length;i++){try{var els=document.querySelectorAll(sel[i]);for(var j=0;j<els.length;j++){var tx=(els[j].textContent||'').trim();var nm=parseInt(tx,10);if(!isNaN(nm)&&nm>=0&&nm<=36&&String(nm)===tx){_d(nm,'GR:'+sel[i]);return true;}}}catch(e){}}
return false;
}
function _sgr(){if(_gra)return;_gra=true;_grs();_grt=setInterval(function(){if(!_gra){clearInterval(_grt);return;}_grs();},_GSI);}
setInterval(function(){if(!_gra&&Date.now()-_ilct>_GT)_sgr();},5000);

try{
var _sh=function(e){try{if(e.data&&e.data.source==='x-sy-r'&&typeof e.data.lastNumber==='number'){_y(e.data.lastNumber);_as(e.data.lastNumber);window.removeEventListener('message',_sh);}}catch(er){}};
window.parent.postMessage({source:'x-sy'},'*');
window.addEventListener('message',_sh);
setTimeout(function(){window.removeEventListener('message',_sh);},2000);
}catch(e){}
setInterval(function(){try{window.parent.postMessage({source:'x-sy'},'*');}catch(e){}},30000);

var _RF=['number','result','resultnumber','winningnumber','win_number','game_number','roulette_number','ball_number','pocket','pocket_number','winningpocket','pocketid','resultid','displaynumber','roundresult','gameoutcome','finalnumber','outcome','winningnumberdisplay','resultnumber','final_number','game_result','round_result','game_outcome','numberstr','numberstring'];
function _irf(k){var kk=k.replace(/[_\-\s]/g,'').toLowerCase();for(var i=0;i<_RF.length;i++){if(kk===_RF[i].replace(/[_\-\s]/g,''))return true;}return false;}
function _tn(v){if(typeof v==='number'&&v>=0&&v<=36&&v===Math.floor(v))return v;if(typeof v==='string'){var s=v.trim();if((s.length===1||s.length===2)&&s===String(parseInt(s,10))){var n=parseInt(s,10);if(n>=0&&n<=36)return n;}}return null;}
function _eo(o,dp,pa){
if(!o||typeof o!=='object'||dp>4)return;
if(Array.isArray(o)){
if(o.length===0)return;if(o.length>5)return;
var pl=pa.toLowerCase();
if(pl.indexOf('result')>=0||pl.indexOf('winning')>=0||pl.indexOf('outcome')>=0||pl.indexOf('pocket')>=0){
var last=o[o.length-1];var n=_tn(last);if(n!==null){_d(n,'a@'+pa);return;}
if(typeof last==='object')_eo(last,dp+1,pa+'['+(o.length-1)+']');
}return;
}
var keys=Object.keys(o);
for(var i=0;i<keys.length;i++){
var k=keys[i],v=o[k];
if(_irf(k)){var n=_tn(v);if(n!==null){_d(n,k+'@'+pa);return;}}
if(typeof v==='object'&&v!==null)_eo(v,dp+1,pa+'.'+k);
}
}
function _eft(text,src){
if(!text||typeof text!=='string'||text.length>200000)return;
var pats=[/"resultNumber"\s*:\s*(\d{1,2})\b/gi,/"winningNumber"\s*:\s*(\d{1,2})\b/gi,/"winning_number"\s*:\s*(\d{1,2})\b/gi,/"ball_number"\s*:\s*(\d{1,2})\b/gi,/"pocket_number"\s*:\s*(\d{1,2})\b/gi,/"roulette_number"\s*:\s*(\d{1,2})\b/gi,/"finalNumber"\s*:\s*(\d{1,2})\b/gi,/"game_number"\s*:\s*(\d{1,2})\b/gi,/"displayNumber"\s*:\s*(\d{1,2})\b/gi,/"winningPocket"\s*:\s*(\d{1,2})\b/gi];
var lm=null;
for(var i=0;i<pats.length;i++){var m;pats[i].lastIndex=0;while((m=pats[i].exec(text))!==null){var n=parseInt(m[1],10);if(n>=0&&n<=36)lm=n;}}
if(lm!==null)_d(lm,'rx@'+src);
}

(function(){
var OW=window.WebSocket;
if(!OW||OW._xV8)return;
OW._xV8=true;
var PW=function(url,protocols){
var ws=protocols?new OW(url,protocols):new OW(url);
if(_wsc){_wsc=false;setTimeout(function(){_sgr();},1000);}
ws.addEventListener('message',function(e){
try{
_ila=Date.now();
var data=e.data;
if(typeof data!=='string'){if(data instanceof ArrayBuffer){try{data=String.fromCharCode.apply(null,new Uint8Array(data));}catch(er){return;}}else return;}
if(data.charAt(0)==='4'&&(data.charAt(1)==='2'||data.charAt(1)==='3')){
try{
var p=JSON.parse(data.substring(2));
if(Array.isArray(p)&&p.length>=2&&typeof p[1]==='object'){
var ev=String(p[0]||'');
if(ev.indexOf('result')>=0||ev.indexOf('complete')>=0||ev.indexOf('win')>=0||ev.indexOf('round')>=0||ev.indexOf('spin')>=0||ev.indexOf('game')>=0||ev.indexOf('end')>=0||ev.indexOf('finish')>=0||ev.indexOf('update')>=0||ev.indexOf('new')>=0||ev.indexOf('bet')>=0){
_eo(p[1],0,'s.'+ev);_eft(data,'s.'+ev);
}else{_eft(data,'sf.'+ev);}
}
}catch(err){}
}
if(data.charAt(0)==='{'||data.charAt(0)==='['){try{_eo(JSON.parse(data),0,'w');_eft(data,'w');}catch(err){}
}
}catch(err){}
});
ws.addEventListener('close',function(){_wsc=true;_idn=false;});
return ws;
};
PW.prototype=OW.prototype;PW.CONNECTING=OW.CONNECTING;PW.OPEN=OW.OPEN;PW.CLOSING=OW.CLOSING;PW.CLOSED=OW.CLOSED;
window.WebSocket=PW;
})();

(function(){
var of=window.fetch;if(!of||of._xV8)return;of._xV8=true;
window.fetch=function(input,init){
var u='';try{u=typeof input==='string'?input:(input instanceof Request)?(input.url||''):(input&&input.url)?input.url:'';}catch(e){}
var p=of.apply(this,arguments);
var ul=u.toLowerCase();
if(ul.indexOf('result')>=0||ul.indexOf('roulette')>=0||ul.indexOf('evolution')>=0||ul.indexOf('round')>=0||ul.indexOf('wheel')>=0){
if(ul.indexOf('history')>=0||ul.indexOf('state')>=0||ul.indexOf('stats')>=0)return p;
p.then(function(r){try{r.clone().text().then(function(t){if(t){try{_eo(JSON.parse(t),0,'f');}catch(e){}_eft(t,'f');}}).catch(function(){});}catch(e){}).catch(function(){});
}
return p;
};
})();

(function(){
var oo=XMLHttpRequest.prototype.open,os=XMLHttpRequest.prototype.send;
if(os._xV8)return;os._xV8=true;
XMLHttpRequest.prototype.open=function(m,u){this._xu=String(u||'');return oo.apply(this,arguments);};
XMLHttpRequest.prototype.send=function(){
var s=this;
this.addEventListener('load',function(){
var u=(s._xu||'').toLowerCase();
if(u.indexOf('result')>=0||u.indexOf('roulette')>=0||u.indexOf('evolution')>=0||u.indexOf('round')>=0||u.indexOf('wheel')>=0){
if(u.indexOf('history')>=0||u.indexOf('state')>=0||u.indexOf('stats')>=0)return;
try{var t=s.responseText;if(t){try{_eo(JSON.parse(t),0,'x');}catch(e){}_eft(t,'x');}}catch(e){}
}
});
return os.apply(this,arguments);
};
})();

(function(){
var HK=['history','past','track','sequence','previous','older','last-result','lastresults','gamehistory','result-history','historyitem','resultshistory','bng','stats','statistics','roadmap','bigroad','beadroad','marker'];
var CK=['winning-number','winningnumber','winning-pocket','winningpocket','result-display','resultdisplay','result-value','resultvalue','current-result','game-number-display','number-display','overlay-result','announced','lastnumber','round-result','roulette-result','live-result','detailed-result'];
function _isH(el){if(!el)return false;var c=((el.className||'')+' '+(el.id||'')+' '+(el.getAttribute('data-test')||'')).toLowerCase();for(var i=0;i<HK.length;i++){if(c.indexOf(HK[i])>=0)return true;}var p=el.parentElement,d=0;while(p&&d<5){var pc=((p.className||'')+' '+(p.id||'')).toLowerCase();for(var i=0;i<HK.length;i++){if(pc.indexOf(HK[i])>=0)return true;}p=p.parentElement;d++;}return false;}
function _isC(el){if(!el)return false;var c=((el.className||'')+' '+(el.id||'')+' '+(el.getAttribute('data-test')||'')).toLowerCase();for(var i=0;i<CK.length;i++){if(c.indexOf(CK[i])>=0)return true;}if(el.hasAttribute('data-result-number')||el.hasAttribute('data-winning-number')||el.hasAttribute('data-game-result'))return true;return false;}
var SS=['[class*="winning-number"]','[class*="winning-pocket"]','[class*="result-display"]','[class*="result-value"]','[class*="current-result"]','[class*="game-number-display"]','[class*="number-display"]','[data-result-number]','[data-winning-number]','[data-game-result]','[class*="overlay"] [class*="result"]','[class*="announced"]','[class*="round-result"]','[class*="roulette-result"]','[class*="live-result"]'];
var _dn2=-1,_dt2=0,_DRL=15000;
function _sd(){
for(var i=0;i<SS.length;i++){try{var els=document.querySelectorAll(SS[i]);for(var j=0;j<els.length;j++){if(_isH(els[j]))continue;if(!_isC(els[j])&&!els[j].hasAttribute('data-result-number')&&!els[j].hasAttribute('data-winning-number'))continue;var tx=(els[j].textContent||'').trim();var nm=parseInt(tx,10);if(!isNaN(nm)&&nm>=0&&nm<=36&&String(nm)===tx){var now=Date.now();if(nm===_dn2&&now-_dt2<_DRL)return;_dn2=nm;_dt2=now;_d(nm,'D:'+SS[i]);return;}}}catch(e){}}
}
function _setup(){if(!document.body)return;setTimeout(_sd,500);setTimeout(_sd,2000);var t=null;new MutationObserver(function(){if(t)return;t=setTimeout(function(){t=null;_sd();},500);}).observe(document.body,{childList:true,subtree:true,characterData:true});setInterval(_sd,6000);}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(_setup,100);});}else{setTimeout(_setup,100);}
})();

(function(){
var op=window.postMessage;if(op._xV8)return;op._xV8=true;
window.postMessage=function(data,origin,transfer){try{if(typeof data==='object'&&data!==null)_eo(data,0,'po');}catch(e){}return op.call(window,data,origin,transfer);};
window.addEventListener('message',function(e){try{var d=e.data;if(typeof d==='object'&&d!==null)_eo(d,0,'pi');}catch(e){}});
})();

(function(){
if(typeof window.EventSource==='undefined')return;
var OE=window.EventSource;if(OE._xV8)return;OE._xV8=true;
var EP=function(url,opts){var es=opts?new OE(url,opts):new OE(url);var ad=es.addEventListener.bind(es);['result','game','update','roulette','number','outcome','round'].forEach(function(t){ad(t,function(e){try{if(typeof e.data==='string'){_eft(e.data,'sse.'+t);try{_eo(JSON.parse(e.data),0,'sse.'+t);}catch(err){}}}catch(err){}});});return es;};
EP.prototype=OE.prototype;EP.CONNECTING=OE.CONNECTING;EP.OPEN=OE.OPEN;EP.CLOSED=OE.CLOSED;
window.EventSource=EP;
})();
})();