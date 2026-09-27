import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
export const N=15,COL={A:'#38d5ff',B:'#B497CF',C:'#8C6FFF',D:'#5EEAD4',F:'#7C5CFF'};
const P=(x,y,h=0)=>new THREE.Vector3(x-7,h,y-7),TOWER=new THREE.Vector3(0,2.6,-10.5);
const M=(c,o={})=>new THREE.MeshStandardMaterial({color:c,roughness:.6,metalness:.2,...o});
const glow=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.3,'rgba(255,255,255,.3)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)})();
const ease=k=>k*k*(3-2*k),sig=a=>a.length+':'+(a.at(-1)||[]).join(',');
function label(text,color,w=340,h=76,size=34){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
  g.font=`600 ${size}px Inter,system-ui,sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillStyle='rgba(10,11,9,.78)';
  const tw=g.measureText(text).width;g.beginPath();g.roundRect(w/2-tw/2-14,h/2-size*.62,tw+28,size*1.3,8);g.fill();
  g.fillStyle=color;g.fillText(text,w/2,h/2+1);const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,depthTest:false}));
  sp.renderOrder=999;return sp}

export class Warehouse3D{
  constructor(el,shelves){
    this.el=el;const r=this.r=new THREE.WebGLRenderer({antialias:true});r.setPixelRatio(Math.min(2,devicePixelRatio));r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1.2;r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFSoftShadowMap;el.appendChild(r.domElement);
    const sc=this.sc=new THREE.Scene();sc.background=new THREE.Color(0x111210);sc.fog=new THREE.Fog(0x111210,30,64);
    const cam=this.cam=new THREE.PerspectiveCamera(38,1,.1,120);cam.position.set(0,18,20);
    const ct=this.ct=new OrbitControls(cam,r.domElement);ct.enableDamping=true;ct.maxPolarAngle=Math.PI*.47;ct.minDistance=8;ct.maxDistance=44;ct.enablePan=false;ct.target.set(0,0,1.6);
    sc.add(new THREE.HemisphereLight(0x8a8578,0x0e0f0c,.65));
    const sun=new THREE.DirectionalLight(0xffffff,1.6);sun.position.set(7,18,9);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-13,right:13,top:13,bottom:-13,near:1,far:45});sun.shadow.bias=-.0004;sc.add(sun);
    const fl=this.fleetLight=new THREE.PointLight(0x7C5CFF,46,26,2);fl.position.copy(TOWER);sc.add(fl);
    this.build(shelves);this.rob={};this.forks=[];this.pal=new THREE.Group();this.marks=new THREE.Group();this.paths=new THREE.Group();sc.add(this.pal,this.marks,this.paths);
    this.rp=new THREE.Mesh(new THREE.SphereGeometry(.2,12,12),new THREE.MeshBasicMaterial({color:0xffffff}));this.rp.visible=false;sc.add(this.rp);this.pt=[];this.rings=[];this.sigs={};this.follow=false;this.tw=null;this.last=performance.now();
    this.presentMode=false;this.ro=new ResizeObserver(()=>this.resize());this.ro.observe(el);this.resize();r.setAnimationLoop(t=>this.frame(t));
  }
  // Presentation-only camera path for the landing page's scroll story.
  // Never touches OrbitControls state, robot logic, or anything the live console relies on.
  setPresent(on){this.presentMode=on;this.ct.enabled=!on}
  presentAt(camArr,targetArr){this.cam.position.set(camArr[0],camArr[1],camArr[2]);this.ct.target.set(targetArr[0],targetArr[1],targetArr[2]);this.cam.updateMatrixWorld()}
  resize(){const w=this.el.clientWidth,h=this.el.clientHeight;if(!w||!h)return;this.r.setSize(w,h);this.cam.aspect=w/h;this.cam.updateProjectionMatrix()}
  build(shelves){const sc=this.sc,S=N+8;
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(S,S),M(0x131410,{roughness:.9,metalness:.05}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;sc.add(floor);
    const grid=new THREE.GridHelper(N,N,0x3a382f,0x201f1a);grid.position.y=.012;grid.material.transparent=true;grid.material.opacity=.6;sc.add(grid);
    const edge=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-7.5,-7.5],[7.5,-7.5],[7.5,7.5],[-7.5,7.5]].map(([x,z])=>new THREE.Vector3(x,.02,z))),new THREE.LineBasicMaterial({color:0x4a4738,transparent:true,opacity:.9}));sc.add(edge);
    const cells=[...shelves].map(k=>k.split(',').map(Number)),d=new THREE.Object3D(),steel=M(0x3a382f,{metalness:.55,roughness:.45}),
      posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.07,1.6,.07),steel,cells.length*4),planks=new THREE.InstancedMesh(new THREE.BoxGeometry(.92,.05,.92),M(0x24251f,{metalness:.5,roughness:.55}),cells.length*3),
      box=new THREE.InstancedMesh(new THREE.BoxGeometry(.38,.32,.38),M(0xffffff,{roughness:.85}),cells.length*6);let pi=0,li=0,bi=0;const pal=[0xb98a55,0xa87a48,0xc99a63,0x8f6a3f,0x6d6a5c,0x9c7a4a];
    cells.forEach(([x,y])=>{const c=P(x,y);[[-.44,-.44],[.44,-.44],[-.44,.44],[.44,.44]].forEach(([a,b])=>{d.position.set(c.x+a,.8,c.z+b);d.rotation.set(0,0,0);d.updateMatrix();posts.setMatrixAt(pi++,d.matrix)});
      [.35,.85,1.35].forEach(h=>{d.position.set(c.x,h,c.z);d.updateMatrix();planks.setMatrixAt(li++,d.matrix);[-.2,.2].forEach(o=>{d.position.set(c.x+o+(Math.random()-.5)*.06,h+.18,c.z+(Math.random()-.5)*.3);d.rotation.set(0,Math.random()*.4,0);d.updateMatrix();box.setMatrixAt(bi,d.matrix);box.setColorAt(bi++,new THREE.Color(pal[Math.floor(Math.random()*pal.length)]))})})});
    [posts,planks,box].forEach(m=>{m.castShadow=m.receiveShadow=true;sc.add(m)});
    const t=this.tower=new THREE.Group(),core=this.core=new THREE.Mesh(new THREE.CylinderGeometry(.42,.55,4.2,24,1,true),new THREE.MeshBasicMaterial({color:0x7C5CFF,transparent:true,opacity:.22,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
    core.position.y=2.2;const base=new THREE.Mesh(new THREE.CylinderGeometry(1,1.2,.4,32),M(0x1c1a12,{metalness:.5,roughness:.5}));base.position.y=.2;t.add(core,base);
    this.trs=[1,2,3].map(i=>{const q=new THREE.Mesh(new THREE.TorusGeometry(.8+i*.12,.025,8,48),new THREE.MeshBasicMaterial({color:0x7C5CFF,transparent:true,opacity:.75}));q.rotation.x=Math.PI/2;q.position.y=i*1.1;t.add(q);return q});
    const c=document.createElement('canvas');c.width=512;c.height=96;const g=c.getContext('2d');g.font='600 34px Inter,sans-serif';g.fillStyle='#F0EEF7';g.textAlign='center';g.fillText('FLEET MEMORY',256,48);g.font='500 20px Inter,sans-serif';g.fillStyle='#9C93B8';g.fillText('Qdrant server',256,78);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));sp.scale.set(4,.75,1);sp.position.y=5.2;t.add(sp);t.position.set(0,0,-10.5);sc.add(t)}
  robot(id){const col=new THREE.Color(COL[id]),g=new THREE.Group(),
      base=new THREE.Mesh(new THREE.CylinderGeometry(.34,.4,.16,8),M(0x1c1d19,{metalness:.55,roughness:.4})),
      body=new THREE.Mesh(new THREE.CylinderGeometry(.29,.34,.22,8),M(0x24251f,{metalness:.6,roughness:.32})),
      band=new THREE.Mesh(new THREE.TorusGeometry(.3,.025,8,8),new THREE.MeshBasicMaterial({color:col})),
      dome=new THREE.Mesh(new THREE.SphereGeometry(.15,16,10),M(0x0e0f0c,{metalness:.3,roughness:.55})),
      eye=new THREE.Mesh(new THREE.SphereGeometry(.045,8,8),new THREE.MeshBasicMaterial({color:0xfff7e8})),
      halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:col,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.5})),
      sensor=new THREE.Mesh(new THREE.RingGeometry(1.97,1.99,64),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.22,side:THREE.DoubleSide})),
      sync=new THREE.Mesh(new THREE.RingGeometry(.4,.44,48),new THREE.MeshBasicMaterial({color:0x7C5CFF,transparent:true,side:THREE.DoubleSide}));
    base.position.y=.09;base.rotation.y=Math.PI/8;body.position.y=.26;band.rotation.x=Math.PI/2;band.position.y=.26;dome.position.y=.42;eye.position.set(0,.42,.135);
    halo.scale.set(1.1,1.1,1);halo.position.y=.15;sensor.rotation.x=sync.rotation.x=-Math.PI/2;sensor.position.y=-.24;sync.position.y=-.2;
    const idLabel=label('ROBOT '+id,'#F0EEF7');idLabel.scale.set(1.3,.29,1);idLabel.position.y=1.05;
    [base,body,dome].forEach(m=>{m.castShadow=true;m.receiveShadow=true});g.add(base,body,band,dome,eye,halo,sensor,sync,idLabel);this.sc.add(g);
    const goal=new THREE.Group(),gpad=new THREE.Mesh(new THREE.RingGeometry(.34,.46,4,1,Math.PI/4),M(0x7cff67,{emissive:0x2c4a32,emissiveIntensity:.5,metalness:0,roughness:.7})),
      gr=new THREE.Mesh(new THREE.TorusGeometry(.42,.025,8,4,Math.PI*2),new THREE.MeshBasicMaterial({color:0x7cff67})),
      beam=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,1.6,4,1,true),new THREE.MeshBasicMaterial({color:0x7cff67,transparent:true,opacity:.1,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false})),
      gLabel=label('GOAL — '+id,'#7cff67');
    gpad.rotation.x=gr.rotation.x=-Math.PI/2;gpad.position.y=.03;gr.position.y=.06;beam.position.y=.85;gLabel.scale.set(1.3,.29,1);gLabel.position.y=1.55;
    goal.add(gpad,gr,beam,gLabel);this.sc.add(goal);
    const start=new THREE.Group(),spad=new THREE.Mesh(new THREE.PlaneGeometry(.86,.86),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.16,side:THREE.DoubleSide})),
      sring=new THREE.Mesh(new THREE.RingGeometry(.4,.44,4,1,Math.PI/4),new THREE.MeshBasicMaterial({color:col})),
      sLabel=label('START — '+id,COL[id]);
    spad.rotation.x=sring.rotation.x=-Math.PI/2;spad.position.y=.025;sring.position.y=.03;sLabel.scale.set(1.3,.29,1);sLabel.position.y=.55;
    start.add(spad,sring,sLabel);this.sc.add(start);
    const ghost=new THREE.Mesh(new THREE.SphereGeometry(.22,14,10),new THREE.MeshBasicMaterial({color:0xF0EEF7,transparent:true,opacity:.4,wireframe:true}));this.sc.add(ghost);
    return this.rob[id]={g,goal,start,gr,sensor,sync,ghost,cur:null,rot:0,col}}
  fork(){const g=new THREE.Group(),y=M(0xf2c318,{roughness:.5}),k=M(0x14181f),b=new THREE.Mesh(new THREE.BoxGeometry(.62,.36,.9),y),cab=new THREE.Mesh(new THREE.BoxGeometry(.5,.34,.4),y),mast=new THREE.Mesh(new THREE.BoxGeometry(.5,.9,.08),k),
      f1=new THREE.Mesh(new THREE.BoxGeometry(.08,.05,.55),k),f2=f1.clone(),beacon=new THREE.Mesh(new THREE.SphereGeometry(.07,8,8),new THREE.MeshBasicMaterial({color:0xff9a1f}));
    b.position.y=.3;cab.position.set(0,.68,-.12);mast.position.set(0,.5,.5);f1.position.set(-.16,.12,.75);f2.position.set(.16,.12,.75);beacon.position.set(0,.9,-.12);
    [[-.34,-.3],[.34,-.3],[-.34,.28],[.34,.28]].forEach(([a,c])=>{const w=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.1,10),k);w.rotation.z=Math.PI/2;w.position.set(a,.13,c);g.add(w)});
    [b,cab,mast].forEach(m=>m.castShadow=true);g.add(b,cab,mast,f1,f2,beacon);g.userData.beacon=beacon;g.userData.cur=null;g.userData.rot=0;this.sc.add(g);return g}
  syncPal(list){const s=JSON.stringify(list);if(s===this.sigs.pal)return;this.sigs.pal=s;this.pal.clear();
    list.forEach(([x,y])=>{const g=new THREE.Group(),base=new THREE.Mesh(new THREE.BoxGeometry(.8,.12,.8),M(0x8a6a3c,{roughness:.85})),c1=new THREE.Mesh(new THREE.BoxGeometry(.62,.5,.62),M(0xc08a4a,{roughness:.75})),c2=new THREE.Mesh(new THREE.BoxGeometry(.4,.34,.4),M(0xa97a40,{roughness:.8})),
      ring=new THREE.Mesh(new THREE.RingGeometry(.5,.58,32),new THREE.MeshBasicMaterial({color:0xD97C6B,transparent:true,opacity:.4,side:THREE.DoubleSide}));
      base.position.y=.06;c1.position.y=.4;c2.position.y=.82;c2.rotation.y=.4;ring.rotation.x=-Math.PI/2;ring.position.y=.02;[base,c1,c2].forEach(m=>m.castShadow=m.receiveShadow=true);g.add(base,c1,c2,ring);g.position.copy(P(x,y));g.userData.ring=ring;this.pal.add(g)})}
  syncMarks(mem,sel){const s=sel+mem.map(m=>m.x+','+m.y+m.kind+m.sources.join('')).join('|');if(s===this.sigs.mem)return;this.sigs.mem=s;this.marks.clear();
    mem.forEach(m=>{const inh=m.sources.length>1||m.sources[0]!==sel,c=m.kind==='clear'?0x7cff67:inh?0xB497CF:0xD97C6B,g=new THREE.Group();
      const hit=m.kind==='blocked',mesh=new THREE.Mesh(hit?new THREE.OctahedronGeometry(.2):new THREE.TorusGeometry(.18,.04,8,20),new THREE.MeshBasicMaterial({color:c})),
        beam=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,1.1,12,1,true),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.12,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false})),
        halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:c,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
      mesh.position.y=1.3;beam.position.y=.65;halo.position.y=.1;halo.scale.set(hit?2.2:1.4,hit?2.2:1.4,1);g.add(mesh,beam,halo);g.position.copy(P(m.x,m.y));g.userData.m=mesh;this.marks.add(g)})}
  syncPaths(s,sel){const sg=Object.entries(s.robots).map(([i,r])=>i+sig(r.trail)+(i===sel?sig(r.path)+(r.ghost?sig(r.ghost.trail):''):'')).join('|');if(sg===this.sigs.path)return;this.sigs.path=sg;
    this.paths.children.forEach(o=>o.geometry.dispose());this.paths.clear();
    const tube=(pts,col,op,rad)=>{if(pts.length<2)return;const v=pts.map(p=>P(p[0],p[1],.07));const cur=new THREE.CatmullRomCurve3(v,false,'catmullrom',.1);this.paths.add(new THREE.Mesh(new THREE.TubeGeometry(cur,Math.max(8,v.length*5),rad,6,false),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:op})))};
    Object.entries(s.robots).forEach(([i,r])=>tube(r.trail,COL[i],i===sel?.95:.28,i===sel?.045:.028));
    const r=s.robots[sel];if(r&&r.path.length){const pts=[r.pos,...r.path].map(p=>P(p[0],p[1],.12)),l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineDashedMaterial({color:0xffffff,dashSize:.14,gapSize:.12,transparent:true,opacity:.8}));l.computeLineDistances();this.paths.add(l)}
    if(r&&r.ghost&&r.ghost.trail.length>1){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(r.ghost.trail.map(p=>P(p[0],p[1],.05))),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.25}));this.paths.add(l)}}
  update(s,sel,opt={}){this.s=s;this.sel=sel;this.opt=opt;Object.keys(s.robots).forEach(i=>this.rob[i]||this.robot(i));
    while(this.forks.length<s.world.forks.length)this.forks.push(this.fork());this.syncPal(s.world.pallets);this.syncMarks(s.robots[sel].mem,sel);this.syncPaths(s,sel)}
  view(n){const T={iso:[[0,18,20],[0,0,1.6]],top:[[0,27,.01],[0,0,0]],low:[[13,6,13],[0,.5,0]]};this.follow=n==='follow';if(this.follow)return;const [p,t]=T[n];this.tw={p0:this.cam.position.clone(),t0:this.ct.target.clone(),p1:new THREE.Vector3(...p),t1:new THREE.Vector3(...t),k:0}}
  emit(kind,id){const r=this.rob[id];if(!r)return;if(kind==='merge'){for(let i=0;i<3;i++)this.mkRing(i*.22);this.fleetLight.intensity=260;return}
    const a=kind==='push'?r.g.position.clone().setY(.5):TOWER.clone(),b=kind==='push'?TOWER.clone():r.g.position.clone().setY(.5);
    for(let i=0;i<2;i++){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:kind==='push'?r.col:0x7C5CFF,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));m.scale.set(.7,.7,1);this.sc.add(m);this.pt.push({m,a,b,t:-i*.16-Math.random()*.1,dur:1.25,h:3+Math.random()*2})}}
  mkRing(d){const m=new THREE.Mesh(new THREE.RingGeometry(.9,1,64),new THREE.MeshBasicMaterial({color:0x7C5CFF,transparent:true,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(0,.05,-10.5);this.sc.add(m);this.rings.push({m,t:-d})}
  frame(now){const dt=Math.min(.05,(now-this.last)/1000);this.last=now;const T=now/1000,s=this.s;
    if(s){const sel=this.sel;
      Object.entries(s.robots).forEach(([id,r],k)=>{const o=this.rob[id],tg=P(r.pos[0],r.pos[1],.27+Math.sin(T*3+k)*.015);if(!o.cur){o.cur=tg.clone();o.g.position.copy(tg)}
        const d=tg.clone().sub(o.cur);if(d.lengthSq()>1e-4)o.rot+=(Math.atan2(d.x,d.z)-o.rot+Math.PI*3)%(Math.PI*2)-Math.PI;
        o.cur.lerp(tg,1-Math.pow(.0009,dt));o.g.position.copy(o.cur);o.g.rotation.y=o.rot;
        const gp=P(r.goal[0],r.goal[1]);o.goal.position.copy(gp);o.gr.scale.setScalar(1+Math.sin(T*3)*.06);o.start.position.copy(P(r.start[0],r.start[1]));o.sensor.visible=id===sel;o.sensor.material.opacity=.14+.08*Math.sin(T*2);
        o.sync.visible=r.status==='Syncing';if(o.sync.visible){const q=(T*1.2)%1;o.sync.scale.setScalar(1+q*4);o.sync.material.opacity=1-q}
        const gh=r.ghost;o.ghost.visible=!!(gh&&id===sel&&this.opt.ghost&&gh.pos&&!gh.done);if(o.ghost.visible)o.ghost.position.lerp(P(gh.pos[0],gh.pos[1],.3),.2)});
      s.world.forks.forEach((f,i)=>{const g=this.forks[i];if(!g)return;const tg=P(f[0],f[1]);if(!g.userData.cur){g.userData.cur=tg.clone();g.position.copy(tg)}
        const d=tg.clone().sub(g.userData.cur);if(d.lengthSq()>1e-4)g.userData.rot+=(Math.atan2(d.x,d.z)-g.userData.rot+Math.PI*3)%(Math.PI*2)-Math.PI;
        g.userData.cur.lerp(tg,1-Math.pow(.02,dt));g.position.copy(g.userData.cur);g.rotation.y=g.userData.rot;g.userData.beacon.visible=Math.sin(T*10)>0});
      this.pal.children.forEach(g=>g.userData.ring.material.opacity=.3+.3*Math.sin(T*3));
      this.marks.children.forEach((g,i)=>{const m=g.userData.m;m.rotation.y=T*1.5+i;m.position.y=1.5+Math.sin(T*2+i)*.1});
      const rp=this.opt.replay;this.rp.visible=!!rp;if(rp)this.rp.position.lerp(P(rp[0],rp[1],.4),.25);
      if(this.follow){const q=this.rob[sel];if(q){this.ct.target.lerp(q.g.position,.06);const w=q.g.position.clone().add(new THREE.Vector3(0,7,8));this.cam.position.lerp(w,.04)}}}
    if(this.tw){const w=this.tw;w.k=Math.min(1,w.k+dt/1.1);const e=ease(w.k);this.cam.position.lerpVectors(w.p0,w.p1,e);this.ct.target.lerpVectors(w.t0,w.t1,e);if(w.k>=1)this.tw=null}
    this.pt=this.pt.filter(o=>{o.t+=dt/o.dur;if(o.t<0){o.m.visible=false;return true}o.m.visible=true;if(o.t>=1){this.sc.remove(o.m);return false}const e=ease(o.t);o.m.position.lerpVectors(o.a,o.b,e);o.m.position.y+=Math.sin(e*Math.PI)*o.h;o.m.scale.setScalar(.7+Math.sin(e*Math.PI)*.8);return true});
    this.rings=this.rings.filter(o=>{o.t+=dt/1.3;if(o.t<0){o.m.visible=false;return true}o.m.visible=true;if(o.t>=1){this.sc.remove(o.m);return false}o.m.scale.setScalar(1+o.t*11);o.m.material.opacity=1-o.t;return true});
    this.fleetLight.intensity+=(60-this.fleetLight.intensity)*Math.min(1,dt*3);this.core.rotation.y=T*.6;this.trs.forEach((q,i)=>q.rotation.z=T*(i%2?1:-1)*.8);
    if(!this.presentMode)this.ct.update();this.r.render(this.sc,this.cam)}
  dispose(){this.r.setAnimationLoop(null);this.ro.disconnect();this.ct.dispose();this.r.dispose();this.r.domElement.remove()}
}
