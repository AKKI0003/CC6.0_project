import {useEffect,useRef,useState} from 'react';
import {COL} from './scene3d.js';
export const post=(u,b)=>fetch('/api/'+u,{method:'POST',...(b?{headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:{})});
export const fmt=b=>b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB';

export function useCount(v,d=700){const [x,setX]=useState(v),a=useRef(v);
  useEffect(()=>{const f=a.current,t0=performance.now();let raf;const s=t=>{const p=Math.min(1,(t-t0)/d),e=1-Math.pow(1-p,3);a.current=f+(v-f)*e;setX(a.current);if(p<1)raf=requestAnimationFrame(s)};raf=requestAnimationFrame(s);return()=>cancelAnimationFrame(raf)},[v]);return x}

export function Kpi({l,v,c,unit='',dec=0,sub}){const x=useCount(v);return <div className="glass kpi" style={{'--c':c}}><div className="l">{l}</div><div className="v">{x.toFixed(dec)}{unit}</div><div className="s">{sub}</div></div>}

export function Ask({id}){
  const [q,setQ]=useState(''),[a,setA]=useState(null),[busy,setBusy]=useState(false);
  const go=async()=>{if(!q.trim())return;setBusy(true);try{setA(await(await post(id+'/ask',{q})).json())}finally{setBusy(false)}};
  return <div><div className="ctl"><input className="ask" value={q} placeholder="Is the aisle at (11,7) blocked?" onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&go()}/><button onClick={go} disabled={busy}>{busy?'…':'Ask'}</button></div>
    <div className="mu">Answers only from this robot’s local Edge memory. Works offline.</div>
    {a&&<div className="card"><div>{a.answer}</div><div className="mu mono">{a.cites.length?'cites '+a.cites.map(c=>'#'+c).join(' '):'no memory used'}{a.model?' · '+a.model:''}</div></div>}</div>}

export function Vitals({v}){const cell=(l,val,sub,w)=><div className={'vc'+(w?' w':'')}><div className="l">{l}</div><div className="v">{val}</div><small>{sub}</small></div>;
  return <div className="vgrid">{cell('Mutable shard',fmt(v.mut_data),v.mut_count+' pts · disk '+fmt(v.mut_size))}{cell('Immutable shard',fmt(v.imm_data),v.imm_count+' pts · disk '+fmt(v.imm_size))}
    {cell('Query p50',v.query_p50.toFixed(2)+' ms','p95 '+v.query_p95.toFixed(2)+' ms')}{cell('Sync avg',v.sync_avg_ms.toFixed(0)+' ms',v.sync_count+' syncs')}
    <div className="vc w"><div className="l">Partial snapshot vs full re-download</div><div className="v">{fmt(v.last_snap_bytes)} <small>of {fmt(v.full_baseline_bytes)} measured full</small></div>
      <div className="bar"><i style={{width:Math.min(100,v.sync_saving_pct)+'%'}}/></div><small>{v.sync_saving_pct}% smaller · sizes are logical, disk includes preallocation</small></div></div>}

export function Chaos({c}){
  const [on,setOn]=useState(c.on),[lat,setLat]=useState(c.latency),[loss,setLoss]=useState(c.loss);
  useEffect(()=>{setOn(c.on);setLat(c.latency);setLoss(c.loss)},[c.on,c.latency,c.loss]);
  const push=(o,l,ls)=>post('chaos',{on:o,latency:l,loss:ls});
  return <details className="menu chaos-menu"><summary>{on?`🌩 Chaos · ${lat}ms/${loss}%`:'🌩 Chaos'}</summary>
    <div className="menu-pop chaos-pop">
      <button className={on?'on-btn':''} onClick={()=>{const o=!on;setOn(o);push(o,lat,loss)}}>{on?'● Chaos ON':'○ Chaos OFF'}</button>
      <label className="mu">Latency <b>{lat} ms</b><input type="range" min="0" max="1500" step="50" value={lat} onChange={e=>{const v=+e.target.value;setLat(v);push(on,v,loss)}}/></label>
      <label className="mu">Packet loss <b>{loss}%</b><input type="range" min="0" max="80" step="5" value={loss} onChange={e=>{const v=+e.target.value;setLoss(v);push(on,lat,v)}}/></label>
      <div className="mu chaos-note">Delays and randomly drops uplink syncs, so you can see the fleet recover once it's off.</div>
    </div>
  </details>}

export function Footprint(){const [b,setB]=useState(null),[busy,setBusy]=useState(false);
  const go=async()=>{setBusy(true);try{setB(await(await post('footprint')).json())}finally{setBusy(false)}};
  return <div><button onClick={go} disabled={busy}>{busy?'measuring…':'⚖ Footprint benchmark: Float32 vs Float16'}</button>
    {b&&<div className="card"><div className="mono">{b.points} memories · disk {b.Float32.disk_kb} KB → {b.Float16.disk_kb} KB · top-1 {b.Float32.top1_ok} vs {b.Float16.top1_ok}</div><div className="r">Float16 vectors use {b.disk_saving_pct}% less disk (measured on scratch Edge shards)</div></div>}</div>}
