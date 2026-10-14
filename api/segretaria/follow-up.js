// Authenticated operator surface. No model calls, notifications or execution.
import { requireRole } from '../_auth.js';
import { fsGet, fsGetVersioned, fsCommit, readJson } from '../homie/_lib.js';
import { personaDossier } from './_persona.js';
import { listFollowUps, updateFollowUp, validFollowUpCursor, currentPreparationReview, conversationFollowUps, startConversationFollowUp } from './_follow-up.js';
import { readPreparationDelivery } from './_dispatch.js';
import { readPreparationMonitor } from './_monitor.js';

async function withDelivery(task, read = true) {
  task = { ...task, preparationReview: currentPreparationReview(task) };
  const approval = task.preparation?.approval;
  if (!approval) return task;
  const unavailable = { code: 503, confirmed: true, delivery: 'needs_review', error: 'delivery_state_unavailable' };
  if (!read || (approval.actionId && !/^sgreply_[a-f0-9]{40}$/.test(approval.actionId))) return { ...task, deliveryResult: unavailable };
  try { return { ...task, deliveryResult: await readPreparationDelivery(task.id, approval.actionId, true) }; }
  catch { return { ...task, deliveryResult: unavailable }; }
}

async function invalidateManualDecision(id, lastMessageId) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await fsGetVersioned('operatorTasks/' + id);
    if (current?.data.status !== 'open' || current.data.followUp?.lastMessageId !== lastMessageId || current.data.followUp.needsReview) return;
    try {
      await fsCommit([{docPath:'operatorTasks/'+id, fields:{followUp:{...current.data.followUp,needsReview:true}},
        precondition:{updateTime:current.updateTime}}]);
      return;
    } catch (error) { if (!error.conflict) throw error; }
  }
  throw new Error('manual_review_conflict');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;
  try {
    if (req.method === 'GET' && req.query?.conversationId) {
      const found=await conversationFollowUps(req.query.conversationId);
      return res.status(found.code).json({ok:found.code===200,rows:found.rows,source:found.source,
        incomplete:found.incomplete,sourceUnavailable:found.sourceUnavailable,error:found.error});
    }
    if (req.method === 'GET' && !req.query?.id) {
      const afterId = req.query?.after ?? null;
      if (afterId !== null && !validFollowUpCursor(afterId)) return res.status(400).json({ ok: false, error: 'invalid_cursor' });
      const [list, monitoring] = await Promise.all([listFollowUps({ afterId }), readPreparationMonitor()]);
      let reads = 0;
      const rows = await Promise.all(list.rows.map(t => withDelivery(t, !t.preparation?.approval?.actionId || ++reads <= 20)));
      return res.status(200).json({ ok: true, ...list, rows, deliveryIncomplete: reads > 20, monitoring });
    }
    const body = req.method === 'POST' ? await readJson(req) : { id: req.query.id };
    if (req.method==='POST' && body?.op==='start') {
      const result=await startConversationFollowUp({cid:body.conversationId,messageId:body.messageId,actor:auth.uid,taskId:body.taskId});
      return res.status(result.code).json({ok:result.code===200,...result});
    }
    if (!/^sg_[a-f0-9]{32}$/.test(String(body?.id || ''))) return res.status(400).json({ ok: false, error: 'invalid_case' });
    const task = await fsGet('operatorTasks/' + body.id);
    if (!task?.followUp || task.source !== 'segretaria') return res.status(404).json({ ok: false, error: 'case_not_found' });
    const cid = task.followUp.conversationId;
    if (!/^[\w.-]{1,180}$/.test(String(cid || ''))) return res.status(400).json({ ok: false, error: 'invalid_conversation' });
    const conversationSnapshot = await fsGetVersioned('conversations/' + cid);
    const conv = conversationSnapshot?.data;
    if (!conv) return res.status(409).json({ ok: false, error: 'conversation_missing' });
    const dossier = await personaDossier({ phone: conv.contactPhone, email: conv.contactEmail,
      leadId: conv.leadId || (conv.contactType === 'lead' ? conv.contactId : undefined), conversationId: cid });
    if (req.method === 'GET') return res.status(200).json({ ok: true, task: await withDelivery(task), dossier });
    const sourceGuards=[{docPath:'conversations/'+cid,fields:{},precondition:{updateTime:conversationSnapshot.updateTime}}];
    if(task.manualIntake && ['confirm','close'].includes(body.op)) {
      const found=await conversationFollowUps(cid);
      if(found.conversation?.updateTime!==conversationSnapshot.updateTime) return res.status(409).json({ok:false,error:'practice_not_verified'});
      if(found.code!==200 || found.sourceUnavailable || found.incomplete || !found.source) return res.status(409).json({ok:false,error:'source_message_missing'});
      if(found.source.eventId!==task.followUp.lastMessageId && Date.parse(found.source.at)>=Date.parse(task.followUp.lastInboundAt)) {
        await invalidateManualDecision(task.id, task.followUp.lastMessageId);
        await startConversationFollowUp({cid,messageId:found.source.id,actor:auth.uid,taskId:task.id});
        return res.status(409).json({ok:false,error:'new_message_reload'});
      }
    }
    const result = await updateFollowUp({ id: body.id, input: body, actor: auth.uid, dossier, sourceGuards });
    // Ingestion persists the message before patching its conversation header.
    // A query cannot be a Firestore write precondition: recheck persisted
    // evidence before claiming success, including this split-write window.
    if (task.manualIntake && result.code === 200) {
      let found;
      try { found = await conversationFollowUps(cid); } catch { found = null; }
      if (!found || found.code !== 200 || found.incomplete || found.sourceUnavailable || !found.source) {
        await invalidateManualDecision(body.id, body.lastMessageId);
        return res.status(503).json({ok:false,error:'follow_up_unavailable'});
      }
      if (found.source.eventId !== body.lastMessageId && Date.parse(found.source.at) >= Date.parse(task.followUp.lastInboundAt)) {
        await invalidateManualDecision(body.id, body.lastMessageId);
        const refreshed = await startConversationFollowUp({cid,messageId:found.source.id,actor:auth.uid,...(result.closed ? {} : {taskId:task.id})});
        return res.status(refreshed.code === 200 ? 409 : refreshed.code).json({ok:false,error:refreshed.code === 200 ? 'new_message_reload' : refreshed.error});
      }
    }
    return res.status(result.code).json({ ok: result.code === 200, ...result });
  } catch {
    // Do not log payload, contact data, database errors or model context.
    return res.status(503).json({ ok: false, error: 'follow_up_unavailable' });
  }
}
