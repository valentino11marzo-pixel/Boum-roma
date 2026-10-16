(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BOOM_TENANT_WORKSPACE=factory()})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var categories=['idraulica','elettricita','elettrodomestici','riscaldamento','serrature','altro'];
  function id(v){return typeof v==='string'&&/^[\w-]{1,180}$/.test(v)}
  function url(v){try{var u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch(e){return ''}}
  function status(v){return v==='pending'?'open':v==='done'?'resolved':v||'open'}
  function input(b){
    var description=typeof b.description==='string'?b.description.trim():'';
    var availability=typeof b.availability==='string'?b.availability.trim():'';
    var priority=b.priority==='emergency'?'urgent':b.priority;
    if(description.length<8||description.length>3000||availability.length>500||categories.indexOf(b.category)<0||['normal','high','urgent'].indexOf(priority)<0)return null;
    return {description:description,availability:availability,category:b.category,priority:priority};
  }
  function documents(rows,c,uid){
    var seen={};return rows.filter(function(d){
      if(d.contractId&&d.contractId!==c.id)return false;
      if(d.propertyId&&d.propertyId!==c.propertyId)return false;
      // Property sharing alone cannot prove access to a previous tenant's file.
      return d.userId===uid||(d.shared===true&&d.contractId===c.id&&!d.userId);
    }).map(function(d){return {id:d.id,name:String(d.name||d.fileName||d.title||'Document'),type:String(d.type||d.category||'document'),url:url(d.fileUrl||d.url||d.downloadUrl),createdAt:String(d.createdAt||'')}})
      .filter(function(d){if(!d.url||seen[d.url])return false;seen[d.url]=true;return true})
      .sort(function(a,b){return b.createdAt.localeCompare(a.createdAt)});
  }
  function ticket(m){return {id:m.id,contractId:m.contractId||'',category:m.category||'altro',priority:m.priority==='emergency'?'urgent':m.priority||'normal',description:m.description||'',availability:m.availability||'',status:status(m.status),createdAt:m.createdAt||'',updatedAt:m.updatedAt||m.createdAt||'',revision:m.revision||0,editable:m.source==='tenant-dashboard'&&['open','in_progress'].indexOf(status(m.status))>=0,delivery:'not_configured'};}
  return {id:id,url:url,status:status,input:input,documents:documents,ticket:ticket,categories:categories};
});
