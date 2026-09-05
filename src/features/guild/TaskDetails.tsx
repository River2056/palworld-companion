import { useState } from 'react';
import type { Task, TaskInput } from './client';
export function TaskDetails({ task, disabled, onSave }: { task?: Task; disabled: boolean; onSave: (values: Partial<TaskInput>) => void }) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [type, setType] = useState(task?.task_type ?? 'general');
  const [description, setDescription] = useState(task?.description ?? '');
  const [requested, setRequested] = useState(task?.requested_quantity ?? 0);
  const [delivered, setDelivered] = useState(task?.delivered_quantity ?? 0);
  const [source, setSource] = useState(task?.source_id ?? '');
  const [requirement, setRequirement] = useState(task?.source_requirement_id ?? '');
  const [checksum, setChecksum] = useState(task?.snapshot_checksum ?? '');
  const [reconfirm, setReconfirm] = useState(false);
  const [status, setStatus] = useState<Task['status']>(task?.status ?? 'open');
  const valid = title.trim() && type.trim() && Number.isSafeInteger(requested) && Number.isSafeInteger(delivered) && requested >= 0 && delivered >= 0 && delivered <= requested;
  const changed = !!task?.source_requirement_id && checksum !== (task.snapshot_checksum ?? '');
  return <form onSubmit={e => { e.preventDefault(); if (!valid || (changed && !reconfirm)) return; onSave({ p_title: title.trim(), p_status: status, p_type: type.trim(), p_description: description, p_requested: requested, p_delivered: delivered, p_source: source || null, p_source_requirement: requirement || null, p_checksum: checksum || null, p_reconfirm: reconfirm }); }}><fieldset disabled={disabled}>
    <legend>{task ? 'Edit shared task' : 'Create detailed shared task'}</legend>
    <label>{task ? 'Edit title' : 'Detailed task title'}<input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
    <label>Task type<input required maxLength={80} value={type} onChange={e => setType(e.target.value)} /></label>
    <label>Description<textarea maxLength={10000} value={description} onChange={e => setDescription(e.target.value)} /></label>
    <label>Requested quantity<input type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} value={requested} onChange={e => setRequested(e.target.valueAsNumber)} /></label>
    <label>Delivered quantity<input type="number" min={0} max={requested} step={1} value={delivered} onChange={e => setDelivered(e.target.valueAsNumber)} /></label>
    <label>Status<select value={status} onChange={e => setStatus(e.target.value as Task['status'])}>{(['open','doing','done','blocked','cancelled'] as const).map(s => <option key={s} value={s}>{s}</option>)}</select></label>
    <label>Source reference<input maxLength={200} value={source} onChange={e => setSource(e.target.value)} /></label>
    <label>Source requirement identity<input maxLength={300} readOnly={!!task?.source_requirement_id} value={requirement} onChange={e => setRequirement(e.target.value)} /></label>
    <label>Source checksum<input maxLength={128} value={checksum} onChange={e => { setChecksum(e.target.value); setReconfirm(false); }} /></label>
    {changed && <label><input type="checkbox" checked={reconfirm} onChange={e => setReconfirm(e.target.checked)} />I reconfirm the changed source plan and quantities</label>}
    <button disabled={!valid || (changed && (!reconfirm || !checksum))}>{task ? 'Save task' : 'Create detailed task'}</button>
  </fieldset></form>;
}
