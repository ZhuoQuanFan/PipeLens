const N=(id,label,level,status,children=[],source='')=>({id,label,level,status,children,source});
const blocks=Array.from({length:12},(_,i)=>N(`b${i}`,`Block ${i}`,'function',i===6?'fault':'healthy',i===6?[
  N('ln1','LayerNorm 1','logic','healthy'),
  N('attn','CausalSelfAttention','logic','fault',[
    N('qkv','Q / K / V projection','function','healthy'),
    N('score','Attention scores','dataflow','fault',[
      N('qk','q @ kᵀ','statement','healthy'),
      N('scale','Scale by √dₖ','statement','fault',[],'* (1.0 / math.sqrt(k.size(-1)))'),
      N('mask','Causal mask','statement','healthy'),
      N('softmax','Softmax','statement','healthy')
    ]),
    N('av','att @ v','dataflow','healthy')
  ]),
  N('residual','Residual add','dataflow','healthy'),
  N('ln2','LayerNorm 2','logic','healthy'),
  N('mlp','MLP','logic','healthy'),
  N('residual2','Residual add','dataflow','healthy')
]:[]));

const root=N('gpt','GPT.forward','behavior','healthy',[
  N('embedding','Embedding','logic','healthy'),
  N('stack','Transformer Blocks ×12','logic','healthy',blocks),
  N('lnf','Final LayerNorm','logic','healthy'),
  N('head','LM Head','logic','healthy'),
  N('logits','Logits','behavior','healthy')
]);

let focus=root.children[1];
let selected=focus.children[0];
let flowIndex=-1;
let playing=true;
let speed=1;
let timer=0;

const $=id=>document.getElementById(id);

function find(node,id,path=[]){
  const next=[...path,node];
  if(node.id===id)return{node,path:next};
  for(const child of node.children){const result=find(child,id,next);if(result)return result;}
}

function visible(){return focus.children.length?focus.children:[focus];}

function itemsPerRow(){
  const width=window.innerWidth;
  const count=visible().length;
  let capacity=4;
  if(width>=3000)capacity=8;
  else if(width>=2300)capacity=7;
  else if(width>=1700)capacity=6;
  else if(width>=1380)capacity=5;
  else if(width<1050)capacity=3;
  capacity=Math.max(1,Math.min(capacity,count));
  if(count===12&&capacity>=6)return 6;
  if(count>capacity&&count%capacity===1&&capacity>3)return capacity-1;
  return capacity;
}

function rows(){
  const nodes=visible();
  const capacity=itemsPerRow();
  const result=[];
  for(let start=0;start<nodes.length;start+=capacity){
    result.push(nodes.slice(start,start+capacity).map((node,offset)=>({node,index:start+offset})));
  }
  return result;
}

function faultIndex(){return visible().findIndex(node=>node.status==='fault');}
function stopIndex(){const fault=faultIndex();return fault>=0?fault:visible().length;}
function phaseFor(index){if(flowIndex>index)return'passed';if(flowIndex===index)return'active';return'future';}

function render(){
  const nodes=visible();
  const fault=faultIndex();
  const blocked=fault>=0&&flowIndex>=fault;
  const path=find(root,focus.id).path;

  $('crumbs').innerHTML=path.map(node=>`<button type="button" data-nav="${node.id}"><strong>${node.label}</strong> ›</button>`).join('');
  $('density').textContent=`${itemsPerRow()}/row`;
  $('flow-mode').textContent=blocked?'FLOW BLOCKED':'CODE FLOW';
  $('current-label').textContent=flowIndex<0?'source':blocked?`BLOCKED · ${nodes[fault].label}`:flowIndex>=nodes.length?'output':nodes[flowIndex].label;
  $('live-dot').className=`live-dot${blocked?' blocked':''}`;
  $('play-button').textContent=blocked?'Replay':playing?'Pause':'Play';

  let html='';
  const grouped=rows();
  grouped.forEach((row,rowIndex)=>{
    const reverse=rowIndex%2===1;
    const last=rowIndex===grouped.length-1;
    html+=`<div class="rowwrap"><div class="row ${reverse?'reverse':''}">`;
    if(rowIndex===0)html+='<div class="terminal">IN</div>';
    row.forEach(({node,index})=>{
      const phase=phaseFor(index);
      const activeFault=node.status==='fault'&&phase==='active';
      html+=`<div class="step">
        <div class="pipe ${phase}"><i class="water ${node.status==='fault'?'red':'blue'}"></i></div>
        <button class="part ${node.status==='fault'?'fault':''} ${phase} ${selected.id===node.id?'selected':''}" type="button" data-pick="${node.id}">
          <span class="level">${node.level}</span><strong>${node.label}</strong>
          <div class="window"><i></i></div><em>${node.children.length?`open ×${node.children.length}`:'source'}</em>
          ${activeFault?'<b class="flag">!</b>':''}
        </button>
      </div>`;
    });
    if(last)html+=`<div class="pipe ${phaseFor(nodes.length)}"><i class="water blue"></i></div><div class="terminal">OUT</div>`;
    html+='</div>';
    if(!last)html+=`<div class="turn ${reverse?'left':'right'}"></div>`;
    html+='</div>';
  });
  $('board').innerHTML=html;
  $('stop-callout').innerHTML=blocked?`<div class="stopcall"><strong>Execution stopped at ${nodes[fault].label}</strong><span>Downstream code remains unexecuted.</span></div>`:'';
  $('hint').textContent=focus.children.length?`${focus.label} contains ${focus.children.length} parts. Click a component to drill deeper.`:'Lowest semantic unit.';

  $('selected-title').textContent=selected.label;
  $('selected-state').textContent=selected.status==='fault'?'fault boundary':'normal path';
  $('selected-state').className=`state${selected.status==='fault'?' fault':''}`;
  $('selected-level').textContent=selected.level;
  $('selected-source').textContent=selected.source;
  $('selected-source').hidden=!selected.source;

  bindDynamicHandlers();
}

function bindDynamicHandlers(){
  document.querySelectorAll('[data-pick]').forEach(button=>button.addEventListener('click',()=>pick(button.dataset.pick)));
  document.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.nav)));
}

function pick(id){
  const result=find(root,id);if(!result)return;
  selected=result.node;
  if(selected.children.length){focus=selected;selected=selected.children[0];restart();}else render();
}

function navigate(id){const result=find(root,id);if(!result)return;focus=result.node;selected=result.node;restart();}

function schedule(){
  window.clearInterval(timer);
  timer=window.setInterval(()=>{
    if(!playing)return;
    const stop=stopIndex();
    flowIndex=Math.min(flowIndex+1,stop);
    if(flowIndex>=stop)playing=false;
    render();
  },Math.max(180,900/speed));
}

function restart(){flowIndex=-1;playing=true;render();schedule();}
function toggle(){const fault=faultIndex();if(fault>=0&&flowIndex>=fault){restart();return;}playing=!playing;render();}

$('play-button').addEventListener('click',toggle);
$('restart-button').addEventListener('click',restart);
$('speed-select').addEventListener('change',event=>{speed=Number(event.target.value);schedule();});
window.addEventListener('resize',render);

render();
schedule();
