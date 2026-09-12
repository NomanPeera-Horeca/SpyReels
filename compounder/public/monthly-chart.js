(function(){
  'use strict';
  const CARD_ID='monthlyHistoryCard';
  let currentSymbol=null;

  function ensureCard(){
    let card=document.getElementById(CARD_ID);
    if(card) return card;
    const detail=document.getElementById('detailView');
    const hero=detail?.querySelector('.detailHero');
    if(!detail||!hero) return null;
    card=document.createElement('div');
    card.id=CARD_ID;
    card.className='card';
    card.innerHTML=`
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap">
        <div>
          <h2 style="margin:0">Price history</h2>
          <div id="monthlyHistorySub" class="summaryLine">10 years of monthly adjusted closes</div>
        </div>
        <div class="tag unknown" id="monthlyHistoryCount">Loading…</div>
      </div>
      <div style="position:relative;height:310px;margin-top:14px">
        <canvas id="monthlyHistoryCanvas" style="width:100%;height:100%;display:block;touch-action:none"></canvas>
        <div id="monthlyHistoryTip" style="display:none;position:absolute;pointer-events:none;background:#111318;color:white;padding:8px 10px;border-radius:10px;font-size:12px;font-weight:800;transform:translate(-50%,-118%);white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.18)"></div>
      </div>
      <div class="sourceNote">Monthly adjusted closing prices. Hover on desktop or drag on mobile to inspect each month.</div>`;
    hero.insertAdjacentElement('afterend',card);
    return card;
  }

  async function load(symbol){
    currentSymbol=symbol;
    const card=ensureCard();
    if(!card) return;
    const sub=document.getElementById('monthlyHistorySub');
    const count=document.getElementById('monthlyHistoryCount');
    sub.textContent='Loading monthly price history…';
    count.textContent='Loading…';
    try{
      const r=await fetch('/api/stocks/'+encodeURIComponent(symbol)+'/history?years=10',{cache:'no-store'});
      const j=await r.json();
      if(!r.ok||!Array.isArray(j.data)||j.data.length<2) throw new Error(j.error||'No monthly history');
      sub.textContent='Monthly adjusted close · hover or drag to inspect';
      count.textContent=j.availableMonths+' months';
      draw(j.data);
    }catch(err){
      sub.textContent='Monthly history is temporarily unavailable';
      count.textContent='Unavailable';
      const c=document.getElementById('monthlyHistoryCanvas');
      if(c){const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height)}
    }
  }

  function draw(data){
    const c=document.getElementById('monthlyHistoryCanvas');
    if(!c) return;
    const rect=c.getBoundingClientRect();
    if(rect.width<10||rect.height<10){requestAnimationFrame(()=>draw(data));return}
    const dpr=Math.max(1,window.devicePixelRatio||1);
    c.width=Math.round(rect.width*dpr);
    c.height=Math.round(rect.height*dpr);
    const ctx=c.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const w=rect.width,h=rect.height,pad={l:18,r:18,t:20,b:34};
    ctx.clearRect(0,0,w,h);
    const vals=data.map(x=>Number(x.price)).filter(Number.isFinite);
    if(vals.length<2) return;
    const min=Math.min(...vals),max=Math.max(...vals),span=Math.max(.01,max-min);
    const pts=data.map((d,i)=>({
      ...d,
      x:pad.l+i*(w-pad.l-pad.r)/Math.max(1,data.length-1),
      y:pad.t+(max-Number(d.price))*(h-pad.t-pad.b)/span
    }));

    const grad=ctx.createLinearGradient(0,pad.t,0,h-pad.b);
    grad.addColorStop(0,'rgba(8,122,67,.18)');
    grad.addColorStop(1,'rgba(8,122,67,0)');
    ctx.beginPath();
    pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.lineTo(pts[pts.length-1].x,h-pad.b);ctx.lineTo(pts[0].x,h-pad.b);ctx.closePath();ctx.fillStyle=grad;ctx.fill();

    ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.strokeStyle='#111318';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();

    ctx.font='11px Inter,system-ui,sans-serif';ctx.fillStyle='#667085';ctx.textAlign='center';
    const labels=[];
    data.forEach((d,i)=>{
      const y=String(d.period).slice(0,4),m=String(d.period).slice(5,7);
      if(m==='01'&&!labels.includes(y)){
        labels.push(y);
        if(labels.length===1||Number(y)%2===0||i===data.length-1) ctx.fillText(y,pts[i].x,h-10);
      }
    });
    c._monthly={data,pts,w,h,pad};
  }

  function inspect(ev){
    const c=document.getElementById('monthlyHistoryCanvas');
    if(!c?._monthly) return;
    const state=c._monthly,rect=c.getBoundingClientRect();
    const clientX=ev.touches?.[0]?.clientX??ev.clientX;
    const x=clientX-rect.left;
    const p=state.pts.reduce((a,b)=>Math.abs(b.x-x)<Math.abs(a.x-x)?b:a);
    draw(state.data);
    const dpr=Math.max(1,window.devicePixelRatio||1),ctx=c.getContext('2d');
    ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.strokeStyle='rgba(17,19,24,.2)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x,16);ctx.lineTo(p.x,state.h-state.pad.b);ctx.stroke();
    ctx.fillStyle='#111318';ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fill();ctx.restore();
    const tip=document.getElementById('monthlyHistoryTip');
    if(tip){const dt=new Date(p.date);tip.textContent=dt.toLocaleDateString('en-US',{month:'short',year:'numeric'})+' · $'+Number(p.price).toFixed(2);tip.style.display='block';tip.style.left=p.x+'px';tip.style.top=p.y+'px'}
  }

  function bind(){
    const card=ensureCard();
    if(!card) return;
    const c=document.getElementById('monthlyHistoryCanvas');
    if(c&&!c.dataset.bound){
      c.dataset.bound='1';
      c.addEventListener('mousemove',inspect);
      c.addEventListener('touchstart',inspect,{passive:true});
      c.addEventListener('touchmove',inspect,{passive:true});
      c.addEventListener('mouseleave',()=>{const t=document.getElementById('monthlyHistoryTip');if(t)t.style.display='none';if(c._monthly)draw(c._monthly.data)});
      window.addEventListener('resize',()=>{if(c._monthly)draw(c._monthly.data)});
    }
  }

  const originalOpen=window.openDetail;
  if(typeof originalOpen==='function'){
    window.openDetail=async function(encoded){
      await originalOpen(encoded);
      bind();
      try{const x=JSON.parse(encoded);await load(x.symbol)}catch(_e){}
    };
  }
  document.addEventListener('DOMContentLoaded',bind);
})();
