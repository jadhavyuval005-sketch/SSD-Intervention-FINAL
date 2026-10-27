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
