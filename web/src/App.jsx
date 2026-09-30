import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Play,Pause,RotateCcw,RotateCw,Ghost,Wifi,WifiOff,Box,LayoutGrid,Crosshair,ScrollText,Table2,Cpu,ChevronRight} from 'lucide-react';
import {Warehouse3D,COL,N} from './scene3d.js';
import {post,Kpi,Ask,Vitals,Chaos,Footprint} from './parts.jsx';
import Landing from './Landing.jsx';
const SH=new Set();for(const [a,b,c,d] of [[2,5,3,4],[9,12,3,4],[2,5,10,11],[9,12,10,11]])for(let x=a;x<=b;x++)for(let y=c;y<=d;y++)SH.add(x+','+y);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),isInh=(m,id)=>m.sources.length>1||m.sources[0]!==id;

function Stage3D({s,sel,opt,sc}){const el=useRef();
  useEffect(()=>{const w=new Warehouse3D(el.current,SH);sc.current=w;return()=>{w.dispose();sc.current=null}},[]);
  useEffect(()=>{sc.current&&sc.current.update(s,sel,opt)},[s,sel,opt]);
  return <div className="three" ref={el}/>}

function MiniMap({s,sel}){const cv=useRef(),Z=13,S=N*Z;
  useEffect(()=>{const c=cv.current.getContext('2d'),r=s.robots[sel];c.clearRect(0,0,S,S);c.fillStyle='#0b0c0a';c.fillRect(0,0,S,S);
    c.fillStyle='#2a2a24';SH.forEach(k=>{const [x,y]=k.split(',').map(Number);c.fillRect(x*Z+1,y*Z+1,Z-2,Z-2)});
    c.fillStyle='rgba(177,92,72,.18)';s.dyn.forEach(([x,y])=>c.fillRect(x*Z+2,y*Z+2,Z-4,Z-4));
    r.mem.forEach(m=>{c.fillStyle=m.kind==='clear'?'#7cff67':isInh(m,sel)?'#B497CF':'#B15C48';c.fillRect(m.x*Z+3,m.y*Z+3,Z-6,Z-6)});
    c.strokeStyle='rgba(242,240,232,.5)';c.setLineDash([2,3]);c.beginPath();c.moveTo(r.pos[0]*Z+Z/2,r.pos[1]*Z+Z/2);r.path.forEach(p=>c.lineTo(p[0]*Z+Z/2,p[1]*Z+Z/2));c.stroke();c.setLineDash([]);
    c.strokeStyle=COL[sel];c.lineWidth=2;c.beginPath();r.trail.forEach((p,i)=>i?c.lineTo(p[0]*Z+Z/2,p[1]*Z+Z/2):c.moveTo(p[0]*Z+Z/2,p[1]*Z+Z/2));c.stroke();c.lineWidth=1;
    c.strokeStyle='#7C5CFF';c.lineWidth=1.5;c.strokeRect(r.start[0]*Z+3,r.start[1]*Z+3,Z-6,Z-6);
    c.strokeStyle='#7cff67';c.beginPath();c.arc(r.goal[0]*Z+Z/2,r.goal[1]*Z+Z/2,5,0,7);c.stroke();
    Object.entries(s.robots).forEach(([id,q])=>{c.fillStyle=COL[id];c.beginPath();c.arc(q.pos[0]*Z+Z/2,q.pos[1]*Z+Z/2,id===sel?5:3.5,0,7);c.fill()})},[s,sel]);
  return <div className="mini">
    <canvas ref={cv} width={S} height={S}/>
    <div className="mini-label">Robot {sel} knowledge</div>
  </div>}

function evKind(e){return e.kind==='push'||e.kind==='pull'?e.kind:e.kind==='merge'?'merge':'info'}
function evActor(e){return ['A','B','C','D'].includes(e.robot)?e.robot:'sys'}
function Timeline({events}){
  const rows=[...events].reverse().slice(0,60);
  return <div className="mtl">{rows.length?rows.map(e=><div key={e.id} className={'mtl-row '+evKind(e)}>
      <div className="mtl-t">{new Date(e.t*1000).toLocaleTimeString([],{hour12:false})}</div>
      <div className={'mtl-b '+evActor(e)}><b>{evActor(e)==='sys'?'Fleet':'Robot '+evActor(e)}</b><p>{e.text}</p></div>
    </div>):<div className="mtl-empty">No events yet — run a mission to start the timeline.</div>}</div>}

export default function App(){
  const [entered,setEntered]=useState(false),[xf,setXf]=useState(false),[liveOk,setLiveOk]=useState(true);
  useEffect(()=>{let alive=true;const t=async()=>{try{await fetch('/api/state');if(alive)setLiveOk(true)}catch{if(alive)setLiveOk(false)}};t();const iv=setInterval(t,4000);return()=>{alive=false;clearInterval(iv)}},[]);
  const enter=()=>{setXf(true);setTimeout(()=>{setEntered(true);window.scrollTo(0,0);setTimeout(()=>setXf(false),60)},520)};
  const leave=()=>{setXf(true);setTimeout(()=>{setEntered(false);window.scrollTo(0,0);setTimeout(()=>setXf(false),60)},420)};
  return <>
    <div className={'xfade'+(xf?' on':'')}/>
    {entered?<Console onBack={leave}/>:<Landing onEnter={enter} liveOk={liveOk}/>}
  </>}

function Console({onBack}){
  const [s,setS]=useState(null),[down,setDown]=useState(false),[merge,setMerge]=useState(0),[flash,setFlash]=useState(0),[j,setJ]=useState(null),[rep,setRep]=useState(null),
    [sel,setSel]=useState('A'),[ghost,setGhost]=useState(true),[replay,setReplay]=useState(null),[tab,setTab]=useState('mem'),[seed,setSeed]=useState(''),
    [panelTab,setPanelTab]=useState('timeline'),[view,setView]=useState('iso');
  const sc=useRef(),seen=useRef(-1),live=useRef(null),abort=useRef(false),mt=useRef();live.current=s;
  useEffect(()=>{
    const onData=d=>{setS(d);setDown(false);const last=d.events.at(-1)?.id||0;
      if(seen.current>=0){let i=0,mg=0;for(const e of d.events.filter(e=>e.id>seen.current)){
        if((e.kind==='push'||e.kind==='pull')&&i++<6)setTimeout(()=>sc.current&&sc.current.emit(e.kind,e.robot),i*150);if(e.kind==='merge')mg++}
        if(mg){setMerge(mg);setFlash(f=>f+1);sc.current&&sc.current.emit('merge');clearTimeout(mt.current);mt.current=setTimeout(()=>setMerge(0),5000)}}
      seen.current=last};
    let es,fb,got=false;
    const startPolling=()=>{if(fb)return;fb=setInterval(async()=>{try{onData(await(await fetch('/api/state')).json())}catch{setDown(true)}},250)};
    try{
      es=new EventSource('/api/stream');
      es.onmessage=e=>{got=true;try{onData(JSON.parse(e.data))}catch{}};
      es.onerror=()=>{setDown(true);startPolling()}; // SSE dropped (or never connected) — fall back rather than get stuck
      setTimeout(()=>{if(!got)startPolling()},2500); // and if it's just silent (no error, no message), fall back too
    }catch{startPolling()}
    return()=>{es&&es.close();fb&&clearInterval(fb)}},[]);
  const waitDone=async id=>{await sleep(900);for(let i=0;i<300&&!abort.current;i++){const r=live.current.robots[id];if(r.done&&!r.running)return;await sleep(300)}};
  const STEPS=['New world','A learns offline','B learns offline','Offline proof','Reconnect and merge','B inherits','A inherits','Mission report'];
  const judge=async()=>{abort.current=false;setRep(null);const say=(i,t,who)=>{if(abort.current)throw 0;setJ({i,t});if(who)setSel(who)};let off=0;
    try{say(0,'A brand-new random warehouse: pallets and forklifts are placed by chance. No network. Empty memory.','A');await post('reset');await post('speed/2');sc.current&&sc.current.view('iso');await sleep(1800);
      say(1,'Robot A drives its route offline. Each obstacle it finds is written to its own Qdrant Edge shard.','A');await post('A/run');await waitDone('A');
      say(2,'Robot B learns a different part of the warehouse. Still offline.','B');await post('B/run');await waitDone('B');
      const R=live.current.robots;off=R.A.uplink+R.B.uplink;say(3,`Both robots learned and rerouted with local vector search only: ${off} uplink calls.`);await sleep(4500);
      say(4,'Connectivity returns. Memories fly to the fleet tower, merge, and flow back.');await post('A/online/1');await sleep(2500);await post('B/online/1');await sleep(7000);
      say(5,'Robot B drives A\u2019s route. It never saw these obstacles. It inherited them.','B');await post('B/mission/1');await sleep(500);await post('B/run');await waitDone('B');
      say(6,'Robot A drives B\u2019s route with fleet knowledge.','A');await post('A/mission/1');await sleep(500);await post('A/run');await waitDone('A');
      say(7,'Mission report');await sleep(1200);const L=live.current,rs=Object.values(L.robots),runs=rs.flatMap(r=>r.runs),m2=runs.filter(x=>x.mission===2);
      setRep({avoided:runs.reduce((a,x)=>a+Math.max(0,x.raw_hits-x.hits),0),naive:m2.reduce((a,x)=>a+x.raw_hits,0),off,eff:Math.round(runs.reduce((a,x)=>a+x.eff,0)/Math.max(1,runs.length)),p50:Math.max(...rs.map(r=>r.vitals.query_p50)),save:Math.max(...rs.map(r=>r.vitals.sync_saving_pct)),merged:L.fleet.filter(m=>m.sources.length>1).length,inh:m2.reduce((a,x)=>a+x.inh0,0)})
    }catch(e){}finally{setJ(null);post('speed/1')}};
  const playReplay=r=>{if(!r.trail||r.trail.length<2||replay)return;let i=0;setReplay(r.trail[0]);const iv=setInterval(()=>{i++;if(i>=r.trail.length){clearInterval(iv);setReplay(null);return}setReplay(r.trail[i])},130)};
  const newWorld=()=>{abort.current=true;setJ(null);setRep(null);setMerge(0);post('reset'+(seed?'?seed='+seed:''))};
  if(!s)return <div className="console"><div className="err">{down?<>Backend not reachable. Start it with <code>python main.py</code> in the server folder, then open <code>http://localhost:8000</code>.</>:'Connecting…'}</div></div>;
  const ids=Object.keys(s.robots),r=s.robots[sel],rs=Object.values(s.robots),runs=rs.flatMap(x=>x.runs),avoided=runs.reduce((a,x)=>a+Math.max(0,x.raw_hits-x.hits),0),
    eff=runs.length?Math.round(runs.reduce((a,x)=>a+x.eff,0)/runs.length):0,p50=Math.max(...rs.map(x=>x.vitals.query_p50)),lastB=s.robots.B.runs.at(-1);
  return <div className="console">
    {flash>0&&<div className="edge" key={flash}/>}
    <div className="cnav"><nav className="island">
      <button className="back" onClick={onBack}><ArrowLeft size={14}/> Overview</button>
      <div className="word"><b>FleetMind</b><span>Live console</span></div>
      <span className="seed-tag">World <b>#{s.world.seed}</b></span>
      <span className="seed-tag"><span className={'pulse-dot'+(down?' down':s.chaos&&s.chaos.on?' warn':'')}/>{down?'Backend lost':s.chaos&&s.chaos.on?'Chaos active':'Live'}</span>
      <span className="grow"/>
      <button className="judge" onClick={judge} disabled={!!j}>Judge Mode</button>
      <details className="menu"><summary>Menu</summary><div className="menu-pop">
        <div className="menu-sect">World</div>
        <div className="row"><input className="ask" placeholder="seed (optional)" value={seed} onChange={e=>setSeed(e.target.value.replace(/\D/g,''))}/><button onClick={newWorld}>New world</button></div>
        <button onClick={()=>post('spawn')}>Drop a pallet on a route</button><button onClick={()=>post('obstacle-moved')}>Remove a random pallet</button>
        <div className="menu-sect">Network</div>
        <Chaos c={s.chaos||{on:false,latency:0,loss:0}}/></div></details>
    </nav></div>
    <section className="stage">
      <Stage3D s={s} sel={sel} opt={{ghost,replay}} sc={sc}/>
      <div className="ov tl"><div className="fleet-rail">{ids.map(id=><button key={id} className={'rpill'+(sel===id?' on':'')} style={{'--c':COL[id]}} onClick={()=>setSel(id)}>
        <i/>Robot {id}<small>{s.robots[id].status}</small></button>)}</div></div>
      <div className="ov tr"><div className="tele">
        <div className="stat"><b>{avoided}</b><span>Collisions avoided</span></div>
        <div className="stat"><b>{eff||'–'}{eff?'%':''}</b><span>Route efficiency</span></div>
        <div className="stat"><b>{p50.toFixed(2)}</b><span>ms query</span></div>
      </div></div>
      <div className={'ov dock'+(j?' hide':'')}><div className="dockbar">
        <button className="dbtn pri" title={r.running?'Pause':'Run mission '+(r.mission+1)} onClick={()=>post(sel+(r.running?'/pause':'/run'))}>{r.running?<Pause size={15}/>:<Play size={15}/>}<span>{r.running?'Pause':'Run '+(r.mission+1)}</span></button>
        <button className="dbtn icon" title="Restart" onClick={()=>post(sel+'/rerun')}><RotateCcw size={15}/></button>
        <button className="dbtn" title="Switch mission" onClick={()=>post(sel+'/mission/'+(1-r.mission))}>Mission {2-r.mission}</button>
        <i className="ddiv"/>
        <button className={'dbtn icon'+(view==='iso'?' on':'')} title="3D view" onClick={()=>{sc.current.view('iso');setView('iso')}}><Box size={15}/></button>
        <button className={'dbtn icon'+(view==='top'?' on':'')} title="Top view" onClick={()=>{sc.current.view('top');setView('top')}}><LayoutGrid size={15}/></button>
        <button className={'dbtn icon'+(view==='follow'?' on':'')} title="Follow robot" onClick={()=>{sc.current.view('follow');setView('follow')}}><Crosshair size={15}/></button>
        <i className="ddiv"/>
        <button className={'dbtn icon'+(ghost?' on':'')} title="Ghost run" onClick={()=>setGhost(!ghost)}><Ghost size={15}/></button>
        <button className="dbtn icon" title="Replay" disabled={!r.done||!!replay} onClick={()=>playReplay(r)}><RotateCw size={15}/></button>
        <i className="ddiv"/>
        <button className={'dbtn '+(r.online?'up-on':'up-off')} title={r.online?'Go offline':'Reconnect'} onClick={()=>post(sel+'/online/'+(r.online?0:1))}>{r.online?<Wifi size={15}/>:<WifiOff size={15}/>}<span>{r.online?'Online':'Offline'}</span></button>
        <span className={'calls'+(r.uplink===0?' ok':'')}>{r.uplink}<small>calls</small></span>
      </div></div>
      <div className="ov br"><MiniMap s={s} sel={sel}/></div>
      {j&&<div className="cap"><button onClick={()=>{abort.current=true}}>Exit</button><div className="stp">Step {j.i+1} / {STEPS.length} · {STEPS[j.i]}</div><p>{j.t}</p><div className="dots">{STEPS.map((_,i)=><i key={i} className={i<=j.i?'on':''}/>)}</div></div>}
    </section>

    <div className="panel">
      <div className="panel-tabs">
        <button className={panelTab==='timeline'?'on':''} onClick={()=>setPanelTab('timeline')}><ScrollText size={14}/>Timeline<i className="ct">{s.events.length}</i></button>
        <button className={panelTab==='robot'?'on':''} onClick={()=>setPanelTab('robot')} style={{'--c':COL[sel]}}><i className="rdot"/>Robot {sel}</button>
        <button className={panelTab==='results'?'on':''} onClick={()=>setPanelTab('results')}><Table2 size={14}/>Results</button>
        <button className={panelTab==='vitals'?'on':''} onClick={()=>setPanelTab('vitals')}><Cpu size={14}/>Vitals</button>
        <span className="grow"/>
        <ChevronRight size={14} className="hint"/>
      </div>
      <div className="panel-body">
        {panelTab==='timeline'&&<Timeline events={s.events}/>}

        {panelTab==='robot'&&<div className="robot-tab">
          <div className="rtabs">{[['mem','Memory'],['why','Why this route'],['ask','Ask'],['log','Log']].map(([k,l])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}</button>)}</div>
          <div className="rpane">
            {tab==='mem'&&(r.mem.length?r.mem.map((m,i)=><div key={i} className={'mem '+(isInh(m,sel)?'inh':'own')}><span className="k">{isInh(m,sel)?'Fleet':'Learned'}</span>{m.text}</div>):<div className="mu" style={{padding:'8px 0'}}>Empty. Run a mission and Robot {sel} will learn.</div>)}
            {tab==='why'&&(r.explain?<div><div className="cd"><b>Last plan at ({r.explain.pos.join(',')})</b>Plain A*: {r.explain.raw} steps · with memory: <b style={{display:'inline',textTransform:'none',fontSize:'inherit',color:'var(--on-dark)'}}>{r.explain.mem}</b>. Remembered obstacles are walls, so this is the shortest route the robot knows.</div>{r.explain.hits.map(h=><div key={h.id} className="mem mu"><span className="k">#{h.id}</span>similarity {h.score} · [{h.sources.join('+')}]</div>)}</div>:<div className="mu" style={{padding:'8px 0'}}>No plan yet.</div>)}
            {tab==='ask'&&<Ask id={sel}/>}{tab==='log'&&r.log.map((t,i)=><div key={i} className="mem mu">{t}</div>)}
          </div>
        </div>}

        {panelTab==='results'&&<div className="results-tab">
          <div className="res-nums"><div><b>{avoided}</b><span>Collisions avoided</span></div><div><b>{eff||'–'}{eff?'%':''}</b><span>Route efficiency</span></div><div><b>{p50.toFixed(2)} ms</b><span>Local query p50</span></div><div><b>{s.fleet.length}</b><span>Fleet memories</span></div></div>
          <table><thead><tr><th>Robot</th><th>Run</th><th>Inherited</th><th>Bumps</th><th>Avoided</th><th>Efficiency</th></tr></thead>
            <tbody>{ids.flatMap(id=>s.robots[id].runs.map((x,i)=><tr key={id+i}><td style={{color:COL[id],fontWeight:600}}>{id}</td><td>{x.mission}</td><td>{x.inh0}</td><td>{x.hits}</td><td className={x.raw_hits-x.hits>0?'ok':''}>{Math.max(0,x.raw_hits-x.hits)}</td><td>{x.eff}%</td></tr>))}{!runs.length&&<tr><td colSpan="6" className="mu" style={{textAlign:'left'}}>No finished runs yet.</td></tr>}</tbody></table>
          {lastB&&lastB.inh0>0&&lastB.hits<lastB.raw_hits&&<div className="win">Robot B avoided {lastB.raw_hits-lastB.hits} obstacle(s) it never saw itself.</div>}
        </div>}

        {panelTab==='vitals'&&<div className="vitals-tab"><div><div className="eyebrow2">Edge vitals · Robot {sel}</div><Vitals v={r.vitals}/></div><Footprint/></div>}
      </div>
    </div>

    {rep&&<div className="modal" onClick={()=>setRep(null)}><div className="rep" onClick={e=>e.stopPropagation()}><div className="eyebrow2">Mission report · all numbers measured live</div><h2>Fleet memory works</h2>
      <p>Each robot inherited what the other learned offline, then avoided {rep.avoided} of the {rep.naive} obstacles a naive route would have hit.</p>
      <div className="g"><Kpi l="Collisions avoided" v={rep.avoided} c="#7cff67" sub={`of ${rep.naive} a naive route would hit`}/><Kpi l="Uplink calls while offline" v={rep.off} c="#7C5CFF" sub="learning and rerouting were local"/><Kpi l="Route efficiency" v={rep.eff} unit="%" c="#7C5CFF" sub="vs ideal route with full knowledge"/>
      <Kpi l="Local query p50" v={rep.p50} dec={2} unit=" ms" c="#B497CF" sub="Qdrant Edge search"/><Kpi l="Sync smaller than full" v={rep.save} dec={1} unit="%" c="#B497CF" sub="partial snapshot"/><Kpi l="Inherited memories used" v={rep.inh} c="#8C6FFF" sub="never seen first-hand"/></div>
      <div className="actions"><button className="judge" onClick={()=>{setRep(null);judge()}}>Replay in a new world</button><button onClick={()=>setRep(null)}>Close</button></div></div></div>}
  </div>}
