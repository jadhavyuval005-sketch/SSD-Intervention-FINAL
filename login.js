(function(){
  "use strict";

  /* ---- Backend hook -------------------------------------------------------
     Set API_BASE to your Flask URL (e.g. "http://localhost:5000/api") and
     fill in the real route names / field names from your backend.
     While it is empty, the page runs in local demo mode. */
  var API_BASE = "";
  var USER_KEY = "vaaniai_demo_user";   // same key app.js already reads
  var ROLE_KEY = "vaaniai_demo_role";
  var AUTH_KEY = "vaaniai_demo_signed_in";
  var NEXT_PAGE = "index.html";

  var $ = function(id){return document.getElementById(id)};
  var mode = "login";
  var toastTimer;

  function notify(msg){
    var t = $("toast");
    t.textContent = msg;
    t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){t.classList.remove("show")}, 2800);
  }

  function safeSet(store, k, v){ try{ store.setItem(k, v) }catch(e){} }

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
    ["nameError","emailError","passwordError"].forEach(function(id){$(id).textContent=""});
    ["fullName","email","password"].forEach(function(id){$(id).removeAttribute("aria-invalid")});
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

  function finish(displayName, role){
    var store = $("remember").checked ? localStorage : sessionStorage;
    safeSet(localStorage, USER_KEY, displayName);
    safeSet(localStorage, ROLE_KEY, role);
    safeSet(store, AUTH_KEY, "1");
    notify("Welcome, " + displayName + ".");
    setTimeout(function(){ window.location.href = NEXT_PAGE; }, 700);
  }

  function nameFromEmail(email){
    var base = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    return base ? base.replace(/\b\w/g, function(c){return c.toUpperCase()}).slice(0,35) : "Guest";
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

  $("guestBtn").addEventListener("click", function(){
    finish("Guest", $("role").value);
  });

  $("loginForm").addEventListener("submit", function(e){
    e.preventDefault();
    if(!validate()) return;

    var email = $("email").value.trim();
    var role = $("role").value;
    var name = mode === "register" ? $("fullName").value.trim() : nameFromEmail(email);

    if(API_BASE){
      /* Example for later, using your backend's exact routes and field names:
         fetch(API_BASE + (mode === "register" ? "/register" : "/login"), {
           method: "POST",
           headers: {"Content-Type":"application/json"},
           body: JSON.stringify({ email: email, password: $("password").value, name: name, role: role })
         }).then(r => r.json()).then(data => { store data.access_token; finish(...) });
      */
      notify("API_BASE is set but the request code is not written yet.");
      return;
    }
    finish(name, role);
  });

  /* Already signed in? Skip straight to the app. */
  try{
    if(localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY)){ /* keep page visible so the user can switch account */ }
  }catch(e){}

  /* Cycle the orb letter like a quiet greeting (no motion if reduced-motion is on) */
  var letters = ["आ","क","स","म","a","s"];
  var i = 0;
  if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches){
    setInterval(function(){
      var el = $("orbLetter");
      el.classList.add("out");
      setTimeout(function(){ i = (i+1) % letters.length; el.textContent = letters[i]; el.classList.remove("out"); }, 350);
    }, 3200);
  }
})();
