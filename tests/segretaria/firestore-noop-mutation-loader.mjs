// Reintroduce one defect in real production modules; never edit files on disk.
// This loader cannot replace the raw network/storage model or assertions.
import { writeSync } from 'node:fs';
const taskGuard = `{ docPath: 'operatorTasks/' + action.segretaria.caseId, fields: {},
        precondition: { updateTime: task.updateTime } },`;
const conversationGuard = `{ docPath: 'conversations/' + action.segretaria.conversationId,
        fields: {},
        precondition: { updateTime: conversation.updateTime } },`;
const mutations = {
  old_task_rewrite: ['api/segretaria/_delivery-guard.js', taskGuard,
    taskGuard.replace('fields: {}', 'fields: { preparation: task.data.preparation }')],
  old_contact_rewrite: ['api/segretaria/_delivery-guard.js', conversationGuard,
    conversationGuard.replace('fields: {}', 'fields: { contactPhone: conversation.data.contactPhone || null, contactEmail: conversation.data.contactEmail || null }')],
  omitted_mask: ['api/homie/_lib.js', 'updateMask: { fieldPaths: Object.keys(w.fields) }, currentDocument: w.precondition',
    'currentDocument: w.precondition'],
  omitted_precondition: ['api/homie/_lib.js', 'updateMask: { fieldPaths: Object.keys(w.fields) }, currentDocument: w.precondition',
    'updateMask: { fieldPaths: Object.keys(w.fields) }'],
  weakened_precondition: ['api/homie/_lib.js', 'updateMask: { fieldPaths: Object.keys(w.fields) }, currentDocument: w.precondition',
    'updateMask: { fieldPaths: Object.keys(w.fields) }, currentDocument: { exists: true }'],
  omitted_task_guard: ['api/segretaria/_delivery-guard.js', taskGuard, ''],
  omitted_conversation_guard: ['api/segretaria/_delivery-guard.js', conversationGuard, ''],
  old_execution_task: ['api/segretaria/_execution-guard.js', "{ docPath: 'operatorTasks/' + s.caseId, fields: {},",
    "{ docPath: 'operatorTasks/' + s.caseId, fields: { preparation: task.data.preparation },"],
  old_approval_contact: ['api/segretaria/_dispatch.js', "{ docPath: 'conversations/' + f.conversationId, fields: {},",
    "{ docPath: 'conversations/' + f.conversationId, fields: { contactPhone: conv.contactPhone || null, contactEmail: conv.contactEmail || null },"],
  old_approval_proof: ['api/segretaria/_dispatch.js', '{ docPath: contactProof.ref, fields: {},',
    '{ docPath: contactProof.ref, fields: { phone: contactProof.data.phone },'],
};
export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context), name = process.env.FIRESTORE_NOOP_MUTATION;
  const mutation = mutations[name];
  if (!mutation || !url.endsWith('/' + mutation[0])) return loaded;
  const source = String(loaded.source);
  if (source.split(mutation[1]).length !== 2) throw new Error('mutation_target_not_unique_' + name);
  writeSync(2, 'MUTATION_APPLIED:' + name + '\n');
  return { ...loaded, source: source.replace(mutation[1], mutation[2]) };
}
