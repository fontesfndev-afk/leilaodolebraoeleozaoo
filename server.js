const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('ws');
// ===== CONFIGURAÇÃO: edite aqui =====
const CFG={budget:100,size:5,time:10,mins:90,tick:1100,max:8};
const FORMS={'2-1-1':[2,1,1],'1-2-1':[1,2,1],'1-1-2':[1,1,2]};
const STY={ofensivo:{a:1.12,m:1,d:.88,t:1.25},equilibrado:{a:1,m:1,d:1,t:1},defensivo:{a:.88,m:1,d:1.14,t:.8},posse:{a:.98,m:1.15,d:1,t:.95}};
const FN=['Rafa','Léo','Davi','Caio','Gui','Theo','Nando','Bruno','Vitor','Juca','Pedro','Marcão','Tito','Enzo','Dudu','Kaio'];
const LN=['Silva','Costa','Pires','Moura','Lima','Rocha','Alves','Dantas','Freitas','Neves','Tavares','Barros','Lopes','Melo','Viana','Cunha'];
// =====================================
const pick=a=>a[Math.random()*a.length|0];
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const slots=t=>CFG.size-t.squad.length,maxBid=t=>t.budget-(slots(t)-1);
const roles=f=>['GOL',...Array(FORMS[f][0]).fill('DEF'),...Array(FORMS[f][1]).fill('MEI'),...Array(FORMS[f][2]).fill('ATA')];
const rid=()=>Math.random().toString(36).slice(2,8);
const rooms=new Map();
const tm=(r,pid)=>r.teams.find(t=>t.pid===pid);

function makePool(n){const out=[],used=new Set(),P=['GOL','DEF','DEF','MEI','MEI','ATA','ATA'];
  while(out.length<n){const nm=pick(FN)+' '+pick(LN);if(used.has(nm))continue;used.add(nm);
    out.push({n:nm,p:P[out.length%P.length],o:58+Math.floor(Math.random()**1.7*33)})}
  return shuffle(out)}
function auto(t){const rest=[...t.squad].sort((a,b)=>b.o-a.o);
  t.lineup=roles(t.form).map(r=>{let i=rest.findIndex(p=>p.p===r);if(i<0)i=rest.findIndex(p=>(r==='GOL')===(p.p==='GOL'));if(i<0)i=0;return rest.splice(i,1)[0]})}
const newTeam=(name,id,bot)=>({id,pid:rid(),name,bot:!!bot,f:.7+Math.random()*.6,ws:null,budget:CFG.budget,squad:[],style:'equilibrado',form:'2-1-1',lineup:[],pts:0,j:0,gp:0,gc:0});
function fixtures(ids){const a=[...ids];if(a.length%2)a.push(null);const n=a.length,R=[];
  for(let r=0;r<n-1;r++){const m=[];for(let i=0;i<n/2;i++){const x=a[i],y=a[n-1-i];if(x&&y)m.push({a:x,b:y,ga:0,gb:0,ev:[]})}R.push(m);a.splice(1,0,a.pop())}
  return R}

function snap(r,me){const now=Date.now();
  const tab=[...r.teams].sort((x,y)=>y.pts-x.pts||(y.gp-y.gc)-(x.gp-x.gc)||y.gp-x.gp);
  const fx=r.fix.length?r.fix[Math.min(r.round,r.fix.length-1)]:[];
  return{code:r.code,phase:r.phase,me:me.pid,host:r.host,min:r.min,round:r.round+1,rounds:r.fix.length,log:r.log.slice(0,5),
    teams:r.teams.map(t=>({pid:t.pid,name:t.name,bot:t.bot,on:t.bot||!!t.ws,budget:t.budget,squad:t.squad,style:t.style,form:t.form,lineup:t.lineup})),
    tab:tab.map(t=>({pid:t.pid,name:t.name,pts:t.pts,j:t.j,gp:t.gp,gc:t.gc})),
    auc:r.phase==='auction'?{p:r.q[r.i],n:r.i+1,of:r.q.length,bid:r.bid,by:r.by,ms:Math.max(0,r.end-now)}:null,
    matches:fx.map(m=>({a:m.a,b:m.b,ga:m.ga,gb:m.gb,ev:m.ev}))}}
function push(r){for(const t of r.teams)if(t.ws&&t.ws.readyState===1)t.ws.send(JSON.stringify({t:'state',s:snap(r,t)}))}

// ---------- leilão ----------
function place(r,t,v){r.bid=v;r.by=t.pid;if(r.end-Date.now()<5000)r.end=Date.now()+5000;push(r)}
function nextP(r){r.i++;if(r.i>=r.q.length||r.teams.every(t=>!slots(t)))return endAuction(r);r.bid=0;r.by=null;r.end=Date.now()+CFG.time*1000}
function aTick(r){const p=r.q[r.i];
  for(const t of r.teams){if(!t.bot||t.pid===r.by||!slots(t))continue;
    const v=Math.min(maxBid(t),Math.round(((p.o-55)/35)**2*30*t.f));
    if(r.bid+1<=v&&Math.random()<.35){place(r,t,Math.min(v,r.bid+1+(Math.random()<.3?1:0)));break}}
  if(Date.now()>=r.end){const w=r.by&&tm(r,r.by);
    if(w){w.squad.push(p);w.budget-=r.bid;r.log.unshift(`${w.name} levou ${p.n} (${p.o}) por R$ ${r.bid}`)}else r.log.unshift(`${p.n} ficou sem lances`);
    nextP(r)}
  if(r.phase==='auction')push(r)}
function endAuction(r){clearInterval(r.iv);
  r.teams.forEach(t=>{while(slots(t))t.squad.push({n:'Reserva',p:'MEI',o:50});auto(t)});
  r.fix=fixtures(r.teams.map(t=>t.pid));r.round=0;r.phase='setup';push(r)}

// ---------- partida ----------
function stats(t){const f=FORMS[t.form],R=roles(t.form),S=STY[t.style],g={GOL:[],DEF:[],MEI:[],ATA:[]};
  t.lineup.forEach((p,i)=>{const r=R[i];g[r].push(p.o*(p.p===r?1:(r==='GOL'||p.p==='GOL')?.6:.88))});
  const av=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:40;
  return{gk:av(g.GOL),d:av(g.DEF)*S.d*(1+.08*(f[0]-1)),m:av(g.MEI)*S.m*(1+.08*(f[1]-1)),a:av(g.ATA)*S.a*(1+.08*(f[2]-1)),t:S.t}}
function go(r){r.phase='match';r.min=0;
  r.teams.forEach(t=>{if(t.bot){t.style=pick(Object.keys(STY));t.form=pick(Object.keys(FORMS));auto(t)}});
  r.iv=setInterval(()=>mTick(r),CFG.tick);push(r)}
function mTick(r){r.min++;
  for(const m of r.fix[r.round]){const A=tm(r,m.a),B=tm(r,m.b),sa=stats(A),sb=stats(B);
    const aWins=Math.random()<sa.m/(sa.m+sb.m);const [x,y,X,Y]=aWins?[sa,sb,A,B]:[sb,sa,B,A];
    if(Math.random()<.09*x.t*(x.a/((x.a+y.d)/2))){
      const who=X.lineup[1+(Math.random()*(X.lineup.length-1)|0)].n;
      const q=Math.min(.6,Math.max(.05,.3*Math.pow(x.a/(.55*y.d+.45*y.gk),2)));
      if(Math.random()<q){aWins?m.ga++:m.gb++;m.ev.unshift({min:r.min,team:X.pid,k:'g',tx:`Gol de ${who} (${X.name})`})}
      else m.ev.unshift({min:r.min,team:X.pid,k:'c',tx:`${Y.name} defende o chute de ${who}`});
      if(m.ev.length>14)m.ev.length=14}}
  if(r.min>=CFG.mins){clearInterval(r.iv);
    for(const m of r.fix[r.round]){const A=tm(r,m.a),B=tm(r,m.b);A.j++;B.j++;A.gp+=m.ga;A.gc+=m.gb;B.gp+=m.gb;B.gc+=m.ga;
      if(m.ga>m.gb)A.pts+=3;else if(m.ga<m.gb)B.pts+=3;else{A.pts++;B.pts++}}
    r.round++;r.phase=r.round>=r.fix.length?'end':'setup';r.min=0}
  push(r)}

// ---------- servidor ----------
const srv=http.createServer((q,res)=>{fs.readFile(path.join(__dirname,'public','index.html'),(e,d)=>{
  if(e){res.writeHead(500);return res.end('erro')}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(d)})});
const wss=new WebSocketServer({server:srv});
const err=(ws,m)=>ws.send(JSON.stringify({t:'err',m}));
wss.on('connection',ws=>{let r=null,t=null;
  ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}
    const name=String(m.name||'').trim().slice(0,14),id=String(m.id||'').slice(0,40);
    if(m.t==='create'||m.t==='join'){
      if(!name||!id)return err(ws,'Escreva seu nome.');
      if(m.t==='create'){let c;do{c=Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random()*24|0]).join('')}while(rooms.has(c));
        r={code:c,host:null,phase:'lobby',teams:[],q:[],i:-1,bid:0,by:null,end:0,log:[],fix:[],round:0,min:0,act:Date.now()};rooms.set(c,r);
        t=newTeam(name,id);r.host=t.pid;r.teams.push(t)}
      else{r=rooms.get(String(m.code||'').toUpperCase());
        if(!r)return err(ws,'Sala não encontrada.');
        t=r.teams.find(x=>x.id===id&&!x.bot);
        if(!t){if(r.phase!=='lobby')return err(ws,'Essa sala já começou.');
          if(r.teams.length>=CFG.max)return err(ws,'Sala cheia.');t=newTeam(name,id);r.teams.push(t)}}
      t.ws=ws;r.act=Date.now();return push(r)}
    if(!r||!t)return;r.act=Date.now();const host=r.host===t.pid;
    if(m.t==='addbot'&&host&&r.phase==='lobby'&&r.teams.length<CFG.max){r.teams.push(newTeam('Bot '+pick(FN),rid(),true))}
    else if(m.t==='start'&&host&&r.phase==='lobby'&&r.teams.length>=2){
      r.q=makePool(r.teams.length*CFG.size+10);r.i=-1;r.phase='auction';nextP(r);r.iv=setInterval(()=>aTick(r),1000)}
    else if(m.t==='bid'&&r.phase==='auction'){const v=Math.floor(+m.v);
      if(v>r.bid&&v<=maxBid(t)&&slots(t)>0&&r.by!==t.pid&&Date.now()<r.end)place(r,t,v);else return err(ws,'Lance inválido.')}
    else if(m.t==='style'&&STY[m.s]&&(r.phase==='setup'||r.phase==='match')){t.style=m.s}
    else if(m.t==='form'&&FORMS[m.f]&&(r.phase==='setup'||r.phase==='match')){if(t.form!==m.f){t.form=m.f;auto(t)}}
    else if(m.t==='swap'&&(r.phase==='setup'||r.phase==='match')){const i=m.i|0,j=m.j|0,L=t.lineup;
      if(i>=0&&j>=0&&i<L.length&&j<L.length)[L[i],L[j]]=[L[j],L[i]]}
    else if(m.t==='go'&&host&&r.phase==='setup'){return go(r)}
    else if(m.t==='again'&&host&&r.phase==='end'){r.phase='lobby';r.fix=[];r.round=0;r.log=[];
      r.teams.forEach(x=>{Object.assign(x,{budget:CFG.budget,squad:[],lineup:[],pts:0,j:0,gp:0,gc:0,style:'equilibrado',form:'2-1-1'})})}
    push(r)});
  ws.on('close',()=>{if(t&&t.ws===ws){t.ws=null;if(r)push(r)}})});
setInterval(()=>{for(const [c,r] of rooms)if(Date.now()-r.act>36e5&&r.teams.every(t=>t.bot||!t.ws)){clearInterval(r.iv);rooms.delete(c)}},3e5);
srv.listen(process.env.PORT||3000,()=>console.log('Leilão FC rodando na porta',process.env.PORT||3000));
