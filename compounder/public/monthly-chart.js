(function(){
  'use strict';

  const CARD_ID='monthlyHistoryCard';
  let currentSymbol=null;
  let allData=[];
  let currentYears=10;

  function removeLegacyChart(){
    const injectedLegacy=document.getElementById('historyCard');
    if(injectedLegacy) injectedLegacy.remove();
    const original=document.querySelector('#detailView .chartCard');
    if(original) original.classList.add('hidden');
  }

  function ensureCard(){
    removeLegacyChart();
    let card=document.getElementById(CARD_ID);
    if(card) return card;
    const detail=document.getElementById('detailView');
    const hero=detail?.querySelector('.detailHero');
    if(!detail||!hero) return null;

    card=document.createElement('div');
    card.id=CARD_ID;
    card.className='card';
    card.innerHTML=`
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <h2 style="margin:0">Price history</h2>
          <div id="monthlyHistorySub" class="summaryLine">Monthly adjusted closes, hover or drag to inspect</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="periods" id="monthlyPeriods">
            <button type="button" class="periodBtn" data-monthly-years="5">5Y</button>
            <button type="button" class="periodBtn active" data-monthly-years="10">10Y</button>
          </div>
          <div class="tag unknown" id="monthlyHistoryCount">Loading…</div>
        </div>
      </div>
      <div style="position:relative;height:310px;margin-top:14px">
        <canvas id="monthlyHistoryCanvas" style="width:100%;height:100%;display:block;touch-action:none"></canvas>
        <div id="monthlyHistoryTip" style="display:none;position:absolute;pointer-events:none;background:#111318;color:white;padding:8px 10px;border-radius:10px;font-size:12px;font-weight:800;transform:translate(-50%,-118%);white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.18)"></div>
      </div>
      <div class="sourceNote">Monthly adjusted closing prices from Alpaca IEX. More detail helps reveal drawdowns and recoveries, but historical price patterns do not reliably predict future returns.</div>`;
    hero.insertAdjacentElement('afterend',card);
    return card;
  }

  function visibleDetailSymbol(){
    const detail=document.getElementById('detailView');
    if(!detail||detail.classList.contains('hidden')) return null;
    const symbol=(document.getElementById('dTicker')?.textContent||'').trim().toUpperCase();
    return /^[A-Z0-9.\-]+$/.test(symbol)?symbol:null;
  }

  function filterYears(data,years){
    if(!data.length) return [];
    const last=new Date(data[data.length-1].date);
    const cutoff=new Date(last);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear()-years);
    return data.filter(row=>new Date(row.date)>=cutoff);
  }

  function renderSelectedPeriod(){
    const shown=filterYears(allData,currentYears);
    const count=document.getElementById('monthlyHistoryCount');
    if(count) count.textContent=shown.length+' months';
    draw(shown);
  }

  async function load(symbol){
    if(!symbol) return;
    currentSymbol=symbol;
    const card=ensureCard();
    if(!card) return;
    const sub=document.getElementById('monthlyHistorySub');
    const count=document.getElementById('monthlyHistoryCount');
    if(sub) sub.textContent='Loading monthly price history…';
    if(count) count.textContent='Loading…';

    try{
      const r=await fetch('/api/stocks/'+encodeURIComponent(symbol)+'/history?years=10',{cache:'no-store'});
      const j=await r.json();
      if(!r.ok||!Array.isArray(j.data)||j.data.length<2) throw new Error(j.error||'No monthly history');
      if(currentSymbol!==symbol) return;
      allData=j.data;
      if(sub) sub.textContent='Monthly adjusted close · hover or drag to inspect';
      renderSelectedPeriod();
    }catch(err){
      if(currentSymbol!==symbol) return;
      allData=[];
      if(sub) sub.textContent='Monthly history is temporarily unavailable';
      if(count) count.textContent='Unavailable';
      const c=document.getElementById('monthlyHistoryCanvas');
      if(c){const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height)}
    }
  }

  function draw(data){
    const c=document.getElementById('monthlyHistoryCanvas');
    if(!c) return;
    const rect=c.getBoundingClientRect();
    if(rect.width<10||rect.height<10){
      requestAnimationFrame(()=>{if(document.body.contains(c)) draw(data)});
      return;
    }

    const dpr=Math.max(1,window.devicePixelRatio||1);
    c.width=Math.round(rect.width*dpr);
    c.height=Math.round(rect.height*dpr);
    const ctx=c.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const w=rect.width,h=rect.height,pad={l:18,r:18,t:20,b:34};
    ctx.clearRect(0,0,w,h);

    const clean=data.filter(x=>Number.isFinite(Number(x.price)));
    if(clean.length<2) return;
    const vals=clean.map(x=>Number(x.price));
    const min=Math.min(...vals),max=Math.max(...vals),span=Math.max(.01,max-min);
    const pts=clean.map((d,i)=>({
      ...d,
      x:pad.l+i*(w-pad.l-pad.r)/Math.max(1,clean.length-1),
      y:pad.t+(max-Number(d.price))*(h-pad.t-pad.b)/span
    }));

    ctx.strokeStyle='#e7eaee';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad.l,h-pad.b);ctx.lineTo(w-pad.r,h-pad.b);ctx.stroke();
    const grad=ctx.createLinearGradient(0,pad.t,0,h-pad.b);
    grad.addColorStop(0,'rgba(8,122,67,.18)');
    grad.addColorStop(1,'rgba(8,122,67,0)');
    ctx.beginPath();
    pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.lineTo(pts[pts.length-1].x,h-pad.b);ctx.lineTo(pts[0].x,h-pad.b);ctx.closePath();ctx.fillStyle=grad;ctx.fill();

    ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.strokeStyle='#111318';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();

    ctx.font='11px Inter,system-ui,sans-serif';ctx.fillStyle='#667085';ctx.textAlign='center';
    const seen=new Set();
    const labelEvery=currentYears<=5?1:2;
    clean.forEach((d,i)=>{
      const year=String(d.period).slice(0,4),month=String(d.period).slice(5,7);
      if(month==='01'&&!seen.has(year)){
        seen.add(year);
        if(seen.size===1||Number(year)%labelEvery===0||i===clean.length-1) ctx.fillText(year,pts[i].x,h-10);
      }
    });
    c._monthly={data:clean,pts,w,h,pad};
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
    if(tip){
      const dt=new Date(p.date);
      tip.textContent=dt.toLocaleDateString('en-US',{month:'short',year:'numeric'})+' · $'+Number(p.price).toFixed(2);
      tip.style.display='block';tip.style.left=p.x+'px';tip.style.top=p.y+'px';
    }
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
      c.addEventListener('mouseleave',()=>{
        const t=document.getElementById('monthlyHistoryTip');
        if(t)t.style.display='none';
        if(c._monthly)draw(c._monthly.data);
      });
      window.addEventListener('resize',()=>{if(c._monthly)draw(c._monthly.data)});
    }

    card.querySelectorAll('[data-monthly-years]').forEach(btn=>{
      if(btn.dataset.monthlyBound) return;
      btn.dataset.monthlyBound='1';
      btn.addEventListener('click',()=>{
        currentYears=Number(btn.dataset.monthlyYears)||10;
        card.querySelectorAll('[data-monthly-years]').forEach(b=>b.classList.toggle('active',b===btn));
        renderSelectedPeriod();
      });
    });
  }

  function wrapFinalOpenDetail(){
    const originalOpen=window.openDetail;
    if(typeof originalOpen!=='function'||originalOpen.__monthlyHistoryWrapped) return;
    const wrapped=async function(encoded){
      await originalOpen(encoded);
      bind();
      try{
        const x=JSON.parse(encoded);
        if(x?.symbol) await load(String(x.symbol).toUpperCase());
      }catch(_e){}
    };
    wrapped.__monthlyHistoryWrapped=true;
    window.openDetail=wrapped;
  }

  function init(){
    bind();
    const alreadyOpen=visibleDetailSymbol();
    if(alreadyOpen) load(alreadyOpen);
    // The server appends one final enhancement script after this file. Wrap after
    // the current parser turn so we always attach to the final openDetail function.
    setTimeout(wrapFinalOpenDetail,0);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
