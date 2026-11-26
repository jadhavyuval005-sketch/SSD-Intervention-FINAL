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

function getAttempts(){try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch{return []}}
function setAttempts(items){localStorage.setItem(KEY,JSON.stringify(items))}
function notify(message){const t=$("toast");t.textContent=message;t.classList.remove("show");void t.offsetWidth;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2800)}
function escapeHTML(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function goTab(name){document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("active",s.id===name));document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));const titles={home:"Welcome to VaaniAI",practice:"Speech practice",progress:"My progress",learn:"Learn & support",twisters:"Tongue twisters"};$("pageTitle").textContent=titles[name]||"VaaniAI";replay($("pageTitle"),"swap");$("sidebar").classList.remove("open");closeProfileMenu();if("speechSynthesis" in window)window.speechSynthesis.cancel();if(name==="progress")renderProgress();if(name==="home")updateHome();window.scrollTo({top:0,behavior:"smooth"})}
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
$("saveAttempt").addEventListener("click",()=>{
  if(recorder&&recorder.state==="recording"){notify("Stop the recording before saving.");return}
  const s=currentSound();
  const attempt={id:(crypto.randomUUID?crypto.randomUUID():String(Date.now())),date:new Date().toLocaleString(),language:$("languageSelect").value,sound:s.name,words:s.words.join(", "),feeling:$("feelingSelect").value,note:$("attemptNote").value.trim(),duration:recordingBlob?formatTime(elapsed):"No audio"};
  const all=getAttempts();all.unshift(attempt);setAttempts(all);
  $("attemptNote").value="";recordingBlob=null;$("audioPlayback").removeAttribute("src");$("audioPlayback").hidden=true;$("recordTimer").textContent="00:00";elapsed=0;
  updateHome();notify("Practice attempt saved on this device.");burst($("saveAttempt"));goTab("progress");
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
function profilePrompt(){const name=prompt("Enter a display name for this local demo:",$("userName").textContent);if(name===null)return;const cleaned=name.trim().slice(0,35)||"Guest";$("userName").textContent=cleaned;$("chipName").textContent=cleaned;$("userAvatar").textContent=cleaned.charAt(0).toUpperCase();$("chipInitial").textContent=cleaned.charAt(0).toUpperCase();localStorage.setItem("vaaniai_demo_user",cleaned);const role=prompt("Choose demo role: Client, Clinician, or Administrator","Client");if(role){$("roleLabel").textContent=role+" workspace";notify("Demo profile updated. Backend role permissions are not connected.");}}
$("profileBtn").addEventListener("click",profilePrompt);
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

// ===== Login (merged from login.js) =====
// Demo sign-in only: nothing is verified or sent to a server.
(function(){
  "use strict";

  // Set API_BASE to your Flask URL (e.g. "http://localhost:5000/api") and replace the
  // commented fetch() below with your backend's real routes, field names and JWT handling.
  var API_BASE = "";
  var USER_KEY = "vaaniai_demo_user";   // same key the profile prompt above uses
  var ROLE_KEY = "vaaniai_demo_role";
  var AUTH_KEY = "vaaniai_demo_signed_in";
  var root = document.documentElement;
  var mode = "login";

  function safe(fn){ try{ return fn() }catch(e){ return null } }

  function applyUser(name, role){
    var n = name || "Guest";
    $("userName").textContent = n;
    $("chipName").textContent = n;
    $("userAvatar").textContent = n.charAt(0).toUpperCase();
    $("chipInitial").textContent = n.charAt(0).toUpperCase();
    if(role) $("roleLabel").textContent = role + " workspace";
  }

  function setMode(next){
    mode = next;
    var reg = next === "register";
    $("tabLogin").setAttribute("aria-selected", String(!reg));
    $("tabRegister").setAttribute("aria-selected", String(reg));
    $("nameField").hidden = !reg;
    $("formTitle").textContent = reg ? "Create your account" : "Sign in";
    $("formSub").textContent = reg ? "Set up a profile to save your practice attempts." : "Use your VaaniAI account to open your practice space.";
    $("submitBtn").innerHTML = (reg ? "Create account" : "Sign in") + " <span>→</span>";
    $("password").setAttribute("autocomplete", reg ? "new-password" : "current-password");
    clearErrors();
  }

  function clearErrors(){
    ["nameError","emailError","passwordError"].forEach(function(id){ $(id).textContent = "" });
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
    if(pw.length < 6){ fail("password","passwordError","Use at least 6 characters."); ok = false; }
    return ok;
  }

  function nameFromEmail(email){
    var base = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    return base ? base.replace(/\b\w/g, function(c){ return c.toUpperCase() }).slice(0,35) : "Guest";
  }

  function signIn(displayName, role){
    var store = $("remember").checked ? localStorage : sessionStorage;
    safe(function(){ localStorage.setItem(USER_KEY, displayName) });
    safe(function(){ localStorage.setItem(ROLE_KEY, role) });
    safe(function(){ store.setItem(AUTH_KEY, "1") });
    applyUser(displayName, role);
    $("loginForm").reset();
    setMode("login");
    root.classList.remove("logged-out");
    goTab("home");
    window.scrollTo(0, 0);
    notify("Welcome, " + displayName + ".");
  }

  function signOut(){
    safe(function(){ localStorage.removeItem(AUTH_KEY) });
    safe(function(){ sessionStorage.removeItem(AUTH_KEY) });
    $("sidebar").classList.remove("open");
    root.classList.add("logged-out");
    window.scrollTo(0, 0);
    notify("You have been logged out.");
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
    notify("Password reset needs the backend. Not connected in this demo.");
  });

  $("guestBtn").addEventListener("click", function(){ signIn("Guest", $("role").value) });

  $("loginForm").addEventListener("submit", function(e){
    e.preventDefault();
    if(!validate()) return;
    var email = $("email").value.trim();
    var role = $("role").value;
    var name = mode === "register" ? $("fullName").value.trim() : nameFromEmail(email);
    if(API_BASE){
      /* fetch(API_BASE + (mode === "register" ? "/register" : "/login"), {
           method: "POST",
           headers: {"Content-Type":"application/json"},
           body: JSON.stringify({ email: email, password: $("password").value, name: name, role: role })
         }).then(r => r.json()).then(data => { store data.access_token; signIn(name, role); }); */
      notify("API_BASE is set but the request code is not written yet.");
      return;
    }
    signIn(name, role);
  });

  $("logoutBtn").addEventListener("click", signOut);

  // Restore the saved role label when the app opens already signed in.
  var savedRole = safe(function(){ return localStorage.getItem(ROLE_KEY) });
  if(savedRole) $("roleLabel").textContent = savedRole + " workspace";

  // Login orb letter cycles quietly (off when reduced motion is on).
  var letters = ["आ","क","स","म","a","s"], li = 0, loginOrb = $("loginOrbLetter");
  setInterval(function(){
    if(prefersReduced() || document.hidden || !root.classList.contains("logged-out")) return;
    loginOrb.classList.add("out");
    setTimeout(function(){ li = (li + 1) % letters.length; loginOrb.textContent = letters[li]; loginOrb.classList.remove("out") }, 350);
  }, 3200);
})();


// ===== Profile dropdown =====
function closeProfileMenu(){
  const m=$("profileMenu"),c=$("userChip");
  if(!m||m.hidden)return;
  m.hidden=true;c.setAttribute("aria-expanded","false");
}
function openProfileMenu(){
  $("pmName").textContent=$("userName").textContent;
  $("pmRole").textContent=$("roleLabel").textContent;
  $("pmAvatar").textContent=$("userAvatar").textContent;
  $("profileMenu").hidden=false;$("userChip").setAttribute("aria-expanded","true");
  $("profileMenu").querySelector(".pm-item")?.focus();
}
$("userChip").addEventListener("click",e=>{e.stopPropagation();$("profileMenu").hidden?openProfileMenu():closeProfileMenu()});
document.addEventListener("click",e=>{if(!e.target.closest?.(".profile-wrap"))closeProfileMenu()});
document.addEventListener("keydown",e=>{
  const m=$("profileMenu");if(m.hidden)return;
  if(e.key==="Escape"){closeProfileMenu();$("userChip").focus();return}
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    e.preventDefault();
    const items=[...m.querySelectorAll(".pm-item")],i=items.indexOf(document.activeElement);
    items[(i+(e.key==="ArrowDown"?1:-1)+items.length)%items.length].focus();
  }
});
$("pmEdit").addEventListener("click",()=>{closeProfileMenu();profilePrompt()});
$("pmLogout").addEventListener("click",()=>{closeProfileMenu();$("logoutBtn").click()});
document.querySelectorAll("#profileMenu [data-go]").forEach(b=>b.addEventListener("click",closeProfileMenu));

// ===== Tongue twisters + mouth guide =====
// Each tongue shape is 28 numbers (same template for every sound) so the tongue can glide smoothly between them.
// Layout: tipBottom(2) tipFront(2) | curve1: c1 c2 end | curve2: c1 c2 end | curve3: c1 c2 end | rootBottom(2) | curve4: c1 c2
const TONGUE={
  rest:   [188,134, 186,122, 178,116,160,110,140,111, 122,112,110,116,100,122,  80,132,66,150,58,172, 58,176, 108,180,160,166],
  velar:  [188,134, 186,124, 170,124,150,126,132,122, 112,116,100,90,88,60,     74,62,64,86,58,112,   58,176, 108,180,160,166],
  retro:  [188,134, 176,112, 176,98,170,72,146,60,    136,62,128,74,130,92,      122,112,70,138,58,172, 58,176, 108,180,160,166],
  dental: [188,134, 184,106, 186,100,186,94,182,92,   160,98,132,112,106,120,    82,130,66,150,58,172,  58,176, 108,180,160,166],
  groove: [188,134, 184,100, 180,92,172,90,160,96,    142,106,118,112,100,122,   80,132,66,150,58,172,  58,176, 108,180,160,166],
  sh:     [188,134, 178,108, 176,96,168,86,156,84,    138,86,122,106,102,118,    82,130,66,150,58,172,  58,176, 108,180,160,166],
  palatal:[188,134, 180,112, 178,98,168,78,152,62,    140,64,126,88,112,112,     88,126,66,148,58,172,  58,176, 108,180,160,166],
  lateral:[188,134, 180,100, 178,88,174,78,171,71,    162,92,152,114,130,114,    102,114,74,138,58,172, 58,176, 108,180,160,166],
  curl:   [188,134, 176,114, 176,104,166,84,150,80,   138,78,128,92,124,106,     110,122,72,140,58,172, 58,176, 108,180,160,166],
  th:     [188,134, 192,114, 200,108,201,100,186,100, 164,104,134,112,104,122,   80,132,66,150,58,172,  58,176, 108,180,160,166]
};
const SOUNDS=[
  {id:"k",chip:"क ग · k g",tongue:"velar",lips:{u:84,l:118,s:0},dot:[86,58],air:null,
   kicker:"BACK OF THE TONGUE",title:"क ग · k g",
   steps:["Rest the tip of your tongue low, behind your bottom front teeth.","Lift the back of your tongue up to touch the soft roof of your mouth.","Let it drop quickly. For क and k, add a small puff of air."],
   tip:"Try a tiny “kuh” and notice the back of your tongue rising and falling.",say:[{t:"कमल",l:"hi-IN"},{t:"key",l:"en-IN"}]},
  {id:"retro",chip:"ट ड",tongue:"retro",lips:{u:84,l:118,s:0},dot:[146,55],air:null,
   kicker:"CURLED TIP · HINDI",title:"ट ड (retroflex)",
   steps:["Curl the tip of your tongue up and slightly back.","Touch the hard roof of your mouth with the underside of the tip.","Flick it forward as you let the sound out."],
   tip:"Hindi ट ड use this curled position. English t and d sit further forward, on the ridge.",say:[{t:"टमाटर",l:"hi-IN"},{t:"डमरू",l:"hi-IN"}]},
  {id:"dental",chip:"त द",tongue:"dental",lips:{u:84,l:118,s:0},dot:[187,92],air:null,
   kicker:"TIP ON THE TEETH · HINDI",title:"त द (dental)",
   steps:["Keep your tongue flat and relaxed.","Press the tip lightly against the back of your upper front teeth.","Release with a quick, soft tap."],
   tip:"For थ ध, let a little breath out as you release.",say:[{t:"तारा",l:"hi-IN"},{t:"दादा",l:"hi-IN"}]},
  {id:"s",chip:"स · s",tongue:"groove",lips:{u:86,l:114,s:0},dot:null,air:"M150,86 C172,84 188,96 214,101",
   kicker:"A NARROW GAP",title:"स · s",
   steps:["Raise the front of your tongue close to the ridge behind your top teeth, without touching it.","Keep a narrow groove down the middle and your teeth almost together.","Push air gently through, like a quiet hiss."],
   tip:"If it sounds like “th”, pull the tongue tip back a little from the teeth.",say:[{t:"सूरज",l:"hi-IN"},{t:"sun",l:"en-IN"}]},
  {id:"sh",chip:"श · sh",tongue:"sh",lips:{u:90,l:112,s:6},dot:null,air:"M138,74 C170,76 192,96 216,101",
   kicker:"PULLED BACK + ROUND LIPS",title:"श · sh",
   steps:["Pull your tongue back a little and lift the front toward the roof of your mouth.","Round your lips so they come slightly forward.","Let air flow in a soft, wide “shhh”."],
   tip:"Compare s and sh: for sh the tongue is further back and the lips are rounder.",say:[{t:"शेर",l:"hi-IN"},{t:"shell",l:"en-IN"}]},
  {id:"ch",chip:"च · ch",tongue:"palatal",lips:{u:88,l:112,s:4},dot:[150,58],air:null,
   kicker:"FRONT OF TONGUE TO THE ROOF",title:"च · ch",
   steps:["Lift the front of your tongue to touch the hard roof of your mouth.","Hold for a moment, then release with a small burst of air.","Think of a quick “t” sliding into “sh”."],
   tip:"Hindi च is soft. English “ch” in chair is a little stronger.",say:[{t:"चाचा",l:"hi-IN"},{t:"chair",l:"en-IN"}]},
  {id:"l",chip:"ल · l",tongue:"lateral",lips:{u:84,l:118,s:0},dot:[171,72],air:null,
   kicker:"TIP ON THE RIDGE",title:"ल · l",
   steps:["Touch the tip of your tongue to the ridge behind your top teeth.","Let the sides of your tongue drop so air flows around them.","Keep your voice on; l is a smooth, humming sound."],
   tip:"Hold the tip still and say “la la la”. Only the tip should touch.",say:[{t:"लड्डू",l:"hi-IN"},{t:"lorry",l:"en-IN"}]},
  {id:"r",chip:"र · r",tongue:"curl",lips:{u:88,l:112,s:4},dot:null,air:null,
   kicker:"TIP UP, NOT TOUCHING",title:"र · r",
   steps:["English r: pull your tongue back, tip pointing up but touching nothing.","Draw the sides of your tongue in slightly and round your lips a little.","Keep your voice on. Hindi र is different: a quick tap of the tip on the ridge."],
   tip:"If your tongue touches the roof, it becomes a tap (Hindi र). English r floats just below it.",say:[{t:"रंग",l:"hi-IN"},{t:"red",l:"en-IN"}]},
  {id:"th",chip:"th",tongue:"th",lips:{u:84,l:118,s:0},dot:[197,101],air:null,
   kicker:"TIP BETWEEN THE TEETH",title:"th (thin, three)",
   steps:["Gently place the tip of your tongue between your top and bottom front teeth.","Blow air softly over it for th in “thin”. Add your voice for th in “this”.","Pull the tongue back in. No biting!"],
   tip:"A mirror helps here: you should just see the tongue tip peeking out.",say:[{t:"thin",l:"en-IN"},{t:"three",l:"en-IN"}]},
  {id:"pbm",chip:"प ब म · p b m",tongue:"rest",lips:{u:100,l:100,s:0},dot:[205,100],air:null,
   kicker:"LIPS TOGETHER",title:"प ब म · p b m",
   steps:["Close both lips together while your tongue rests relaxed.","For p and b, build a little air, then open the lips with a pop.","For m, keep the lips closed and hum through your nose."],
   tip:"p is quiet, b and m use your voice. Hold a tissue in front of your mouth: it moves most for p.",say:[{t:"पानी",l:"hi-IN"},{t:"map",l:"en-IN"}]}
];
const TWISTERS=[
  {id:"h1",lang:"hi",text:"तीन तिगाड़ा काम बिगाड़ा",roman:"teen tigada kaam bigada",level:"Easy",focus:["dental","pbm"]},
  {id:"h2",lang:"hi",text:"सात सुंदर सितारे सुबह सो गए",roman:"saat sundar sitare subah so gaye",level:"Easy",focus:["s"]},
  {id:"h3",lang:"hi",text:"लाला लाल लड्डू लाया",roman:"lala laal laddoo laaya",level:"Easy",focus:["l"]},
  {id:"h4",lang:"hi",text:"कच्चा पापड़ पक्का पापड़",roman:"kachcha papad, pakka papad",level:"Medium",focus:["pbm","ch","k"]},
  {id:"h5",lang:"hi",text:"टट्टू ने टमाटर की टोकरी टकरा दी",roman:"tattoo ne tamatar ki tokri takra di",level:"Medium",focus:["retro"]},
  {id:"h6",lang:"hi",text:"रानी रोज़ रंगीन रस्सी रखती है",roman:"rani roz rangeen rassi rakhti hai",level:"Medium",focus:["r"]},
  {id:"h7",lang:"hi",text:"चंदू के चाचा ने चंदू की चाची को चांदी की चम्मच से चटनी चटाई",roman:"Chandu ke chacha ne Chandu ki chachi ko chaandi ki chammach se chutney chatayi",level:"Hard",focus:["ch"]},
  {id:"e1",lang:"en",text:"Big black bug bit a big black bear",roman:"",level:"Easy",focus:["pbm","k","l"]},
  {id:"e2",lang:"en",text:"She sells sea shells by the sea shore",roman:"",level:"Medium",focus:["s","sh"]},
  {id:"e3",lang:"en",text:"Peter Piper picked a peck of pickled peppers",roman:"",level:"Medium",focus:["pbm","k"]},
  {id:"e4",lang:"en",text:"How can a clam cram in a clean cream can?",roman:"",level:"Medium",focus:["k","l","pbm"]},
  {id:"e5",lang:"en",text:"Red lorry, yellow lorry",roman:"",level:"Hard",focus:["r","l"]},
  {id:"e6",lang:"en",text:"Three thin thieves thought a thousand thoughts",roman:"",level:"Hard",focus:["th"]}
];

// Speak one or more phrases in order (used for twisters and "Hear the sound").
function speakList(items,el,rate){
  if(!("speechSynthesis" in window)){notify("Text-to-speech is not available in this browser.");return}
  window.speechSynthesis.cancel();
  document.querySelectorAll(".is-speaking").forEach(n=>n.classList.remove("is-speaking"));
  const id=++speakId,done=()=>{if(id===speakId&&el)el.classList.remove("is-speaking")};
  const voices=window.speechSynthesis.getVoices();
  const lang0=items[0].l.slice(0,2).toLowerCase();
  if(voices.length&&!voices.some(v=>v.lang.toLowerCase().startsWith(lang0)))notify(lang0==="hi"?"No Hindi voice found on this device. Add one in your system language settings.":"No matching voice found on this device.");
  items.forEach((it,i)=>{
    const u=new SpeechSynthesisUtterance(it.t);u.lang=it.l;u.rate=rate||.7;
    if(i===items.length-1){u.onend=done;u.onerror=done}
    window.speechSynthesis.speak(u);
  });
  if(el){el.classList.add("is-speaking");setTimeout(done,12000)}
}

(function(){
  const tongueEl=$("mTongue"),lipU=$("mLipU"),lipL=$("mLipL"),dot=$("mDot"),ring=$("mRing"),air=$("mAir");
  let cur={n:TONGUE.rest.slice(),u:84,l:118,s:0},raf=0,active="k",filter="all";

  function tonguePath(a){
    return `M${a[0]},${a[1]} L${a[2]},${a[3]} C${a[4]},${a[5]} ${a[6]},${a[7]} ${a[8]},${a[9]} C${a[10]},${a[11]} ${a[12]},${a[13]} ${a[14]},${a[15]} C${a[16]},${a[17]} ${a[18]},${a[19]} ${a[20]},${a[21]} L${a[22]},${a[23]} C${a[24]},${a[25]} ${a[26]},${a[27]} ${a[0]},${a[1]} Z`;
  }
  function paint(){
    tongueEl.setAttribute("d",tonguePath(cur.n));
    lipU.setAttribute("x",194+cur.s);lipU.setAttribute("height",Math.max(8,cur.u-56));
    lipL.setAttribute("x",194+cur.s);lipL.setAttribute("y",cur.l);
  }
  function markers(snd){
    if(snd.dot){[dot,ring].forEach(c=>{c.setAttribute("cx",snd.dot[0]);c.setAttribute("cy",snd.dot[1]);c.classList.add("on")})}
    if(snd.air){air.setAttribute("d",snd.air);air.classList.add("on")}
  }
  function clearMarkers(){[dot,ring,air].forEach(n=>n.classList.remove("on"))}
  function showSound(id,animate){
    const snd=SOUNDS.find(s=>s.id===id)||SOUNDS[0];active=snd.id;
    document.querySelectorAll("#mouthTabs button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.sound===snd.id)));
    $("mouthKicker").textContent=snd.kicker;$("mouthTitle").textContent=snd.title;
    $("mouthSteps").innerHTML=snd.steps.map(s=>`<li>${escapeHTML(s)}</li>`).join("");
    $("mouthTip").textContent="Tip: "+snd.tip;
    replay($("mouthInfo"),"swap");
    cancelAnimationFrame(raf);clearMarkers();
    const to={n:TONGUE[snd.tongue],u:snd.lips.u,l:snd.lips.l,s:snd.lips.s};
    if(!animate||prefersReduced()){cur={n:to.n.slice(),u:to.u,l:to.l,s:to.s};paint();markers(snd);return}
    const from={n:cur.n.slice(),u:cur.u,l:cur.l,s:cur.s},t0=performance.now(),dur=650;
    const step=now=>{
      const t=Math.min(1,(now-t0)/dur),k=1-Math.pow(1-t,3);
      cur={n:from.n.map((v,i)=>v+(to.n[i]-v)*k),u:from.u+(to.u-from.u)*k,l:from.l+(to.l-from.l)*k,s:from.s+(to.s-from.s)*k};
      paint();
      if(t<1)raf=requestAnimationFrame(step);else markers(snd);
    };
    raf=requestAnimationFrame(step);
  }

  $("mouthTabs").innerHTML=SOUNDS.map(s=>`<button type="button" data-sound="${s.id}" aria-pressed="false">${escapeHTML(s.chip)}</button>`).join("");
  $("mouthTabs").addEventListener("click",e=>{const b=e.target.closest("[data-sound]");if(b)showSound(b.dataset.sound,true)});
  $("mouthHear").addEventListener("click",()=>{const s=SOUNDS.find(x=>x.id===active);speakList(s.say,$("mouthHear"),.6)});
  $("mouthReplay").addEventListener("click",()=>{cur={n:TONGUE.rest.slice(),u:84,l:118,s:0};paint();showSound(active,true)});

  function renderTwisters(){
    const list=TWISTERS.filter(t=>filter==="all"||t.lang===filter);
    $("twisterList").innerHTML=list.map(t=>`
      <article class="twister" data-id="${t.id}">
        <div class="tw-top"><span class="tag">${t.lang==="hi"?"हिन्दी":"ENGLISH"}</span><span class="lvl ${t.level.toLowerCase()}">${t.level.toUpperCase()}</span></div>
        <p class="tw-text" lang="${t.lang}">${escapeHTML(t.text)}</p>
        ${t.roman?`<p class="tw-roman">${escapeHTML(t.roman)}</p>`:""}
        <div class="tw-focus"><span class="mini-label">SHAPE THE SOUND</span>${t.focus.map(f=>{const s=SOUNDS.find(x=>x.id===f);return `<button type="button" data-sound="${f}">${escapeHTML(s.chip)}</button>`}).join("")}</div>
        <div class="tw-actions">
          <button type="button" class="button outline sm" data-rate=".5">🐢 Slow</button>
          <button type="button" class="button outline sm" data-rate=".85">▶ Normal</button>
          <button type="button" class="button outline sm" data-rate="1.15">🐇 Fast</button>
        </div>
      </article>`).join("");
  }
  $("twisterList").addEventListener("click",e=>{
    const rate=e.target.closest("[data-rate]");
    if(rate){const t=TWISTERS.find(x=>x.id===rate.closest(".twister").dataset.id);speakList([{t:t.text,l:t.lang==="hi"?"hi-IN":"en-IN"}],rate,parseFloat(rate.dataset.rate));return}
    const snd=e.target.closest("[data-sound]");
    if(snd){showSound(snd.dataset.sound,true);if(window.matchMedia("(max-width:1050px)").matches)document.querySelector(".mouth-panel").scrollIntoView({behavior:prefersReduced()?"auto":"smooth",block:"start"})}
  });
  $("twisterFilter").addEventListener("click",e=>{
    const b=e.target.closest("[data-filter]");if(!b)return;
    filter=b.dataset.filter;
    document.querySelectorAll("#twisterFilter button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
    renderTwisters();
  });

  renderTwisters();
  showSound("k",false);
})();
