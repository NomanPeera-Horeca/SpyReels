
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
