/* Company and service evidence, kept within the Club preview. Existing controllers own every journey. */
(function () {
  'use strict';
  if(document.body.dataset.edition!=='club')return;
  var footer=document.querySelector('.next-footer');if(!footer)return;
  footer.id='clubCompany';footer.classList.add('club-company');
  footer.innerHTML=`
    <div class="club-company-intro">
      <a class="club-company-brand next-brand" href="/flight-next?direction=club&edition=club" data-view="home" aria-label="BOOM home"><img src="/assets/boom-brand-lockup.svg" alt="BOOM" width="600" height="160"></a>
      <div><h2>From Rome.<br>For your next chapter.</h2><p>Homes and property management in Rome.<br>Tenant-side rental search and support across our European desks.</p></div>
    </div>
    <section class="club-principles" id="clubPrinciples" aria-label="What you can expect from BOOM">
      <article><span aria-hidden="true">↳</span><h3>Clarity before commitment.</h3><p>See the scope, fees and conditions before choosing a service. Know what still needs to be confirmed.</p><a href="/your-money">Understand your costs <span aria-hidden="true">↗</span></a></article>
      <article><span aria-hidden="true">↳</span><h3>A person who answers.</h3><p>Founded by Valentino Egidi. One agency, answering from Rome, with a named person behind your move.</p><a href="/about">Meet the agency <span aria-hidden="true">↗</span></a></article>
      <article><span aria-hidden="true">↳</span><h3>Tools you can use.</h3><p>Explore the Property Finding client workspace: sample homes and a real look at the search experience.</p><a href="/client-portal?code=DEMO">Open the Property Finding demo <span aria-hidden="true">↗</span></a></article>
    </section>
    <section class="club-destinations" id="clubDestinations" aria-labelledby="clubDestinationsTitle">
      <div class="club-destinations-title"><h3 id="clubDestinationsTitle">Your destination.</h3><p>Every desk answers from Rome.<br>Choose a city to see what we do there.</p></div>
      <div class="club-destination-board">
        <button type="button" data-europe-city="rome"><span class="club-destination-code" aria-hidden="true">ROM</span><strong>Rome</strong><span>Homes &amp; Skyline</span><i aria-hidden="true">↗</i></button>
        <button type="button" data-europe-city="amsterdam"><span class="club-destination-code" aria-hidden="true">AMS</span><strong>Amsterdam</strong><span>Tenant-side support</span><i aria-hidden="true">↗</i></button>
        <button type="button" data-europe-city="barcelona"><span class="club-destination-code" aria-hidden="true">BCN</span><strong>Barcelona</strong><span>Tenant-side support</span><i aria-hidden="true">↗</i></button>
        <button type="button" data-europe-city="london"><span class="club-destination-code" aria-hidden="true">LON</span><strong>London</strong><span>Tenant-side support</span><i aria-hidden="true">↗</i></button>
        <button type="button" data-europe-city="madrid"><span class="club-destination-code" aria-hidden="true">MAD</span><strong>Madrid</strong><span>Tenant-side support</span><i aria-hidden="true">↗</i></button>
        <button type="button" data-europe-city="milan"><span class="club-destination-code" aria-hidden="true">MIL</span><strong>Milan</strong><span>Tenant-side support</span><i aria-hidden="true">↗</i></button>
      </div>
    </section>
    <nav class="club-company-links" aria-label="Explore BOOM">
      <div><h3>Support in Rome</h3><a href="/how-it-works">How it works</a><a href="/property-finding" data-club-rome-service="/property-finding" data-journey-service="/property-finding">Find a home in Rome</a><a href="/deal-assistance" data-club-rome-service="/deal-assistance" data-journey-service="/deal-assistance">Help with a home you found</a><a href="/contract-check-express" data-club-rome-service="/contract-check-express" data-journey-service="/contract-check-express">Review your contract</a><a href="/desks">Explore the European desks</a></div>
      <div><h3>Make it your Rome</h3><a href="/your-rome">Campuses &amp; neighbourhoods</a><a href="/virtual-viewing" data-club-rome-service="/virtual-viewing" data-journey-service="/virtual-viewing">View a home remotely</a><a href="/concierge">Settling in</a><a href="/login">Client area</a></div>
      <div><h3>People &amp; organisations</h3><a href="/universities">Students &amp; universities</a><a href="/corporate">Companies &amp; relocation</a><a href="/research">Researchers &amp; visiting scholars</a><a href="/owners">Property owners</a><a href="/buy-property-europe">Buy a property in Europe</a></div>
      <div><h3>Know BOOM</h3><a href="/about">Our agency</a><a href="/your-money">Costs &amp; conditions</a><a href="mailto:hello@boom-rome.com">hello@boom-rome.com</a><a href="tel:+393313251961">+39 331 325 1961</a></div>
    </nav>
    <div class="club-company-legal"><p><strong>BOOM® · Egidi Immobiliare S.r.l.</strong><br>Operating address: Via dei Coronari 181/184, 00186 Roma<br>Registered office: Viale Liegi 42, 00198 Roma<br>VAT 17322991005 · REA RM-1710623</p><div><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/withdrawal">Withdrawal</a></div><small>Design preview · Live Rome catalogue</small></div>`;
  // No second city state: selection, currency boundaries and public briefs stay with Europe.
  function selection(){
    var city=document.body.dataset.europeCity||'rome';
    footer.querySelectorAll('[data-europe-city]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.europeCity===city));});
    // Roman services receive only the canonical Rome brief, never a foreign budget/currency.
    footer.querySelectorAll('[data-club-rome-service]').forEach(function(link){
      var path=link.dataset.clubRomeService;
      if(city==='rome'){link.dataset.journeyService=path;link.href=window.BoomFlightClub?window.BoomFlightClub.intent(path):path;}
      else{delete link.dataset.journeyService;link.href=path;}
    });
  }
  new MutationObserver(selection).observe(document.body,{attributes:true,attributeFilter:['data-europe-city']});selection();
  footer.addEventListener('click',function(event){
    var button=event.target.closest('[data-europe-city]');if(!button)return;
    requestAnimationFrame(function(){
      if(document.body.dataset.view!=='home'||document.body.dataset.europeCity!==button.dataset.europeCity)return;
      document.getElementById('nextHero').scrollIntoView({block:'start',behavior:'instant'});
      var heading=document.getElementById('nextHeroTitle');heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});
    });
  });
})();
