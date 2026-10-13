/* assets/boom-city.js — shared behaviour of the BOOM city pages.
   Extracted from the hand-built amsterdam.html (BOOM_CITIES_BRIEF.md, Phase 1).
   Reads the page's `BOOM` config, inlined by build-cities.mjs from
   cities/<city>.json. City copy never lives here: the WhatsApp message, the
   error text and the deposit amount come from the config or the markup.
   The WhatsApp and Stripe hrefs are written at build time, so those links
   work without JS. */
(function(){
  if (typeof BOOM === "undefined") return;

  // Spots counter (the build already prints the same numbers for no-JS)
  document.querySelectorAll("[data-spots-left]").forEach(function(el){ el.textContent = BOOM.SPOTS_LEFT; });
  document.querySelectorAll("[data-spots-total]").forEach(function(el){ el.textContent = BOOM.SPOTS_TOTAL; });

  // Plan preselect from pricing buttons
  document.querySelectorAll("[data-plan]").forEach(function(a){
    a.addEventListener("click", function(){ var s=document.getElementById("plan"); if(s) s.value = a.getAttribute("data-plan"); });
  });

  // UTM capture
  try { var q = location.search.replace(/^\?/,""); var u = document.getElementById("utm"); if(q && u){ u.value = q; } } catch(e){}

  // Reveal on scroll
  var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); } });
  },{threshold:.12}) : null;
  document.querySelectorAll(".reveal").forEach(function(el){ io ? io.observe(el) : el.classList.add("in"); });

  // Form → Web3Forms → Stripe
  var form = document.getElementById("reserve-form");
  var btn  = document.getElementById("submit-btn");
  var ok   = document.getElementById("success");
  var stripeBtn = document.getElementById("stripe-btn");

  if (form && btn && ok) {
    var btnLabel = btn.textContent;
    form.addEventListener("submit", function(ev){
      ev.preventDefault();
      if(!form.checkValidity()){ form.reportValidity(); return; }
      btn.disabled = true; btn.textContent = "Saving…";
      var data = new FormData(form);
      data.append("access_key", BOOM.WEB3FORMS_KEY);
      fetch("https://api.web3forms.com/submit", { method:"POST", body:data, headers:{ "Accept":"application/json" } })
        .then(function(r){ return r.json(); })
        .then(function(res){
          if(res && res.success){
            form.style.display = "none"; ok.classList.add("show");
            if(window.fbq){ fbq("track","Lead"); }
            ok.scrollIntoView({behavior:"smooth",block:"center"});
          } else { throw new Error("submit failed"); }
        })
        .catch(function(){
          btn.disabled = false; btn.textContent = btnLabel;
          alert(form.getAttribute("data-error"));
        });
    });
  }

  if (stripeBtn) {
    stripeBtn.addEventListener("click", function(){ if(window.fbq){ fbq("track","InitiateCheckout",{value:BOOM.DEPOSIT_EUR,currency:"EUR"}); } });
  }

  // Meta Pixel (optional)
  if(BOOM.META_PIXEL_ID){
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', BOOM.META_PIXEL_ID); fbq('track','PageView');
  }
})();
