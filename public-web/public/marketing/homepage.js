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
  
