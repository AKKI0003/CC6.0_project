import {useEffect,useRef,useState} from 'react';
import {ArrowRight,ArrowDown,Radio} from 'lucide-react';
import {Warehouse3D} from './scene3d.js';
import Aurora from './Aurora.jsx';

const SH=new Set();for(const [a,b,c,d] of [[2,5,3,4],[9,12,3,4],[2,5,10,11],[9,12,10,11]])for(let x=a;x<=b;x++)for(let y=c;y<=d;y++)SH.add(x+','+y);
const ease=k=>1-Math.pow(1-k,3);
// Every keyframe keeps a generous radius/height so the camera never clips
// into a rack or robot mid-scroll (that was the "zoomed into random
// corners" bug) — it orbits the warehouse and only settles close at the
// very end, exactly on the console's own default framing.
const KF=[
  {cam:[0,20,24],t:[0,1,-3]},   // wide establishing shot
  {cam:[8,11,16],t:[0,1,0]},    // orbiting in, still high enough to clear the racks
  {cam:[4,6,8], t:[0,1,-1]},    // closer, centered over the open aisle
  {cam:[3,8,-1],t:[0,3,-9]},    // rising toward the fleet tower
  {cam:[0,15,10],t:[0,2,-6]},   // pulling back out, whole fleet + tower visible
  {cam:[0,18,20],t:[0,0,1.6]},  // matches the console's own opening camera
];
const BEATS=[
  {tag:'01 — The problem',h:'Robots don\u2019t always have a connection.',p:'Warehouses, tunnels and outdoor sites are full of dead zones. Fleets that depend on a constant link stop learning the moment it drops.'},
  {tag:'02 — FleetMind concept',h:'Every robot keeps its own memory.',p:'Each machine carries a local Qdrant Edge shard — a real vector store on disk, not a cache. It works with zero network calls.',right:true},
  {tag:'03 — Offline intelligence',h:'Learn locally. Reroute instantly.',p:'An obstacle is written to memory the instant it\u2019s met, then recalled by similarity to change the next route — fully offline.'},
  {tag:'04 — Reconnection',h:'When the network returns, memory returns with it.',p:'A partial snapshot sync pushes what a robot learned and pulls what the fleet already knows — a fraction of a full re-download.',right:true},
  {tag:'05 — Collective intelligence',h:'Learn once. Move smarter, together.',p:'One robot\u2019s obstacle becomes every robot\u2019s knowledge. A machine that never saw a hazard still avoids it.'},
  {tag:'06 — Enter FleetMind',h:'This isn\u2019t a mockup. It\u2019s running right now.',p:'Everything you just saw is the live simulation below, driven by a real Qdrant server and real Edge shards.'},
];

// Self-contained reveal: state lives in THIS component, so it survives
// Landing's frequent re-renders from the live /api/state poll (a plain
// classList mutation would get wiped out by React's next reconcile).
function Reveal({as:Tag='div',cls='reveal',className='',style,children}){
  const [on,setOn]=useState(false),ref=useRef();
  useEffect(()=>{
    const io=new IntersectionObserver(es=>{if(es[0].isIntersecting){setOn(true);io.disconnect()}},{threshold:.15});
    if(ref.current)io.observe(ref.current);return()=>io.disconnect()
  },[]);
  return <Tag ref={ref} className={cls+(on?' in':'')+(className?' '+className:'')} style={style}>{children}</Tag>
}

function StoryStage({state}){
  const el=useRef(),sc=useRef(),wrap=useRef(),[beat,setBeat]=useState(0);
  useEffect(()=>{const w=new Warehouse3D(el.current,SH);w.setPresent(true);sc.current=w;return()=>{w.dispose();sc.current=null}},[]);
  useEffect(()=>{if(sc.current&&state)sc.current.update(state,'A',{ghost:false,replay:null})},[state]);
  useEffect(()=>{
    let raf=null,ticking=false;
    const onScroll=()=>{if(ticking)return;ticking=true;raf=requestAnimationFrame(()=>{ticking=false;
      const r=wrap.current;if(!r||!sc.current)return;
      const top=r.offsetTop,total=r.offsetHeight-innerHeight;
      const p=Math.min(1,Math.max(0,(window.scrollY-top)/Math.max(1,total)));
      const seg=p*(KF.length-1),i=Math.min(KF.length-2,Math.floor(seg)),f=ease(seg-i),a=KF[i],b=KF[i+1];
      const cam=[0,1,2].map(k=>a.cam[k]+(b.cam[k]-a.cam[k])*f),t=[0,1,2].map(k=>a.t[k]+(b.t[k]-a.t[k])*f);
      sc.current.presentAt(cam,t);
      setBeat(Math.min(BEATS.length-1,Math.round(p*(BEATS.length-1))));
    })};
    window.addEventListener('scroll',onScroll,{passive:true});onScroll();
    return()=>window.removeEventListener('scroll',onScroll)
  },[]);
  return <div className="story-h" ref={wrap}><div className="story-stick">
    <div className="story-canvas" ref={el}/>
    <div className="story-scrim"/>
    {BEATS.map((b,i)=><div key={i} className={'beat'+(b.right?' right':'')+(beat===i?' on':'')}>
      <div className="btag">{b.tag}</div><h3>{b.h}</h3><p>{b.p}</p></div>)}
    <div className="storyprog">{BEATS.map((_,i)=><i key={i} className={beat===i?'on':''}/>)}</div>
  </div></div>}

export default function Landing({onEnter,liveOk}){
  const [compact,setCompact]=useState(false),[dark,setDark]=useState(false),[state,setState]=useState(null);
  useEffect(()=>{
    let alive=true;
    const poll=async()=>{try{const d=await(await fetch('/api/state')).json();if(alive)setState(d)}catch{}};
    poll();const iv=setInterval(poll,1500);return()=>{alive=false;clearInterval(iv)}
  },[]);
  useEffect(()=>{
    const onScroll=()=>{const y=window.scrollY;setCompact(y>60);
      const storyEl=document.querySelector('.story');if(storyEl){const r=storyEl.getBoundingClientRect();setDark(r.top<120&&r.bottom>120)}};
    window.addEventListener('scroll',onScroll,{passive:true});onScroll();return()=>window.removeEventListener('scroll',onScroll)
  },[]);
  return <div className="land">
    <div className="aurora-fixed" aria-hidden="true"><Aurora colorStops={["#7cff67","#B497CF","#5227FF"]} blend={0.5} amplitude={1.0} speed={0.5}/></div>
    <div className={'lnav'+(compact?' compact':'')+(dark?' dark':'')}><div className="pill">
      <span className="word">FleetMind</span>
      <nav><a href="#problem">System</a><a href="#story">Technology</a><a href="#console-teaser">Console</a></nav>
      <span className="live"><Radio size={12}/> {liveOk?'Live':'Connecting'}</span>
      <button className="cta" onClick={onEnter}>Enter console</button>
    </div></div>

    <section className="hero">
      <div className="eyebrow reveal in">Offline-first robot intelligence</div>
      <h1 className="reveal in">Robots that<br/>learn where they are.<br/><em>Even when the network isn’t.</em></h1>
      <p className="sub reveal in" style={{transitionDelay:'.15s'}}>FleetMind gives every robot its own local memory on Qdrant Edge, and merges it back into the fleet the moment connectivity returns.</p>
      <div className="actions reveal in" style={{transitionDelay:'.3s'}}>
        <button className="btn pri" onClick={()=>document.getElementById('problem').scrollIntoView({behavior:'smooth'})}>Explore the system<ArrowRight size={16}/></button>
        <button className="btn" onClick={onEnter}>Open live console</button>
      </div>
      <div className="scrolldown"><ArrowDown size={14}/> Scroll</div>
    </section>

    <section id="problem" className="esec">
      <Reveal as="div" cls="tag">The problem</Reveal>
      <Reveal as="h2">Fleets built for perfect connectivity break in real environments.</Reveal>
      <Reveal as="p" cls="lede">Concrete, tunnels, cold storage, outdoor yards — coverage drops constantly. A robot that only knows how to think while connected stops thinking the moment it doesn’t.</Reveal>
      <Reveal as="div" cls="connrow reveal2">
        {['ROBOT A','ROBOT B','ROBOT C'].map(x=><span key={x} className="connchip">{x} — CONNECTED</span>)}
        <span className="arrow">→</span>
        <span className="connchip off">ROBOT D — OFFLINE</span>
      </Reveal>
      <div className="problist">
        {[['Dead zones','Steel racking and concrete kill RF coverage in the exact aisles robots work in.'],
          ['Intermittent links','A connection that drops for ten seconds is enough to stall a cloud-dependent planner.'],
          ['Changing environments','Pallets move. Forklifts cross. Yesterday’s map is already wrong.'],
          ['No shared memory','Without a merge step, two robots that learn the same hazard learn it twice, separately.']]
          .map(([b,t],i)=><Reveal key={i} as="div" cls="reveal2" style={{'--d':(i*.08)+'s'}}><b>{b}</b>{t}</Reveal>)}
      </div>
    </section>

    <section id="story" className="story">
      <StoryStage state={state}/>
    </section>

    <section id="console-teaser" className="esec paper">
      <div className="teaser">
        <div>
          <Reveal as="div" cls="tag">Live mission console</Reveal>
          <Reveal as="h2">Every number on this page comes from the running system.</Reveal>
          <Reveal as="p" cls="lede">No mocked telemetry. The console below polls the same FastAPI backend and Qdrant server this story just showed you.</Reveal>
          <Reveal as="div" cls="telemetry-row">
            {(state?[
              ['Collisions avoided',Object.values(state.robots).flatMap(r=>r.runs).reduce((a,x)=>a+Math.max(0,x.raw_hits-x.hits),0)],
              ['Robots online',Object.values(state.robots).filter(r=>r.online).length+' / '+Object.keys(state.robots).length],
              ['Fleet memories',state.fleet.length],
            ]:[['Collisions avoided','–'],['Robots online','–'],['Fleet memories','–']])
            .map(([l,v])=><div key={l} className="tstat"><b>{v}</b><span>{l}</span></div>)}
          </Reveal>
        </div>
        <Reveal style={{aspectRatio:'4/3',borderRadius:20,background:'var(--graphite)',border:'1px solid var(--line-light)',display:'grid',placeItems:'center',color:'var(--on-dark-mu2)',fontFamily:'var(--mono)',fontSize:13,letterSpacing:'.04em'}}>
            3D SIMULATION — LIVE BELOW
        </Reveal>
      </div>
    </section>

    <section className="esec">
      <Reveal as="div" cls="tag">Engineering</Reveal>
      <Reveal as="h2">Built on real infrastructure, not a demo shortcut.</Reveal>
      <ul className="techlist">
        {[['Qdrant Edge','Each robot owns a mutable shard for local writes and an immutable shard restored by partial snapshot — real embedded vector search, zero network calls while offline.'],
          ['Fleet server','A Qdrant collection merges overlapping memories by vector similarity: confirmed, zoned, or resolved as a conflict by newest timestamp.'],
          ['Local + semantic recall','A spatial embedding drives routing cost; a text embedding (Ollama, local) powers natural-language recall through Ask.'],
          ['Measured, not claimed','Sync size is compared against a measured full re-download, not an assumed baseline. Query latency is real p50/p95.']]
          .map(([b,t],i)=><Reveal key={i} as="li" cls="reveal2" style={{'--d':(i*.06)+'s'}}><b>{b}</b>{t}</Reveal>)}
      </ul>
    </section>

    <section className="cta-final">
      <Reveal><div className="tag" style={{justifyContent:'center'}}>FleetMind</div>
      <h2>Local memory.<br/>Collective intelligence.</h2>
      <p className="sub2">The full mission console — Judge Mode, Ask, Edge vitals — is one click away.</p>
      <button className="btn pri" onClick={onEnter}>Enter the live console<ArrowRight size={16}/></button></Reveal>
    </section>
    <footer className="lfoot"><span>FleetMind — offline-first fleet intelligence</span><span>Qdrant Edge · Qdrant server · Ollama</span></footer>
  </div>}
