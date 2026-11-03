/* Display the public brief at the existing service/application door.
   No network, storage, payment logic or automatic submission lives here. */
(function () {
  'use strict';
  var J = window.BOOM_JOURNEY, S = window.BOOM_STAY;
  if (!J || !S) return;
  var brief = J.read(location.search), selectedPlace = brief.place;
  var household = {solo:'Just me',couple:'A couple',family:'A family',flatmates:'Flatmates'};
  function byId(id) { return document.getElementById(id); }
  function element(tag, text) { var node=document.createElement(tag); if(text)node.textContent=text; return node; }
  function hasBrief() { return !!(brief.place || brief.moveIn || brief.moveOut || brief.durationMonths || brief.people || brief.budget !== null || brief.homes.length); }
  function lines() {
    var out=[], place=J.destination(selectedPlace), error=S.validate(brief);
    if (!error && S.summary(brief)) out.push('Requested stay: '+S.summary(brief)+'.');
    if (brief.budget !== null) out.push(brief.budget ? 'Monthly rent ceiling: €'+brief.budget+'.' : 'Rent budget: still exploring.');
    if (brief.people) out.push('Household: '+household[brief.people]+'.');
    if (place) out.push('Destination: '+place.nome+(place.address ? ' — '+place.address : '')+'.');
    return out;
  }
  function populate(node, value, force) {
    if (!node || value == null || (!force && node.value)) return false;
    node.value=value; node.dispatchEvent(new Event('input',{bubbles:true})); node.dispatchEvent(new Event('change',{bubbles:true})); return true;
  }
  function panel() {
    var box=element('section'); box.id='boomJourneyBrief';box.setAttribute('aria-label','Your journey brief');
    box.style.cssText='margin:18px 0;padding:18px;border:1px solid #ffd70055;border-radius:8px;background:#ffd70008;color:inherit;';
    var title=element('strong','Your journey, carried forward');title.style.cssText='display:block;font-size:16px;line-height:1.4;margin-bottom:8px;';box.appendChild(title);
    var copy=element('p',lines().join(' '));copy.style.cssText='margin:0;font-size:14px;line-height:1.65;';box.appendChild(copy);
    var warning=element('p','Your dates need checking. Review them before sending your request.');warning.setAttribute('role','status');warning.dataset.journeyDateError='';warning.hidden=!S.validate(brief);warning.style.cssText='font-size:14px;margin:10px 0 0;';box.appendChild(warning);
    return box;
  }
  function refresh(box) {
    box.querySelector('p').textContent=lines().join(' ');
    box.querySelector('[data-journey-date-error]').hidden=!S.validate(brief);
  }
  function useButton(box, action) {
    var button=element('button','Use these details');button.type='button';
    button.style.cssText='display:block;min-height:44px;margin-top:10px;padding:8px 0;border:0;background:none;color:#ffd700;text-align:left;font:inherit;';
    button.addEventListener('click',function(){action(true);button.textContent='Details added — review below';});box.appendChild(button);
  }
  function ready() {
    if (!hasBrief() || byId('boomJourneyBrief')) return;
    var pfs=byId('ckForm'), das=byId('sJourneyNotes'), apply=byId('modApplica'), box=panel();
    if (pfs) {
      var fields=pfs.querySelector('.ck-campi');if(!fields)return;fields.before(box);
      var notes=byId('ckNote'), text=lines().join('\n');
      function fill(force) {
        populate(byId('ckBudget'),brief.budget ? String(brief.budget) : '',force);
        if (!S.validate(brief)) populate(byId('ckQuando'),brief.moveIn ? brief.moveIn.slice(0,7) : '',force);
        if (populate(notes,text,force) && text && !pfs.classList.contains('aperto')) { var more=byId('ckPiu');if(more)more.click(); }
      }
      fill(false);useButton(box,fill);
      var note=element('small','Review the dates and destination in “Anything else”. Existing details are kept until you choose to replace them.');
      note.style.cssText='display:block;font-size:12px;line-height:1.5;margin-top:10px;';box.appendChild(note);
    } else if (das) {
      var wrapper=byId('sJourneyNotesField');wrapper.hidden=false;wrapper.before(box);
      function fillNotes(force){populate(das,lines().join('\n'),force);}
      fillNotes(false);useButton(box,fillNotes);
    } else if (apply) {
      var intro=byId('applicaSotto');if(intro)intro.after(box);else apply.before(box);
      // The original date controller owns updates and validation. This brief
      // only reflects them, including restore/clear, and never writes back.
      document.addEventListener('boom:stay',function(event){
        brief=J.normalize(Object.assign({},brief,event.detail));refresh(box);
      });
      var who=byId('apChi');if(who)who.addEventListener('change',function(){
        brief=J.normalize(Object.assign({},brief,{people:who.value}));refresh(box);
      });
      if (selectedPlace) {
        var label=element('label','Everyday destination to include with your application');label.htmlFor='apJourneyPlace';
        label.style.cssText='display:block;font-size:13px;line-height:1.5;margin-top:14px;';
        var select=element('select');select.id='apJourneyPlace';select.style.cssText='display:block;width:100%;min-width:0;min-height:44px;margin-top:7px;padding:8px;font-size:16px;border:1px solid #ffffff40;background:#151517;color:#f5f4ed;';
        var empty=element('option','Do not include a destination');empty.value='';select.appendChild(empty);
        ((window.BOOM_MAPPA && BOOM_MAPPA.DESTINATIONS)||[]).forEach(function(p){var option=element('option',p.nome);option.value=p.slug;select.appendChild(option);});
        select.value=selectedPlace;select.addEventListener('change',function(){selectedPlace=J.destination(select.value)?select.value:null;refresh(box);});
        label.appendChild(select);box.appendChild(label);
      }
    }
  }
  window.BoomJourneyHandoff=Object.freeze({
    commute:function(){var place=J.destination(selectedPlace);return place?{place:place.slug,label:place.nome.slice(0,60)}:null;}
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
