const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
exports.build = () => {
 const source=fs.readFileSync(path.join(root,'js/portal-app.js'),'utf8');
 const fragment=source.slice(source.indexOf('    const paymentFilters ='),source.indexOf('    async function sendPaymentReminder('));
 const links=source.slice(source.indexOf('    async function paymentLinkFor('),source.indexOf('    async function paymentLinkFor(')+20000);
 const linkEnd=links.indexOf('\n    }',links.indexOf('    async function showPaymentLink('))+6;
 const fixture={page:'payments',invoices:[{id:'inv1',amount:120,status:'paid',service:'Gestione'},{id:'receipt1',paymentId:'p2',amount:1400,status:'paid'}], properties:[{id:'u1',name:'Unità A · Prati',address:'Indirizzo di esempio'},{id:'u2',name:'Unità B · Trastevere'},{id:'u3',name:'Unità C · Ostiense'},{id:'u4',name:'Unità D · San Giovanni'},{id:'u5',name:'Unità E · Da completare'}],users:[{id:'t1',name:'Inquilino A'},{id:'t2',name:'Inquilino B'},{id:'t3',name:'Inquilino C'},{id:'t4',name:'Inquilino D'}],contracts:[1,2,3,4,5].map(i=>({id:'c'+i,propertyId:'u'+i,tenantId:'t'+i,status:'active'})),payments:[{id:'p1',contractId:'c1',amount:950,month:'2026-09',dueDate:'2026-09-01',status:'overdue'},{id:'p2',contractId:'c2',amount:1400,month:'2026-09',dueDate:'2026-09-01',status:'paid',paidDate:'2026-09-02'},{id:'p3',contractId:'c3',amount:1100,month:'2026-09',dueDate:'2026-09-01',status:'pending',sddPiId:'pi_example',sddStatus:'processing'},{id:'p4',contractId:'c4',amount:800,month:'2026-09',dueDate:'2026-09-01',status:'pending',tenantReported:true},{id:'p5',contractId:'c1',amount:950,month:'2026-08',dueDate:'2026-08-01',status:'pending'},{id:'d1',contractId:'c1',amount:1900,month:'2026-09',dueDate:'2026-09-01',status:'pending',type:'deposit-balance'}]};
 return {root,source,fragment,links:links.slice(0,linkEnd),fixture};
};
