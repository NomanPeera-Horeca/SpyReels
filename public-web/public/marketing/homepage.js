    const workflowVideo=document.querySelector('#figma-motion video');
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    function updateWorkflowMotion(){if(!workflowVideo)return;if(reducedMotion.matches){workflowVideo.pause()}else{workflowVideo.play().catch(()=>{})}}
    reducedMotion.addEventListener('change',updateWorkflowMotion);
    updateWorkflowMotion();
