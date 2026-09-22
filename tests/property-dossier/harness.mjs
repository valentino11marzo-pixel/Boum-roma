import { readFileSync } from 'node:fs';
import { fixture } from './fixture.mjs';
const src=readFileSync(new URL('../../js/portal-app.js',import.meta.url),'utf8');
// The actual portal renderer/router/list/modal functions, not parallel copies.
export function extract(name) {
 const start=src.indexOf('    function '+name+'('); if(start<0)throw Error('Missing '+name);
 const next=src.slice(start+5).search(/\n    (?:async )?function /);
 return next<0?src.slice(start):src.slice(start,start+5+next);
}
const names=['goTo','buildNav','renderPage','closeSidebar','toggleSidebar','propertiesPage','filterProperties','searchProperties','viewProperty','accessDenied','isAdmin','isLandlord','isTenant','boomBusinessInvoices','daysUntil','esc','jsq','rentActionArg','fmtDate','statusLabel','statusColor','priorityLabel','priorityColor','catLabel','viewMaintenance','viewUser','roleLabel','initials','closeModal','rentOverview','rentMoney','rentStateLabel','rentMonthLabel','rentSafeHttpUrl','rentPaymentRow','openRentUnit','closeRentDetail','rentDetailKeys'];
const functions=names.map(extract).join('\n');
const routeStart=src.indexOf("    window.addEventListener('popstate', () => {",src.indexOf('    function goTo('));
const popstate=src.slice(routeStart,src.indexOf('    function toggleSidebar()',routeStart));
const configStart=src.indexOf('    window.BOOM_PROPERTY_DOSSIER?.configure({');
const config=src.slice(configStart,src.indexOf('    // ══',configStart));
export const html=`<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Fascicolo immobile · anteprima BOOM</title>
<link rel="stylesheet" href="/css/portal.css"><link rel="stylesheet" href="/css/portal-finish.css"><link rel="stylesheet" href="/css/property-dossier.css"><link rel="stylesheet" href="/css/rent.css"><link rel="stylesheet" href="/css/portal-mobile.css"><link rel="stylesheet" href="/css/portal-desktop.css"></head><body>
<div class="app active" id="app"><header class="header"><div class="header-left"><button class="menu-btn" onclick="toggleSidebar()" aria-label="Menu">☰</button><span class="logo-text">BOOM</span></div><span style="color:var(--text-secondary);font-size:11px">ANTEPRIMA LOCALE · DATI DEMO</span><span id="headerName">Operatore demo</span><span hidden id="headerBadge">Admin</span></header><div class="layout"><aside class="sidebar" id="sidebar"></aside><div class="sidebar-overlay" id="sidebarOverlay"></div><main class="main" id="main"></main></div><div id="modals"></div><div id="toasts"></div></div>
<script src="/js/rent-engine.js"></script><script src="/js/property-dossier-engine.js"></script><script src="/js/property-dossier.js"></script><script>
const S=${JSON.stringify(fixture)}; window.testState=S;
let selectedFile=null,listingImageUrl='',paymentFilters={month:'all',kind:'all',search:''};
const rentLoadState={status:'initial',checkedAt:null};
// Unchanged external workflow boundaries are recorded in this read-only demo.
window.demoActions=[];
function viewContract(id){demoActions.push(['contract',id]);document.getElementById('modals').innerHTML='<div class="modal-overlay active"><div class="modal"><div class="modal-header"><h2>Contratto dimostrativo</h2><button class="modal-close" onclick="closeModal()" aria-label="Chiudi">×</button></div><div class="modal-body">Nel portale si apre qui il contratto già esistente.</div></div></div>';}
function demoNotice(){document.getElementById('modals').innerHTML='<div class="modal-overlay active"><div class="modal"><div class="modal-header"><h2>Anteprima locale</h2><button class="modal-close" onclick="closeModal()" aria-label="Chiudi">×</button></div><div class="modal-body">Questa anteprima usa dati dimostrativi. Nel portale l’azione apre il flusso esistente.</div></div></div>';}
function editTask(id){demoActions.push(['task',id]);demoNotice();}
function openModal(type,data){demoActions.push([type,data?.id]);demoNotice();}
function confirmDelete(type,id,name){demoActions.push(['confirmDelete',type,id]);demoNotice();}
function openValutazione(a,b,data){demoActions.push(['valuation',data.propertyId]);demoNotice();}
function innestoSeedFromHash(){return false;}
async function loadDataFresh(){BOOM_PROPERTY_DOSSIER.setSourceState('loading');await new Promise(r=>setTimeout(r,30));BOOM_PROPERTY_DOSSIER.setSourceState('ready');}
${functions}
${popstate}
${config}
goTo(location.hash.slice(1)||'properties');
</script><script src="/js/portal-mobile.js"></script><script src="/js/portal-desktop.js"></script></body></html>`;
