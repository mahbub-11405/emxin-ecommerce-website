'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import {PageHead,Empty,Loading,toast} from '@/components/ui';
import {api,dt} from '@/lib/api';
export default function Audit(){const[rows,setRows]=useState<any[]|null>(null);useEffect(()=>{api('/admin/audit-logs').then(setRows).catch(e=>{toast.err(e.message);setRows([])})},[]);
  return <Shell><PageHead title="Audit Log" sub="Who changed what — logins, orders, catalog, dealers, coupons, campaigns. Super Admin only."/><div className="card flush">{!rows?<Loading/>:rows.length?<table className="tbl"><thead><tr><th>When</th><th>Role</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>{rows.map(r=><tr key={r._id}><td className="nowrap">{dt(r.created_at)}</td><td>{r.actor_role}</td><td><b>{String(r.action).replaceAll('_',' ')}</b></td><td className="mono">{r.target_id||'—'}</td><td><small className="muted">{Object.entries(r.metadata||{}).map(([k,v])=>`${k}: ${typeof v==='object'?JSON.stringify(v):v}`).join(' · ')}</small></td></tr>)}</tbody></table>:<Empty text="No audit events yet."/>}</div></Shell>}
