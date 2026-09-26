
    const menuToggle=document.querySelector('#menu-toggle');
    const navInner=document.querySelector('#nav-inner');
    menuToggle.addEventListener('click',()=>{const open=navInner.classList.toggle('menu-open');menuToggle.classList.toggle('open',open);menuToggle.setAttribute('aria-expanded',String(open));menuToggle.setAttribute('aria-label',open?'Close navigation':'Open navigation')});
    const navMenus=[...document.querySelectorAll('.nav-menu')];
    document.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'||event.pointerType==='pen')document.body.dataset.navInput='pointer'},true);
    document.addEventListener('keydown',event=>{if(['Tab','Enter',' ','ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key))document.body.dataset.navInput='keyboard'},true);
    navMenus.forEach(menu=>menu.querySelector('summary').addEventListener('pointerup',event=>{if(event.pointerType==='mouse'){const summary=event.currentTarget;requestAnimationFrame(()=>summary.blur())}}));
    const closeNav=()=>{navMenus.forEach(menu=>menu.open=false);navInner.classList.remove('menu-open');menuToggle.classList.remove('open');menuToggle.setAttribute('aria-expanded','false');menuToggle.setAttribute('aria-label','Open navigation')};
    navMenus.forEach(menu=>menu.addEventListener('toggle',()=>{if(menu.open)navMenus.forEach(other=>{if(other!==menu)other.open=false})}));
    const navHoverTimers=new WeakMap();
    const clearNavHover=(menu)=>{const timers=navHoverTimers.get(menu);if(timers){clearTimeout(timers.open);clearTimeout(timers.close)}};
    navMenus.forEach(menu=>{
      menu.addEventListener('pointerenter',event=>{if(event.pointerType!=='mouse'||window.matchMedia('(max-width: 1040px)').matches)return;clearNavHover(menu);navHoverTimers.set(menu,{open:setTimeout(()=>{menu.open=true},100)})});
      menu.addEventListener('pointerleave',event=>{if(event.pointerType!=='mouse'||window.matchMedia('(max-width: 1040px)').matches)return;clearNavHover(menu);navHoverTimers.set(menu,{close:setTimeout(()=>{menu.open=false},250)})});
    });
    document.addEventListener('pointerdown',event=>{if(!navInner.contains(event.target))closeNav()});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){const opener=navMenus.find(menu=>menu.open)?.querySelector('summary');const inside=navInner.contains(document.activeElement);closeNav();if(inside)(window.matchMedia('(max-width: 1040px)').matches?menuToggle:opener)?.focus()}});
    navInner.querySelectorAll('.nav-links a').forEach(link=>link.addEventListener('click',closeNav));
    window.matchMedia('(min-width: 1041px)').addEventListener('change',closeNav);
    const workflowVideo=document.querySelector('#figma-motion video');
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    function updateWorkflowMotion(){if(reducedMotion.matches){workflowVideo.pause()}else{workflowVideo.play().catch(()=>{})}}
    reducedMotion.addEventListener('change',updateWorkflowMotion);
    updateWorkflowMotion();
    const storiesRail=document.querySelector('#stories-rail');
    const storyCards=[...storiesRail.children];
    storyCards.forEach(card=>{const duplicate=card.cloneNode(true);duplicate.setAttribute('aria-hidden','true');duplicate.inert=true;storiesRail.appendChild(duplicate)});
    const storyMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    let storiesPaused=false,storiesVisible=true,storiesResumeAt=0,storiesLastTime=0;
    const storiesLoopWidth=()=>storiesRail.children[storyCards.length].offsetLeft-storiesRail.children[0].offsetLeft;
    function normalizeStories(){const width=storiesLoopWidth();if(width&&storiesRail.scrollLeft>=width)storiesRail.scrollLeft-=width}
    function glideStories(now){
      if(!storiesLastTime)storiesLastTime=now;
      const elapsed=Math.min(now-storiesLastTime,100);
      storiesLastTime=now;
      if(!storyMotion.matches&&storiesVisible&&!storiesPaused&&now>storiesResumeAt){storiesRail.scrollLeft+=elapsed*.052;normalizeStories()}
      requestAnimationFrame(glideStories);
    }
    storiesRail.addEventListener('mouseenter',()=>{storiesPaused=true});
    storiesRail.addEventListener('mouseleave',()=>{storiesPaused=false;storiesResumeAt=0});
    storiesRail.addEventListener('focusin',()=>{storiesPaused=true});
    storiesRail.addEventListener('focusout',event=>{if(!storiesRail.contains(event.relatedTarget)){storiesPaused=false;storiesResumeAt=0}});
    new IntersectionObserver(entries=>{storiesVisible=entries[0].isIntersecting},{threshold:0}).observe(storiesRail);
    storiesRail.addEventListener('pointerdown',()=>{storiesResumeAt=performance.now()+3500});
    storiesRail.addEventListener('touchstart',()=>{storiesResumeAt=performance.now()+3500},{passive:true});
    requestAnimationFrame(glideStories);
  