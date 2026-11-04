// Read model of the existing receipts, never another publication queue.
import { publishHash, publishable } from './_state.js';
import { publicationBlocked } from './_adoption.js';

export function safePortalURL(value, portal) {
  try {
    const u = new URL(value), host = portal === 'idealista' ? 'idealista.it' : 'immobiliare.it';
    return u.protocol === 'https:' && !u.username && !u.password &&
      (u.hostname === host || u.hostname === 'www.' + host) ? u.href : null;
  } catch { return null; }
}
export function publicationStatus(listing, portal, receipt, config, {receiptError=false, configError=false}={}) {
  const out = {portal, enabled:configError ? null : config?.enabled === true && config?.portals?.[portal]?.enabled === true,
    state:'unknown', label:'Nessuna ricevuta', detail:'La presenza e i dati dell’annuncio sul portale non sono ancora verificati.', remoteUrl:null, recordedAt:null};
  if (receiptError) return {...out,label:'Lettura da riprovare',detail:'Non è stato possibile leggere la ricevuta del portale.'};
  if (!receipt) return out;
  if ((receipt.portal && receipt.portal !== portal) || (receipt.listingId && receipt.listingId !== listing.id))
    return {...out,label:'Collegamento da verificare',detail:'La ricevuta rimanda a un altro annuncio o portale.'};
  out.remoteUrl = safePortalURL(receipt.remoteUrl,portal);
  if (publicationBlocked(receipt)) return {...out,state:'reference_only',label:'Riferimento collegato',
    detail:'Il codice identifica questa casa. Creazione, aggiornamento e ritiro automatici non sono autorizzati; non è una ricevuta di pubblicazione.',
    recordedAt:receipt.adoptedAt || null};
  out.recordedAt = receipt.lastRunAt || receipt.publishedAt || receipt.removedAt || null;
  if (receipt.status === 'error') return {...out,state:'error',label:'Ultimo tentativo non riuscito',detail:'Verifica l’annuncio e completa l’aggiornamento. I dati del catalogo restano salvati.'};
  if (receipt.wasLive === true) {
    if (!publishable(listing)) return {...out,state:'remove',label:'Ritiro da verificare',detail:'La casa non è pubblicabile nel catalogo; l’ultima ricevuta la indica ancora pubblicata.'};
    if (receipt.hash !== publishHash(listing)) return {...out,state:'changed',label:'Aggiornamento da completare',detail:'Il catalogo è cambiato rispetto all’ultimo invio registrato.'};
    return {...out,state:'recorded',label:'Ultimo invio coerente',detail:'La ricevuta corrisponde ai dati attuali. La pagina pubblica va verificata separatamente.'};
  }
  if (receipt.status === 'removed') return {...out,state:'removed',label:'Rimozione registrata',detail:publishable(listing) ? 'La casa è di nuovo pubblicabile; non risulta un nuovo invio.' : 'Il ritiro è registrato. La pagina pubblica va verificata separatamente.'};
  return out;
}
