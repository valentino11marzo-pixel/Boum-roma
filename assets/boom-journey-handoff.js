/* Display the public brief at the existing service/application door.
   No network, storage, payment logic or automatic submission lives here. */
(function () {
  'use strict';
  var J = window.BOOM_JOURNEY, S = window.BOOM_STAY;
  if (!J || !S) return;
  var brief = J.read(location.search), selectedPlace = brief.place;
  var household = {solo:'Just me',couple:'A couple',family:'A family',flatmates:'Flatmates'};
  var desk=null, deskBox=null, deskFields={}, lastDeskNote=null, deskNoteEdited=false, writingDeskNote=false;
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
  function deskValue() {
    if(!desk)return null;
    return J.deskNormalize({city:desk.city,need:desk.need,currency:desk.currency,
      moveIn:deskFields.moveIn.value,moveOut:deskFields.moveOut.value,
      budget:deskFields.budget.value,people:deskFields.people.value});
  }
  function deskLines(value) {
    var out=[],symbol=(window.BOOM_CITY||{}).SYMBOL||(value.currency==='GBP'?'£':'€');
    if(value.moveIn&&value.moveOut)out.push('Requested stay: '+value.moveIn+' → '+value.moveOut+'.');
    else if(value.moveIn)out.push('Requested arrival: '+value.moveIn+'.');
    else if(value.moveOut)out.push('Requested departure: '+value.moveOut+'.');
    if(value.budget!==null)out.push(value.budget?'Monthly rent ceiling: '+symbol+value.budget+'.':'Rent budget: still exploring.');
    if(value.people)out.push('Household: '+household[value.people]+'.');
    return out;
  }
  function deskSummary(value) {
    function date(iso,year){return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:year?'numeric':undefined,timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));}
    var from=value.moveIn,until=value.moveOut;
    if(from&&until)return date(from,from.slice(0,4)!==until.slice(0,4))+' → '+date(until,true)+' · review your plans';
    if(from)return 'From '+date(from,true)+' · review your plans';
    if(until)return 'Until '+date(until,true)+' · review your plans';
    return 'Your plans · review or edit';
  }
  function deskValid() {
    if(!desk)return true;
    var value=deskValue(),error=J.deskError(value),field;
    if(!error&&!deskFields.budget.checkValidity())error={field:'budget',message:'Choose a whole monthly budget from 0 to 100000, or leave it blank.'};
    var notice=byId('cityJourneyError');notice.hidden=!error;notice.textContent=error?error.message:'';
    Object.keys(deskFields).forEach(function(key){deskFields[key].removeAttribute('aria-invalid');});
    if(error){deskBox.open=true;field=deskFields[error.field];field.setAttribute('aria-invalid','true');field.focus();return false;}
    return true;
  }
  function deskNote() {
    if(!desk)return;
    var value=deskValue(),text=deskLines(value).join(' '),note=byId('tNote');
    // A note edited by the client wins over later editor changes or reopen.
    if(note&&!deskNoteEdited&&(!note.value||note.value===lastDeskNote)){writingDeskNote=true;populate(note,text,true);writingDeskNote=false;lastDeskNote=text;}
    var copy=byId('cityCheckoutBrief');if(copy)copy.textContent=deskNoteEdited?'The checkout note below is the version sent to the desk.':text;
  }
  function cityReady() {
    var C=window.BOOM_CITY||{},form=byId('fileForm');
    desk=J.deskBrief(location.search,C.SLUG);
    if(!desk||!form)return false;
    var box=element('details');box.id='boomJourneyBrief';box.style.cssText='margin:12px 0;padding:12px;border:1px solid #ffd70055;border-radius:6px;max-width:100%;';deskBox=box;
    var summary=element('summary','Your plans · review or edit');summary.style.cssText='min-height:44px;display:flex;align-items:center;font-size:14px;cursor:pointer;';box.appendChild(summary);
    var copy=element('p');copy.id='cityJourneySummary';copy.style.cssText='font-size:13px;line-height:1.6;margin:0 0 10px;';box.appendChild(copy);
    var grid=element('div');grid.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;';box.appendChild(grid);
    [['moveIn','Arrival','date'],['moveOut','Departure','date'],['budget','Monthly rent ('+desk.currency+')','number'],['people','Who is moving?','select']].forEach(function(spec){
      var key=spec[0],label=element('label',spec[1]),input=element(spec[2]==='select'?'select':'input');
      label.htmlFor='cityJourney-'+key;label.style.cssText='font-size:12px;min-width:0;';input.id=label.htmlFor;
      if(spec[2]==='select'){
        var empty=element('option','Choose later');empty.value='';input.appendChild(empty);
        Object.keys(household).forEach(function(who){var option=element('option',household[who]);option.value=who;input.appendChild(option);});
      }else input.type=spec[2];
      if(key==='budget'){input.min='0';input.max='100000';input.step='1';input.placeholder=desk.budgetNeedsConfirmation?'Confirm in '+desk.currency:'Optional';}
      input.style.cssText='display:block;box-sizing:border-box;width:100%;min-width:0;min-height:44px;margin-top:5px;padding:8px 4px;font-size:16px;border:1px solid #ffffff40;border-radius:4px;background:#151517;color:#f5f4ed;color-scheme:dark;';
      input.setAttribute('aria-describedby','cityJourneyError');input.value=desk[key]===null?'':desk[key];deskFields[key]=input;
      input.addEventListener('input',function(){var value=deskValue();summary.textContent=deskSummary(value);copy.textContent=deskLines(value).join(' ')||'Your plans are optional. You can discuss them on the call.';deskNote();});
      label.appendChild(input);grid.appendChild(label);
    });
    var notice=element('p');notice.id='cityJourneyError';notice.setAttribute('role','alert');notice.hidden=true;notice.style.cssText='font-size:13px;line-height:1.5;margin-top:10px;';box.appendChild(notice);
    var note=element('p',desk.budgetNeedsConfirmation?'Confirm your rent budget in '+desk.currency+'. No currency conversion has been made.':'Requested dates are preferences; the desk confirms the search and lease conditions.');note.style.cssText='font-size:12px;line-height:1.5;margin-top:10px;';box.appendChild(note);
    form.prepend(box);copy.textContent=deskLines(desk).join(' ')||'Your plans are optional. You can discuss them on the call.';
    summary.textContent=deskSummary(desk);
    [form,byId('tillForm')].filter(Boolean).forEach(function(f){f.addEventListener('submit',function(event){
      if(f===form&&byId('fFields').hidden)return;
      if(!deskValid()){event.preventDefault();event.stopImmediatePropagation();}
    },true);});
    var till=byId('tNote');if(till){var recap=element('p');recap.id='cityCheckoutBrief';recap.style.cssText='font-size:13px;line-height:1.6;margin:10px 0;';till.closest('.fld').before(recap);deskNoteEdited=!!till.value;till.addEventListener('input',function(){if(!writingDeskNote){deskNoteEdited=true;deskNote();}});}
    deskNote();
    var plan={search:'full-search',application:'application-pack',viewing:'attended-viewing'}[desk.need],fare=plan&&byId('fare-'+plan);
    if(fare&&!document.querySelector('details.fare[open]'))fare.open=true;
    return true;
  }
  function ready() {
    if(byId('fileForm')){cityReady();return;}
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
    commute:function(){var place=J.destination(selectedPlace);return place?{place:place.slug,label:place.nome.slice(0,60)}:null;},
    cityLead:function(){if(!desk)return {};var value=deskValue();return {moveIn:value.moveIn||'',budget:value.budget?value.currency+' '+value.budget:'',
      situation:value.people?household[value.people]:'',message:deskLines(value).join(' ')};},
    cityCheckout:function(){if(!desk)return true;if(!deskValid())return false;deskNote();return true;}
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
