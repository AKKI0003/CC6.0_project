import {useEffect,useRef,useState} from 'react';
import {Warehouse3D,COL,N} from './scene3d.js';
import {post,Kpi,Ask,Vitals,Chaos,Footprint} from './parts.jsx';
const SH=new Set();for(const [a,b,c,d] of [[2,5,3,4],[9,12,3,4],[2,5,10,11],[9,12,10,11]])for(let x=a;x<=b;x++)for(let y=c;y<=d;y++)SH.add(x+','+y);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),isInh=(m,id)=>m.sources.length>1||m.sources[0]!==id;

function Stage3D({s,sel,opt,sc}){const el=useRef();
  useEffect(()=>{const w=new Warehouse3D(el.current,SH);sc.current=w;return()=>{w.dispose();sc.current=null}},[]);
  useEffect(()=>{sc.current&&sc.current.update(s,sel,opt)},[s,sel,opt]);
  return <div className="three" ref={el}/>}

function MiniMap({s,sel}){const cv=useRef(),Z=13,S=N*Z;
  useEffect(()=>{const c=cv.current.getContext('2d'),r=s.robots[sel];c.clearRect(0,0,S,S);c.fillStyle='#070b12';c.fillRect(0,0,S,S);
    c.fillStyle='#22324a';SH.forEach(k=>{const [x,y]=k.split(',').map(Number);c.fillRect(x*Z+1,y*Z+1,Z-2,Z-2)});
    c.fillStyle='rgba(255,92,122,.16)';s.dyn.forEach(([x,y])=>c.fillRect(x*Z+2,y*Z+2,Z-4,Z-4));
    r.mem.forEach(m=>{c.fillStyle=m.kind==='clear'?'#4ade80':isInh(m,sel)?'#b388ff':'#ff5c7a';c.fillRect(m.x*Z+3,m.y*Z+3,Z-6,Z-6)});
    c.strokeStyle='rgba(255,255,255,.55)';c.setLineDash([2,3]);c.beginPath();c.moveTo(r.pos[0]*Z+Z/2,r.pos[1]*Z+Z/2);r.path.forEach(p=>c.lineTo(p[0]*Z+Z/2,p[1]*Z+Z/2));c.stroke();c.setLineDash([]);
    c.strokeStyle=COL[sel];c.lineWidth=2;c.beginPath();r.trail.forEach((p,i)=>i?c.lineTo(p[0]*Z+Z/2,p[1]*Z+Z/2):c.moveTo(p[0]*Z+Z/2,p[1]*Z+Z/2));c.stroke();c.lineWidth=1;
    c.strokeStyle='#4ade80';c.beginPath();c.arc(r.goal[0]*Z+Z/2,r.goal[1]*Z+Z/2,5,0,7);c.stroke();
    Object.entries(s.robots).forEach(([id,q])=>{c.fillStyle=COL[id];c.beginPath();c.arc(q.pos[0]*Z+Z/2,q.pos[1]*Z+Z/2,id===sel?5:3.5,0,7);c.fill()})},[s,sel]);
  return <div className="mini"><div className="eyebrow">Minimap · Robot {sel}'s knowledge</div><canvas ref={cv} width={S} height={S}/>
    <div className="lg"><span style={{color:'#ff5c7a'}}>■</span> learned <span style={{color:'#b388ff'}}>■</span> inherited <span style={{color:'#4ade80'}}>■</span> cleared</div></div>}

export default function App(){
  const [s,setS]=useState(null),[down,setDown]=useState(false),[merge,setMerge]=useState(0),[flash,setFlash]=useState(0),[j,setJ]=useState(null),[rep,setRep]=useState(null),
    [sel,setSel]=useState('A'),[ghost,setGhost]=useState(true),[replay,setReplay]=useState(null),[tab,setTab]=useState('mem'),[seed,setSeed]=useState('');
  const sc=useRef(),seen=useRef(-1),live=useRef(null),abort=useRef(false),mt=useRef();live.current=s;
  useEffect(()=>{
    const onData=d=>{setS(d);setDown(false);const last=d.events.at(-1)?.id||0;
      if(seen.current>=0){let i=0,mg=0;for(const e of d.events.filter(e=>e.id>seen.current)){
        if((e.kind==='push'||e.kind==='pull')&&i++<6)setTimeout(()=>sc.current&&sc.current.emit(e.kind,e.robot),i*150);if(e.kind==='merge')mg++}
        if(mg){setMerge(mg);setFlash(f=>f+1);sc.current&&sc.current.emit('merge');clearTimeout(mt.current);mt.current=setTimeout(()=>setMerge(0),5000)}}
      seen.current=last};
    let es,fb;try{es=new EventSource('/api/stream');es.onmessage=e=>{try{onData(JSON.parse(e.data))}catch{}};es.onerror=()=>setDown(true)}
    catch{fb=setInterval(async()=>{try{onData(await(await fetch('/api/state')).json())}catch{setDown(true)}},250)}
    return()=>{es&&es.close();fb&&clearInterval(fb)}},[]);
  const waitDone=async id=>{await sleep(900);for(let i=0;i<300&&!abort.current;i++){const r=live.current.robots[id];if(r.done&&!r.running)return;await sleep(300)}};
  const STEPS=['New world','A learns offline','B learns offline','Offline proof','Reconnect and merge','B inherits','A inherits','Mission report'];
  const judge=async()=>{abort.current=false;setRep(null);const say=(i,t,who)=>{if(abort.current)throw 0;setJ({i,t});if(who)setSel(who)};let off=0;
    try{say(0,'A brand-new random warehouse: pallets and forklifts are placed by chance. No network. Empty memory.','A');await post('reset');await post('speed/2');sc.current&&sc.current.view('iso');await sleep(1800);
      say(1,'Robot A drives its route offline. Each obstacle it finds is written to its own Qdrant Edge shard.','A');await post('A/run');await waitDone('A');
      say(2,'Robot B learns a different part of the warehouse. Still offline.','B');await post('B/run');await waitDone('B');
      const R=live.current.robots;off=R.A.uplink+R.B.uplink;say(3,`Both robots learned and rerouted with local vector search only: ${off} uplink calls.`);await sleep(4500);
      say(4,'Connectivity returns. Memories fly to the fleet tower, merge, and flow back.');await post('A/online/1');await sleep(2500);await post('B/online/1');await sleep(7000);
      say(5,'Robot B drives A’s route. It never saw these obstacles. It inherited them.','B');await post('B/mission/1');await sleep(500);await post('B/run');await waitDone('B');
      say(6,'Robot A drives B’s route with fleet knowledge.','A');await post('A/mission/1');await sleep(500);await post('A/run');await waitDone('A');
      say(7,'Mission report');await sleep(1200);const L=live.current,rs=Object.values(L.robots),runs=rs.flatMap(r=>r.runs),m2=runs.filter(x=>x.mission===2);
      setRep({avoided:runs.reduce((a,x)=>a+Math.max(0,x.raw_hits-x.hits),0),naive:m2.reduce((a,x)=>a+x.raw_hits,0),off,eff:Math.round(runs.reduce((a,x)=>a+x.eff,0)/Math.max(1,runs.length)),p50:Math.max(...rs.map(r=>r.vitals.query_p50)),save:Math.max(...rs.map(r=>r.vitals.sync_saving_pct)),merged:L.fleet.filter(m=>m.sources.length>1).length,inh:m2.reduce((a,x)=>a+x.inh0,0)})
    }catch(e){}finally{setJ(null);post('speed/1')}};
  const playReplay=r=>{if(!r.trail||r.trail.length<2||replay)return;let i=0;setReplay(r.trail[0]);const iv=setInterval(()=>{i++;if(i>=r.trail.length){clearInterval(iv);setReplay(null);return}setReplay(r.trail[i])},130)};
  const newWorld=()=>{abort.current=true;setJ(null);setRep(null);setMerge(0);post('reset'+(seed?'?seed='+seed:''))};
  if(!s)return <div className="err">{down?<>Backend not reachable. Start it with <code>python main.py</code> in the server folder, then open <code>http://localhost:8000</code>.</>:'Connecting…'}</div>;
  const ids=Object.keys(s.robots),r=s.robots[sel],rs=Object.values(s.robots),runs=rs.flatMap(x=>x.runs),avoided=runs.reduce((a,x)=>a+Math.max(0,x.raw_hits-x.hits),0),
    eff=runs.length?Math.round(runs.reduce((a,x)=>a+x.eff,0)/runs.length):0,p50=Math.max(...rs.map(x=>x.vitals.query_p50)),lastB=s.robots.B.runs.at(-1),merges=s.events.filter(e=>e.kind==='merge').slice(-2).reverse(),
    feed=[...s.events].reverse().filter(e=>e.kind!=='merge').slice(0,4);
  return <>
    {flash>0&&<div className="edge" key={flash}/>}
    <header className="top"><div className="brand"><svg width="34" height="34" viewBox="0 0 40 40"><path d="M20 3l14 8v18l-14 8-14-8V11z" fill="none" stroke="#38d5ff" strokeWidth="2"/><circle cx="20" cy="20" r="5" fill="#b388ff"/><path d="M20 15V8M25 22l6 4M15 22l-6 4" stroke="#ffb454" strokeWidth="2" strokeLinecap="round"/></svg><div><h1>FleetMind</h1><p>Offline-first robot memory · Qdrant Edge</p></div></div>
      <span className="sp"/><span className="chip">world #{s.world.seed}</span>{s.chaos&&s.chaos.on&&<span className="chip warn">🌩 chaos on</span>}{down&&<span className="chip warn">backend lost</span>}
      <button className="judge" onClick={judge} disabled={!!j}>▶ Judge Mode</button>
      <details className="menu"><summary>⋯</summary><div className="menu-pop">
        <div className="row"><input className="ask" placeholder="seed (optional)" value={seed} onChange={e=>setSeed(e.target.value.replace(/\D/g,''))}/><button onClick={newWorld}>🎲 New world</button></div>
        <button onClick={()=>post('spawn')}>⚠ Drop a pallet on a route</button><button onClick={()=>post('obstacle-moved')}>Remove a random pallet</button><Chaos c={s.chaos||{on:false,latency:0,loss:0}}/></div></details></header>
    <section className="stage">
      <Stage3D s={s} sel={sel} opt={{ghost,replay}} sc={sc}/>
      <div className="ov tl">{ids.map(id=><button key={id} className={'rc'+(sel===id?' on':'')} style={{'--c':COL[id]}} onClick={()=>setSel(id)}><i/>Robot {id}<small>{s.robots[id].status}</small></button>)}</div>
      <div className="ov tr"><div className="st"><b>{avoided}</b><span>collisions avoided</span></div><div className="st"><b>{eff||'–'}{eff?'%':''}</b><span>route efficiency</span></div><div className="st"><b>{p50.toFixed(2)}</b><span>ms local query</span></div></div>
      <div className={'ov dock'+(j?' hide':'')}>
        <button className="pri" onClick={()=>post(sel+(r.running?'/pause':'/run'))}>{r.running?'❚❚ Pause':'▶ Run mission '+(r.mission+1)}</button>
        <button onClick={()=>post(sel+'/rerun')}>↺</button><button onClick={()=>post(sel+'/mission/'+(1-r.mission))}>Mission {2-r.mission}</button>
        <button className={'link '+(r.online?'on':'off')} onClick={()=>post(sel+'/online/'+(r.online?0:1))}>{r.online?'● Uplink on':'○ Offline'}</button>
        <span className={'lock '+(r.uplink===0?'ok':'')}>{r.uplink===0?'🔒 0 uplink calls':'📡 '+r.uplink+' calls'}</span>
        <span className="vs"><button onClick={()=>sc.current.view('iso')}>3D</button><button onClick={()=>sc.current.view('top')}>Top</button><button onClick={()=>sc.current.view('follow')}>Follow</button>
        <button className={ghost?'on':''} onClick={()=>setGhost(!ghost)}>👻</button><button disabled={!r.done||!!replay} onClick={()=>playReplay(r)}>⏵ Replay</button></span></div>
      <div className="ov br"><MiniMap s={s} sel={sel}/></div>
      {j&&<div className="cap"><button onClick={()=>{abort.current=true}}>Exit</button><div className="stp">Step {j.i+1} / {STEPS.length} · {STEPS[j.i]}</div><p>{j.t}</p><div className="dots">{STEPS.map((_,i)=><i key={i} className={i<=j.i?'on':''}/>)}</div></div>}
    </section>
    <section className="cards">
      <div className="glass card1"><div className="ct"><h3>Robot {sel} memory</h3><div className="tabs">{[['mem','Memory'],['why','Why this route'],['ask','Ask'],['log','Log']].map(([k,l])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}</button>)}</div></div>
        <div className="pane">{tab==='mem'&&(r.mem.length?r.mem.map((m,i)=><div key={i} className={'mem '+(isInh(m,sel)?'inh':'own')}>{isInh(m,sel)?'◇ fleet · ':'✕ mine · '}{m.text}</div>):<div className="mu">Empty. Run a mission and Robot {sel} will learn.</div>)}
          {tab==='why'&&(r.explain?<div><div className="cd"><b>Last plan at ({r.explain.pos.join(',')})</b><div>Plain A*: {r.explain.raw} steps · with memory: <b>{r.explain.mem}</b>. Remembered obstacles are walls, so this is the shortest route the robot knows.</div></div>{r.explain.hits.map(h=><div key={h.id} className="mem mu">🔎 #{h.id} similarity {h.score} · [{h.sources.join('+')}]</div>)}</div>:<div className="mu">No plan yet.</div>)}
          {tab==='ask'&&<Ask id={sel}/>}{tab==='log'&&r.log.map((t,i)=><div key={i} className="mem mu">{t}</div>)}</div></div>
      <div className="glass card2"><div className="ct"><h3>Fleet memory</h3><span className="chip">{s.fleet.length} shared</span></div>
        {merge>0&&<div className="banner">⚡ Merge · {merge} overlapping memor{merge>1?'ies':'y'} reconciled</div>}
        {merges.length?merges.map(e=><div className="cd" key={e.id}><b>{e.type}</b><div style={{color:COL.A}}>{e.a}</div><div style={{color:COL.B}}>{e.b}</div><div className="ok">→ {e.result}</div></div>):<div className="mu" style={{padding:'6px 0'}}>Nothing merged yet. Let two robots learn, then reconnect them.</div>}
        <div className="feed mono">{feed.map(e=><div key={e.id} style={{color:COL[e.robot]||'var(--mu)'}}>{e.text.slice(0,84)}</div>)}</div></div>
      <div className="glass card3"><div className="ct"><h3>Results</h3></div><table><thead><tr><th>Robot</th><th>Run</th><th>Inherited</th><th>Bumps</th><th>Avoided</th><th>Efficiency</th></tr></thead>
        <tbody>{ids.flatMap(id=>s.robots[id].runs.map((x,i)=><tr key={id+i}><td style={{color:COL[id],fontWeight:700}}>{id}</td><td>{x.mission}</td><td>{x.inh0}</td><td>{x.hits}</td><td className={x.raw_hits-x.hits>0?'ok':''}>{Math.max(0,x.raw_hits-x.hits)}</td><td>{x.eff}%</td></tr>))}{!runs.length&&<tr><td colSpan="6" className="mu">No finished runs yet.</td></tr>}</tbody></table>
        {lastB&&lastB.inh0>0&&lastB.hits<lastB.raw_hits&&<div className="win">Robot B avoided {lastB.raw_hits-lastB.hits} obstacle(s) it never saw itself.</div>}</div>
    </section>
    <details className="adv glass"><summary>Advanced · Edge vitals, footprint benchmark</summary><div className="advg"><div><div className="eyebrow">Edge vitals · Robot {sel}</div><Vitals v={r.vitals}/></div><Footprint/></div></details>
    {rep&&<div className="modal" onClick={()=>setRep(null)}><div className="glass rep" onClick={e=>e.stopPropagation()}><div className="eyebrow">Mission report · all numbers measured live</div><h2>Fleet memory works</h2>
      <p>Each robot inherited what the other learned offline, then avoided {rep.avoided} of the {rep.naive} obstacles a naive route would have hit.</p>
      <div className="g"><Kpi l="Collisions avoided" v={rep.avoided} c="#4ade80" sub={`of ${rep.naive} a naive route would hit`}/><Kpi l="Uplink calls while offline" v={rep.off} c="#38d5ff" sub="learning and rerouting were local"/><Kpi l="Route efficiency" v={rep.eff} unit="%" c="#ffb454" sub="vs ideal route with full knowledge"/>
      <Kpi l="Local query p50" v={rep.p50} dec={2} unit=" ms" c="#38d5ff" sub="Qdrant Edge search"/><Kpi l="Sync smaller than full" v={rep.save} dec={1} unit="%" c="#b388ff" sub="partial snapshot"/><Kpi l="Inherited memories used" v={rep.inh} c="#b388ff" sub="never seen first-hand"/></div>
      <button className="judge" onClick={()=>{setRep(null);judge()}}>↺ Replay in a new world</button> <button onClick={()=>setRep(null)}>Close</button></div></div>}
  </>}
