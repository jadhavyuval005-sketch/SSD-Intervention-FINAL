// ---- Backend connection ----
// Address of the Flask API (see backend/README.md). Set to "" to run without a backend (guest mode only).
const API_BASE = "http://localhost:5000/api";
const TOKEN_KEY = "vaaniai_token";
function authToken(){try{return localStorage.getItem(TOKEN_KEY)||sessionStorage.getItem(TOKEN_KEY)}catch{return null}}
async function api(path,{method="GET",json,body,auth=true}={}){
  const headers={},token=auth?authToken():null;
  if(json!==undefined)headers["Content-Type"]="application/json";
  if(token)headers.Authorization="Bearer "+token;
  let res;
  try{res=await fetch(API_BASE+path,{method,headers,body:json!==undefined?JSON.stringify(json):body})}
  catch{throw new Error("Cannot reach the server. Check that the backend is running.")}
  let data=null;try{data=await res.json()}catch{}
  if(!res.ok){
    if(res.status===401&&token)document.dispatchEvent(new Event("vaani:session-expired"));
    const err=new Error((data&&data.error)||"Something went wrong ("+res.status+").");err.status=res.status;throw err;
  }
  return data;
}
const KEY = "vaaniai_speech_attempts_v1";
const soundSets = {
  Hindi: [
    {value:"क",letter:"क",name:"क · ka",description:"A gentle practice example for the /k/ sound.",words:["कमल","कल","किताब"],say:"क"},
    {value:"म",letter:"म",name:"म · ma",description:"Try a comfortable /m/ sound with these words.",words:["माला","मछली","मकान"],say:"म"},
    {value:"स",letter:"स",name:"स · sa",description:"Listen and practise the /s/ sound at your own pace.",words:["सूरज","समय","सड़क"],say:"स"},
    {value:"र",letter:"र",name:"र · ra",description:"Practise this sound slowly; ask a clinician for guidance if needed.",words:["रथ","रंग","रास्ता"],say:"र"},
    {value:"प",letter:"प",name:"प · pa",description:"Try a light /p/ sound, without forcing your voice.",words:["पतंग","पानी","पत्ता"],say:"प"}
  ],
  English: [
    {value:"k",letter:"K",name:"/k/ · key",description:"A simple example for practising the /k/ sound.",words:["key","kite","cup"],say:"K"},
    {value:"s",letter:"S",name:"/s/ · sun",description:"Listen and practise the /s/ sound at a comfortable pace.",words:["sun","sit","soap"],say:"S"},
    {value:"m",letter:"M",name:"/m/ · moon",description:"Try a gentle /m/ sound with these example words.",words:["moon","map","milk"],say:"M"},
    {value:"r",letter:"R",name:"/r/ · red",description:"Practise the /r/ sound slowly and comfortably.",words:["red","rain","road"],say:"R"},
    {value:"p",letter:"P",name:"/p/ · pen",description:"Try a light /p/ sound without straining.",words:["pen","pig","park"],say:"P"}
  ]
};
const topicTips = {
  listening:{title:"Listen before speaking",items:["Play the example and listen once without repeating.", "Notice how the sound begins and ends.", "Repeat only when you feel ready; take a break if needed."]},
  speaking:{title:"Practise without pressure",items:["Try one word at a time.", "A difficult attempt is not a failure—pause and try later.", "Use the target and method recommended by your clinician."]},
  caregiver:{title:"Encourage communication",items:["Listen patiently and allow time to respond.", "Praise effort and participation rather than demanding perfection.", "Ask what kind of help the child finds comfortable."]},
  clinician:{title:"Professional guidance",items:["Select practice targets based on an individual assessment.", "Use saved notes as practice reflections, not diagnostic scores.", "Review any concerns with the family and a qualified professional."]}
};
let recorder = null, recordingStream = null, recordingChunks = [], recordingBlob = null, timerInterval = null, elapsed = 0, toastTimer = null;
const $ = id => document.getElementById(id);

// ---- Motion helpers (see animations.css) ----
const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Restart a one-shot CSS animation by toggling its class.
function replay(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls)}
// Count a number up from 0 (or just set it when motion is reduced).
function countTo(el,to){
  cancelAnimationFrame(el._raf);
  if(!to||prefersReduced()){el.textContent=to;return}
  const start=performance.now(),dur=650;
  const step=now=>{
    const t=Math.min(1,(now-start)/dur);
    el.textContent=Math.round(to*(1-Math.pow(1-t,3)));
    if(t<1)el._raf=requestAnimationFrame(step);else replay(el,"bump");
  };
  el._raf=requestAnimationFrame(step);
}
// Little shower of sparks from an element (used when an attempt is saved).
function burst(el){
  if(prefersReduced()||!el)return;
  const r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  const glyphs=["✦","✧","●","♫"],colors=["#2ed3bd","#ffe2ba","#ded5ff","#d6eaff"],n=14;
  for(let i=0;i<n;i++){
    const s=document.createElement("span"),ang=(i/n)*Math.PI*2+Math.random()*.4,dist=60+Math.random()*70;
    s.className="spark";s.textContent=glyphs[i%glyphs.length];s.style.color=colors[i%colors.length];
    s.style.setProperty("--x",cx+"px");s.style.setProperty("--y",cy+"px");
    s.style.setProperty("--dx",Math.cos(ang)*dist+"px");s.style.setProperty("--dy",Math.sin(ang)*dist+"px");
    s.style.setProperty("--rot",(Math.random()*360-180)+"deg");
    document.body.appendChild(s);s.addEventListener("animationend",()=>s.remove());
  }
}
// Live microphone level -> recording bars + mic pulse.
let audioCtx=null, meterRaf=null;
function startMeter(stream){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    audioCtx=new AC();audioCtx.resume?.();
    const analyser=audioCtx.createAnalyser();analyser.fftSize=64;analyser.smoothingTimeConstant=.75;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const data=new Uint8Array(analyser.frequencyBinCount),bars=[...document.querySelectorAll("#recordVisual .visual-bars i")],visual=$("recordVisual");
    visual.classList.add("live");
    const tick=()=>{
      analyser.getByteFrequencyData(data);let sum=0;
      bars.forEach((b,i)=>{const v=data[Math.min(data.length-1,Math.floor(i*data.length/bars.length/1.6))]/255;sum+=v;b.style.height=(6+v*34)+"px"});
      visual.style.setProperty("--level",(sum/bars.length).toFixed(3));
      meterRaf=requestAnimationFrame(tick);
    };
    tick();
  }catch{$("recordVisual").classList.remove("live")}
}
function stopMeter(){
  cancelAnimationFrame(meterRaf);meterRaf=null;
  if(audioCtx){try{audioCtx.close()}catch{}audioCtx=null}
  const v=$("recordVisual");v.classList.remove("live");v.style.removeProperty("--level");
  v.querySelectorAll(".visual-bars i").forEach(b=>b.style.height="");
}

let attemptsCache=null;
function getAttempts(){if(attemptsCache===null){try{attemptsCache=JSON.parse(localStorage.getItem(KEY)||"[]")}catch{attemptsCache=[]}}return attemptsCache}
function setAttempts(items){attemptsCache=items;if(!authToken())localStorage.setItem(KEY,JSON.stringify(items))}
function fromServer(a){return{id:a.id,date:new Date(a.created_at).toLocaleString(),language:a.language,sound:a.sound,words:a.words,feeling:a.feeling,note:a.note||"",duration:a.has_audio?formatTime(a.duration_seconds||0):"No audio"}}
async function loadAttempts(){
  if(!authToken()){attemptsCache=null;updateHome();return}
  try{attemptsCache=(await api("/attempts")).map(fromServer)}catch(err){if(err.status!==401)notify(err.message)}
  updateHome();if($("progress").classList.contains("active"))renderProgress();
}
function notify(message){const t=$("toast");t.textContent=message;t.classList.remove("show");void t.offsetWidth;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2800)}
function escapeHTML(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function goTab(name){document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("active",s.id===name));document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));const titles={home:"Welcome to VaaniAI",practice:"Speech practice",progress:"My progress",learn:"Learn & support"};$("pageTitle").textContent=titles[name]||"VaaniAI";replay($("pageTitle"),"swap");$("sidebar").classList.remove("open");if(name==="progress")renderProgress();if(name==="home")updateHome();window.scrollTo({top:0,behavior:"smooth"})}
document.querySelectorAll(".nav").forEach(b=>b.addEventListener("click",()=>goTab(b.dataset.tab)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>goTab(b.dataset.go)));
$("menuButton").addEventListener("click",()=>$("sidebar").classList.toggle("open"));

function fillSounds(){
  const lang=$("languageSelect").value, select=$("soundSelect"), old=select.value;
  select.innerHTML=soundSets[lang].map(s=>`<option value="${escapeHTML(s.value)}">${escapeHTML(s.name)}</option>`).join("");
  if(soundSets[lang].some(s=>s.value===old))select.value=old;
  updateSound();
}
function currentSound(){return soundSets[$("languageSelect").value].find(s=>s.value===$("soundSelect").value)||soundSets[$("languageSelect").value][0]}
function updateSound(){
  const s=currentSound();$("soundLetter").textContent=s.letter;$("soundName").textContent=s.name;$("soundDescription").textContent=s.description;
  replay($("soundLetter"),"swap");replay(document.querySelector(".sound-card"),"swap");
  $("wordChips").innerHTML=s.words.map((w,i)=>`<button type="button" class="word-chip" style="--i:${i}" data-word="${escapeHTML(w)}">${escapeHTML(w)}</button>`).join("");
  $("wordChips").querySelectorAll("[data-word]").forEach(b=>b.addEventListener("click",()=>speak(b.dataset.word,b)));
  $("homeLanguage").textContent=$("languageSelect").value;
  $("homeFocus").textContent=s.name;
}
let speakId=0;
function speak(text,el){
  if(!("speechSynthesis" in window)){notify("Text-to-speech is not available in this browser.");return}
  window.speechSynthesis.cancel();
  document.querySelectorAll(".is-speaking").forEach(n=>n.classList.remove("is-speaking"));
  const id=++speakId,done=()=>{if(id===speakId&&el)el.classList.remove("is-speaking")};
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang=$("languageSelect").value==="Hindi"?"hi-IN":"en-IN";utterance.rate=.72;
  utterance.onend=done;utterance.onerror=done;
  if(el){el.classList.add("is-speaking");setTimeout(done,6000)}
  window.speechSynthesis.speak(utterance);
}
$("languageSelect").addEventListener("change",fillSounds);$("soundSelect").addEventListener("change",updateSound);
$("listenButton").addEventListener("click",()=>speak(currentSound().words[0],$("listenButton")));

function stopTimer(){clearInterval(timerInterval);timerInterval=null}
function formatTime(s){return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`}
async function startRecording(){
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){notify("Recording is not supported here. Try HTTPS or localhost in a modern browser.");return}
  try{
    recordingStream=await navigator.mediaDevices.getUserMedia({audio:true});recordingChunks=[];recordingBlob=null;
    recorder=new MediaRecorder(recordingStream);startMeter(recordingStream);
    recorder.ondataavailable=e=>{if(e.data.size)recordingChunks.push(e.data)};
    recorder.onstop=()=>{
      recordingBlob=new Blob(recordingChunks,{type:recorder.mimeType||"audio/webm"});
      $("audioPlayback").src=URL.createObjectURL(recordingBlob);$("audioPlayback").hidden=false;
      recordingStream?.getTracks().forEach(t=>t.stop());recordingStream=null;
      stopMeter();$("recordButton").classList.remove("is-recording");
      $("recordVisual").classList.remove("recording");$("recordVisualText").textContent="Recording ready to review";replay($("recordVisualText"),"pop");
      $("recordStatus").textContent="Listen to your attempt, then save it with your reflection.";
      $("recordButton").textContent="● Record again";stopTimer();
    };
    recorder.start();elapsed=0;$("recordTimer").textContent="00:00";$("audioPlayback").hidden=true;
    $("recordVisual").classList.add("recording");$("recordVisualText").textContent="Recording… speak comfortably";
    $("recordStatus").textContent="Recording locally. Select Stop recording when finished.";
    $("recordButton").textContent="■ Stop recording";$("recordButton").classList.add("is-recording");replay($("recordVisualText"),"pop");
    timerInterval=setInterval(()=>{$("recordTimer").textContent=formatTime(++elapsed)},1000);
  }catch(err){notify(err.name==="NotAllowedError"?"Microphone permission was denied. Allow microphone access and try again.":"Could not start the microphone. Check browser permissions.");}
}
$("recordButton").addEventListener("click",()=>{
  if(recorder&&recorder.state==="recording"){recorder.stop();return}
  startRecording();
});
$("saveAttempt").addEventListener("click",async()=>{
  if(recorder&&recorder.state==="recording"){notify("Stop the recording before saving.");return}
  const s=currentSound(),button=$("saveAttempt");
  if(authToken()){
    const fd=new FormData();
    fd.append("language",$("languageSelect").value);fd.append("sound",s.name);fd.append("words",s.words.join(", "));
    fd.append("feeling",$("feelingSelect").value);fd.append("note",$("attemptNote").value.trim());fd.append("duration_seconds",String(recordingBlob?elapsed:0));
    if(recordingBlob)fd.append("audio",recordingBlob,"attempt");
    button.disabled=true;
    try{const saved=await api("/attempts",{method:"POST",body:fd});getAttempts().unshift(fromServer(saved))}
    catch(err){notify(err.message);button.disabled=false;return}
    button.disabled=false;
  }else{
    const attempt={id:(crypto.randomUUID?crypto.randomUUID():String(Date.now())),date:new Date().toLocaleString(),language:$("languageSelect").value,sound:s.name,words:s.words.join(", "),feeling:$("feelingSelect").value,note:$("attemptNote").value.trim(),duration:recordingBlob?formatTime(elapsed):"No audio"};
    const all=getAttempts();all.unshift(attempt);setAttempts(all);
  }
  $("attemptNote").value="";recordingBlob=null;$("audioPlayback").removeAttribute("src");$("audioPlayback").hidden=true;$("recordTimer").textContent="00:00";elapsed=0;
  updateHome();notify(authToken()?"Practice attempt saved to your account.":"Practice attempt saved on this device.");burst($("saveAttempt"));goTab("progress");
});
function updateHome(){const a=getAttempts();countTo($("attemptCount"),a.length);$("homeLanguage").textContent=a[0]?.language||$("languageSelect").value;$("homeFocus").textContent=a[0]?.sound||currentSound().name}
function renderProgress(){
  const a=getAttempts();countTo($("progressTotal"),a.length);countTo($("attemptCount"),a.length);
  countTo($("languageTotal"),new Set(a.map(x=>x.language)).size);
  const counts={};a.forEach(x=>counts[x.sound]=(counts[x.sound]||0)+1);
  $("mostPracticed").textContent=Object.keys(counts).sort((x,y)=>counts[y]-counts[x])[0]||"—";replay($("mostPracticed"),"bump");
  $("attemptHistory").innerHTML=a.length?a.map((x,i)=>`<article class="attempt-row" style="--i:${Math.min(i,8)}"><div><h4>${escapeHTML(x.sound)} · ${escapeHTML(x.language)}</h4><p>${escapeHTML(x.date)} · ${escapeHTML(x.duration)}</p><p>Feeling: ${escapeHTML(x.feeling)}${x.note?" · "+escapeHTML(x.note):""}</p><p>Words: ${escapeHTML(x.words)}</p></div><div class="attempt-tag">${escapeHTML(x.feeling)}</div></article>`).join(""):`<div class="empty">No attempts saved yet.<br>Go to Speech practice to record and save your first attempt.</div>`;
}
$("exportButton").addEventListener("click",()=>{
  const a=getAttempts();if(!a.length){notify("No saved attempts to export yet.");return}
  const headers=["Date","Language","Sound","Words","Feeling","Duration","Note"];
  const rows=a.map(x=>[x.date,x.language,x.sound,x.words,x.feeling,x.duration,x.note]);
  const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="vaaniai-practice-history.csv";link.click();URL.revokeObjectURL(url);notify("Practice history exported.");
});
const shade=$("modalShade");
function openTopic(key){const t=topicTips[key];if(!t)return;$("modalTitle").textContent=t.title;$("modalContent").innerHTML=`<ul>${t.items.map(x=>`<li>${escapeHTML(x)}</li>`).join("")}</ul>`;shade.hidden=false}
document.querySelectorAll("[data-topic]").forEach(b=>b.addEventListener("click",()=>openTopic(b.dataset.topic)));
function closeModal(){shade.hidden=true}
$("modalX").addEventListener("click",closeModal);$("modalOkay").addEventListener("click",closeModal);shade.addEventListener("click",e=>{if(e.target===shade)closeModal()});document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
function profilePrompt(){if(authToken()){notify("Your name and role are set by your account.");return}const name=prompt("Enter a display name for this local demo:",$("userName").textContent);if(name===null)return;const cleaned=name.trim().slice(0,35)||"Guest";$("userName").textContent=cleaned;$("chipName").textContent=cleaned;$("userAvatar").textContent=cleaned.charAt(0).toUpperCase();$("chipInitial").textContent=cleaned.charAt(0).toUpperCase();localStorage.setItem("vaaniai_demo_user",cleaned);const role=prompt("Choose demo role: Client, Clinician, or Administrator","Client");if(role){$("roleLabel").textContent=role+" workspace";notify("Demo profile updated. Backend role permissions are not connected.");}}
$("profileBtn").addEventListener("click",profilePrompt);$("userChip").addEventListener("click",profilePrompt);
const savedName=localStorage.getItem("vaaniai_demo_user")||"Yuval";$("userName").textContent=savedName;$("chipName").textContent=savedName;$("userAvatar").textContent=savedName.charAt(0).toUpperCase();$("chipInitial").textContent=savedName.charAt(0).toUpperCase();
$("today").textContent=new Date().toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
fillSounds();updateHome();

// ---- Motion wiring ----
// Ripple on every button click.
document.addEventListener("click",e=>{
  const b=e.target.closest?.(".button");if(!b||prefersReduced())return;
  const r=b.getBoundingClientRect(),size=Math.max(r.width,r.height)*2,dot=document.createElement("span");
  const x=e.detail?e.clientX-r.left:r.width/2,y=e.detail?e.clientY-r.top:r.height/2;
  dot.className="ripple";dot.style.cssText=`width:${size}px;height:${size}px;left:${x-size/2}px;top:${y-size/2}px`;
  b.appendChild(dot);dot.addEventListener("animationend",()=>dot.remove());
});
// Soft spotlight that follows the pointer across cards.
document.addEventListener("pointermove",e=>{
  const c=e.target.closest?.(".panel,.metric,.progress-card,.resource-card");if(!c)return;
  const r=c.getBoundingClientRect();c.style.setProperty("--mx",(e.clientX-r.left)+"px");c.style.setProperty("--my",(e.clientY-r.top)+"px");
},{passive:true});
// Hero orb cycles through Hindi and English practice letters.
const orbLetter=$("orbLetter"),orbChars=["आ","क","म","स","र","प","K","S","M","R","P"];let orbIdx=0;
setInterval(()=>{
  if(prefersReduced()||document.hidden)return;
  orbIdx=(orbIdx+1)%orbChars.length;orbLetter.classList.add("out");
  setTimeout(()=>{orbLetter.textContent=orbChars[orbIdx];orbLetter.classList.remove("out")},300);
},3200);

// BACKEND CONNECTION TODO:
// This is a frontend prototype. It stores practice metadata in localStorage.
// It does not yet call Flask, SQLAlchemy, JWT endpoints, Amazon S3, or an LLM.
// Once the real API routes are confirmed, replace getAttempts/setAttempts with authenticated fetch() requests.
// Audio is recorded in the browser only and is not uploaded to a server.

// ===== Login / account =====
// Signed-in users talk to the Flask API. "Continue as guest" works without a server and keeps data in this browser only.
(function(){
  "use strict";

  var USER_KEY = "vaaniai_demo_user";
  var ROLE_KEY = "vaaniai_demo_role";
  var AUTH_KEY = "vaaniai_demo_signed_in";
  var root = document.documentElement;
  var mode = "login";

  function safe(fn){ try{ return fn() }catch(e){ return null } }
  function cap(role){ return role ? role.charAt(0).toUpperCase() + role.slice(1) : role }

  function applyUser(name, role){
    var n = name || "Guest";
    $("userName").textContent = n;
    $("chipName").textContent = n;
    $("userAvatar").textContent = n.charAt(0).toUpperCase();
    $("chipInitial").textContent = n.charAt(0).toUpperCase();
    if(role) $("roleLabel").textContent = cap(role) + " workspace";
  }

  function setMode(next){
    mode = next;
    var reg = next === "register";
    $("tabLogin").setAttribute("aria-selected", String(!reg));
    $("tabRegister").setAttribute("aria-selected", String(reg));
    $("nameField").hidden = !reg;
    $("roleField").hidden = !reg;
    $("formTitle").textContent = reg ? "Create your account" : "Sign in";
    $("formSub").textContent = reg ? "Set up a profile to save your practice attempts." : "Use your VaaniAI account to open your practice space.";
    $("submitBtn").innerHTML = (reg ? "Create account" : "Sign in") + " <span>→</span>";
    $("password").setAttribute("autocomplete", reg ? "new-password" : "current-password");
    clearErrors();
  }

  function clearErrors(){
    ["nameError","emailError","passwordError","formError"].forEach(function(id){ $(id).textContent = "" });
    ["fullName","email","password"].forEach(function(id){ $(id).removeAttribute("aria-invalid") });
  }

  function fail(inputId, errId, msg){
    $(errId).textContent = msg;
    $(inputId).setAttribute("aria-invalid", "true");
  }

  function validate(){
    clearErrors();
    var ok = true;
    var name = $("fullName").value.trim();
    var email = $("email").value.trim();
    var pw = $("password").value;
    if(mode === "register" && !name){ fail("fullName","nameError","Enter your name."); ok = false; }
    if(!email){ fail("email","emailError","Enter your email address."); ok = false; }
    else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ fail("email","emailError","Enter a valid email, like name@example.com."); ok = false; }
    if(pw.length < 8){ fail("password","passwordError","Use at least 8 characters."); ok = false; }
    return ok;
  }

  function showSignedIn(displayName, role){
    applyUser(displayName, role);
    $("loginForm").reset();
    setMode("login");
    root.classList.remove("logged-out");
    goTab("home");
    loadAttempts();
    notify("Welcome, " + displayName + ".");
  }

  // Server account: keep the token (localStorage if "keep me signed in", else this tab only).
  function signInAccount(data){
    var store = $("remember").checked ? localStorage : sessionStorage;
    safe(function(){ localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY) });
    safe(function(){ store.setItem(TOKEN_KEY, data.access_token); store.setItem(AUTH_KEY, "1") });
    safe(function(){ localStorage.setItem(USER_KEY, data.user.name); localStorage.setItem(ROLE_KEY, data.user.role) });
    showSignedIn(data.user.name, data.user.role);
  }

  // Guest: no server, no token.
  function signInGuest(){
    safe(function(){ localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY) });
    safe(function(){ localStorage.setItem(USER_KEY, "Guest"); localStorage.setItem(ROLE_KEY, "client"); sessionStorage.setItem(AUTH_KEY, "1") });
    attemptsCache = null;
    showSignedIn("Guest", "client");
  }

  function signOut(message){
    if(authToken()){ api("/logout", {method:"POST"}).catch(function(){}) }   // revoke the token on the server (best effort)
    safe(function(){ localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY) });
    safe(function(){ localStorage.removeItem(AUTH_KEY); sessionStorage.removeItem(AUTH_KEY) });
    attemptsCache = null;
    $("sidebar").classList.remove("open");
    root.classList.add("logged-out");
    window.scrollTo(0, 0);
    notify(message || "You have been logged out.");
  }

  $("tabLogin").addEventListener("click", function(){ setMode("login") });
  $("tabRegister").addEventListener("click", function(){ setMode("register") });

  $("pwToggle").addEventListener("click", function(){
    var input = $("password");
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    this.textContent = show ? "Hide" : "Show";
    this.setAttribute("aria-pressed", String(show));
    this.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });

  $("forgotBtn").addEventListener("click", function(){
    notify("Password reset is not available yet. Ask your administrator to help.");
  });

  $("guestBtn").addEventListener("click", signInGuest);

  $("loginForm").addEventListener("submit", async function(e){
    e.preventDefault();
    if(!validate()) return;
    var btn = $("submitBtn"), label = btn.innerHTML;
    var body = {email: $("email").value.trim(), password: $("password").value};
    if(mode === "register"){ body.name = $("fullName").value.trim(); body.role = $("role").value.toLowerCase(); }
    btn.disabled = true; btn.textContent = mode === "register" ? "Creating account…" : "Signing in…";
    try{
      var data = await api(mode === "register" ? "/register" : "/login", {method:"POST", json:body, auth:false});
      signInAccount(data);
    }catch(err){
      $("formError").textContent = err.message;
    }finally{
      btn.disabled = false; btn.innerHTML = label;
    }
  });

  $("logoutBtn").addEventListener("click", function(){ signOut(); });
  document.addEventListener("vaani:session-expired", function(){ if(!root.classList.contains("logged-out")) signOut("Your session expired. Please sign in again."); });

  // Opening the app while still signed in: confirm the session and load saved attempts.
  if(authToken()){
    api("/me").then(function(u){ applyUser(u.name, u.role); safe(function(){ localStorage.setItem(ROLE_KEY, u.role) }); loadAttempts(); }).catch(function(){});
  }else{
    var savedRole = safe(function(){ return localStorage.getItem(ROLE_KEY) });
    if(savedRole && !root.classList.contains("logged-out")) $("roleLabel").textContent = cap(savedRole) + " workspace";
  }

  // Login orb letter cycles quietly (off when reduced motion is on).
  var letters = ["आ","क","स","म","a","s"], li = 0, loginOrb = $("loginOrbLetter");
  setInterval(function(){
    if(prefersReduced() || document.hidden || !root.classList.contains("logged-out")) return;
    loginOrb.classList.add("out");
    setTimeout(function(){ li = (li + 1) % letters.length; loginOrb.textContent = letters[li]; loginOrb.classList.remove("out") }, 350);
  }, 3200);
})();
