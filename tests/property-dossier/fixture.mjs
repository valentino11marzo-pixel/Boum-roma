// Synthetic data only. These names/addresses are not customer records.
export const fixture = {
 profile:{id:'demo-admin',role:'admin',name:'Operatore demo'},page:'properties',
 users:[{id:'owner-demo',role:'landlord',name:'Proprietaria Demo',email:'owner@example.invalid'}, {id:'tenant-demo',role:'tenant',name:'Conduttore Demo',email:'tenant@example.invalid'}],
 properties:[{id:'casa-demo',name:'Casa Aurora',address:'Via Esempio, 12 · Roma',zone:'Centro',ownerId:'owner-demo',availabilityStatus:'rented',propertyType:'apartment',sqm:85,rooms:3,bathrooms:2,floor:0,rent:1400,notes:'Dati dimostrativi. Questa scheda utilizza gli stessi componenti del portale.'},{id:'casa-vuota',name:'Casa senza collegamenti',address:'Indirizzo dimostrativo',availabilityStatus:'off_market'}],
 contracts:[{id:'contratto-demo',propertyId:'casa-demo',tenantId:'tenant-demo',landlordId:'owner-demo',status:'active',type:'4+4',rent:1400,deposit:2800,startDate:'2026-01-01',endDate:'2030-01-01',createdAt:'2026-01-01'}],
 payments:[{id:'rata-agosto',propertyId:'casa-demo',contractId:'contratto-demo',tenantId:'tenant-demo',amount:1400,status:'paid',type:'rent',month:'2026-08',dueDate:'2026-08-05',paidAt:'2026-08-03T12:00:00Z'}, {id:'rata-settembre',propertyId:'casa-demo',contractId:'contratto-demo',tenantId:'tenant-demo',amount:1400,status:'reported',type:'rent',month:'2026-09',dueDate:'2026-09-05'}],
 documents:[{id:'doc-demo',name:'Planimetria · esempio',propertyId:'casa-demo',type:'plan',createdAt:'2026-01-01'}],
 maintenance:[{id:'manutenzione-demo',propertyId:'casa-demo',userId:'tenant-demo',title:'Verifica della caldaia',description:'Richiesta dimostrativa: controllo dell’impianto e appuntamento con il tecnico.',priority:'normal',status:'in_progress',technician:'Tecnico demo',createdAt:'2026-09-18T10:00:00Z'}],
 tasks:[{id:'attivita-demo',propertyId:'casa-demo',title:'Concordare l’accesso per il tecnico',status:'pending',dueDate:'2026-09-22',createdAt:'2026-09-18'}],
 invoices:[],clients:[],deadlines:[],rules:[],listings:[],leads:[],actionQueue:[],conversations:[],notifications:[],userNotifications:[]
};
