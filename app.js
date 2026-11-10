const $ = (s) => document.querySelector(s);
const state = { materials: [], byName: new Map(), selected: '', selectedLayer: 0, thicknessStep: 1, liveTimer: 0, layers: [], result: [], reference: [], colors: new Map() };
const palette = ['#108fa1','#314f75','#58a7b2','#7b63a8','#b26e52','#2f9a72','#5f7db5','#b48736','#5d9d57','#9b628d'];
const els = Object.fromEntries(['materialList','materialSearch','materialCount','layerRows','layerEmpty','layerCount','stackVisual','substrate','substrateOptions','substrateThickness','backSurface','waveMin','waveMax','waveStep','rangeNote','chart','chartEmpty','chartTooltip','summary','nkDialog','nkTitle','nkComment','nkChart','nkRange','showCalcMarkers','showRefMarkers','showNkMarkers','toast','tunerLayerName','tunerLayerIndex','tunerThickness','thicknessSteps','thicknessDown','thicknessUp','liveSimulation'].map((id) => [id, document.getElementById(id)]));

function colorFor(name) { if (!state.colors.has(name)) state.colors.set(name, palette[state.colors.size % palette.length]); return state.colors.get(name); }
function toast(message) { els.toast.textContent = message; els.toast.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => els.toast.classList.remove('show'), 2200); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function download(name, text, type = 'text/plain') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

function parseNk(text, name) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'); const points = []; let comment = '';
  if (lines[0]?.trim() === 'VERSION*1*') {
    for (const line of lines) { const p = line.split('*'); if (p[0] === 'DATA1' && p.length >= 5) points.push([+p[2],+p[3],+p[4]]); if (p[0] === 'COMMENT') comment += `${p.slice(1).join('*')}\n`; }
  } else {
    const ds = lines.findIndex((x) => x.trim() === 'Data:'); const cs = lines.findIndex((x) => x.trim() === 'Comment:'); const end = cs < 0 ? lines.length : cs;
    for (let i = ds + 1; i < end; i++) { const p = lines[i].trim().split(/[\t, ]+/).map(Number); if (p.length >= 3 && p.every(Number.isFinite)) points.push(p.slice(0,3)); }
    if (cs >= 0) comment = lines.slice(cs + 1).filter((x) => x.trim() !== 'EOF').join('\n').trim();
  }
  points.sort((a,b) => a[0] - b[0]); return {name, comment, points};
}

async function loadBundledMaterials() {
  const index = await fetch('Materials/index.txt').then((r) => { if (!r.ok) throw new Error('材料一覧を読み込めません'); return r.text(); });
  const files = index.split(/\r?\n/).map((x) => x.trim()).filter((x) => x.toLowerCase().endsWith('.nk'));
  const materials = new Array(files.length); let cursor = 0;
  async function worker() { while (cursor < files.length) { const i=cursor++,file=files[i],url=`Materials/${encodeURIComponent(file)}`; const text=await fetch(url).then((r)=>{if(!r.ok)throw new Error(`${file} を読み込めません`);return r.text()}); materials[i]=parseNk(text,file.replace(/\.nk$/i,'')); } }
  await Promise.all(Array.from({length:Math.min(12,files.length)},worker));
  return materials.filter((m) => m.points.length);
}

async function init() {
  try {
    state.materials = await loadBundledMaterials(); state.byName = new Map(state.materials.map((m) => [m.name, m]));
    const saved = JSON.parse(localStorage.getItem('hakumaku-state') || 'null');
    if (saved) {
      state.layers = (saved.layers || []).filter((x) => state.byName.has(x.name)).slice(0,100);
      els.substrateThickness.value = saved.substrateThickness ?? 1; els.backSurface.checked = saved.backSurface ?? true;
      els.waveMin.value = saved.waveMin ?? 400; els.waveMax.value = saved.waveMax ?? 800; els.waveStep.value = saved.waveStep ?? 1; els.liveSimulation.checked = saved.liveSimulation ?? true; els.showCalcMarkers.checked = saved.showCalcMarkers ?? saved.showMarkers ?? false; els.showRefMarkers.checked = saved.showRefMarkers ?? false; els.showNkMarkers.checked = saved.showNkMarkers ?? false;
    } else state.layers = [{name:'MGF2',thickness:99.74},{name:'TIO2',thickness:121.49},{name:'MGF2',thickness:33.86},{name:'TIO2',thickness:15.5}].filter((x) => state.byName.has(x.name));
    state.selectedLayer = state.layers.length ? 0 : -1; renderMaterialList(); renderSubstrates(saved?.substrate || (state.byName.has('GLASS') ? 'GLASS' : state.materials[0].name)); renderLayers(); updateRange(); bind(); calculate({silent:true});
  } catch (e) { toast(e.message); $('.workspace').innerHTML = `<div class="panel empty-state"><b>起動できませんでした</b><small>${esc(e.message)}</small></div>`; }
}

function renderMaterialList() {
  const q = els.materialSearch.value.trim().toLowerCase(); const list = state.materials.filter((m) => m.name.toLowerCase().includes(q));
  els.materialCount.textContent = `${list.length} / ${state.materials.length}`;
  els.materialList.innerHTML = list.map((m) => { const lo=m.points[0]?.[0], hi=m.points.at(-1)?.[0]; return `<div class="material-item ${state.selected===m.name?'selected':''}" data-name="${esc(m.name)}" role="option"><i class="material-swatch" style="background:${colorFor(m.name)}"></i><span class="material-meta"><b>${esc(m.name)}</b><small>${Math.round(lo)}–${Math.round(hi)} nm · ${m.points.length}点</small></span><button class="material-info" data-info="${esc(m.name)}" title="光学定数を見る">ⓘ</button></div>`; }).join('');
}

function renderSubstrates(selected) { els.substrateOptions.innerHTML = state.materials.map((m) => `<option value="${esc(m.name)}"></option>`).join(''); els.substrate.value = state.byName.has(selected) ? selected : state.materials[0].name; els.substrate.dataset.valid = els.substrate.value; }
function commitSubstrate({revertInvalid=true}={}) { const typed=els.substrate.value.trim().toLowerCase(),match=state.materials.find((m)=>m.name.toLowerCase()===typed); if(match){els.substrate.value=match.name;els.substrate.dataset.valid=match.name;renderLayers();scheduleLive();return true}if(revertInvalid){toast('一覧にある材料名を入力してください');els.substrate.value=els.substrate.dataset.valid||'GLASS'}return false; }
function opticalThickness(layer) { const m = state.byName.get(layer.name); const n = m ? nkAt(m, 550)[0] : 0; return n * layer.thickness; }
function renderLayers() {
  if (!state.layers.length) state.selectedLayer = -1; else state.selectedLayer = clamp(state.selectedLayer, 0, state.layers.length - 1);
  els.layerCount.textContent = `${state.layers.length} / 100 層`; els.layerEmpty.style.display = state.layers.length ? 'none' : 'grid';
  els.layerRows.innerHTML = state.layers.map((l,i) => `<tr class="${i===state.selectedLayer?'selected':''}" data-row="${i}"><td>${i+1}</td><td><span class="layer-name"><i style="background:${colorFor(l.name)}"></i>${esc(l.name)}</span></td><td><input type="number" min="0" step="0.01" value="${l.thickness}" data-thickness="${i}" aria-label="${esc(l.name)}の膜厚"></td><td>${opticalThickness(l).toFixed(1)} nm</td><td><div class="row-actions"><button data-move="up" data-i="${i}" title="上へ">↑</button><button data-move="down" data-i="${i}" title="下へ">↓</button><button data-copy="${i}" title="複製">⧉</button><button data-delete="${i}" title="削除">×</button></div></td></tr>`).join('');
  renderStackVisual(); renderTuner();
  saveLocal();
}
function renderStackVisual() { const total = state.layers.reduce((n,l) => n + Math.max(0,+l.thickness||0),0) || 1; els.stackVisual.innerHTML = state.layers.map((l,i) => `<div class="visual-layer ${i===state.selectedLayer?'selected':''}" data-visual-row="${i}" style="background:${colorFor(l.name)};flex:${Math.max(12,l.thickness) / total * 100}"><span>${esc(l.name)}</span></div>`).join('') + `<div class="visual-substrate">${esc(els.substrate.value || '基板')}</div>`; }
function renderTuner() { const layer=state.layers[state.selectedLayer],disabled=!layer; els.tunerLayerName.textContent=layer?layer.name:'レイヤーを選択'; els.tunerLayerIndex.textContent=layer?`レイヤー ${state.selectedLayer+1} / ${state.layers.length}`:'表の行をクリックしてください'; els.tunerThickness.disabled=disabled; els.thicknessDown.disabled=disabled; els.thicknessUp.disabled=disabled; els.tunerThickness.value=layer?layer.thickness:0; els.thicknessSteps.querySelectorAll('button').forEach((b)=>b.classList.toggle('active',+b.dataset.step===state.thicknessStep)); }
function selectLayer(index) { if (index<0||index>=state.layers.length) return; state.selectedLayer=index; els.layerRows.querySelectorAll('tr').forEach((tr,i)=>tr.classList.toggle('selected',i===index)); renderStackVisual(); renderTuner(); }
function scheduleLive() { saveLocal(); if (!els.liveSimulation.checked || !state.layers.length) return; clearTimeout(state.liveTimer); state.liveTimer=setTimeout(()=>calculate({silent:true}),35); }
function setSelectedThickness(value,{rerender=false}={}) { const layer=state.layers[state.selectedLayer]; if(!layer)return; layer.thickness=Math.max(0,Math.round((+value||0)*1000)/1000); const input=els.layerRows.querySelector(`[data-thickness="${state.selectedLayer}"]`); if(input&&document.activeElement!==input)input.value=layer.thickness; els.tunerThickness.value=layer.thickness; renderStackVisual(); if(rerender)renderLayers(); else scheduleLive(); }
function adjustThickness(direction) { const layer=state.layers[state.selectedLayer]; if(!layer)return; setSelectedThickness(layer.thickness+direction*state.thicknessStep,{rerender:true}); scheduleLive(); }
function addLayer(name) { if (!state.byName.has(name)) return; if (state.layers.length >= 100) return toast('最大100層です'); state.layers.push({name,thickness:100}); state.selectedLayer=state.layers.length-1; renderLayers(); scheduleLive(); toast(`${name} を追加しました`); }
function saveLocal() { if (!state.materials.length) return; localStorage.setItem('hakumaku-state', JSON.stringify({layers:state.layers,substrate:els.substrate.value,substrateThickness:+els.substrateThickness.value,backSurface:els.backSurface.checked,waveMin:+els.waveMin.value,waveMax:+els.waveMax.value,waveStep:+els.waveStep.value,liveSimulation:els.liveSimulation.checked,showCalcMarkers:els.showCalcMarkers.checked,showRefMarkers:els.showRefMarkers.checked,showNkMarkers:els.showNkMarkers.checked})); }

function nkAt(material, wave) {
  const p = material.points; if (wave <= p[0][0]) return [p[0][1],p[0][2]]; if (wave >= p.at(-1)[0]) return [p.at(-1)[1],p.at(-1)[2]];
  let lo=0, hi=p.length-1; while (hi-lo>1) { const mid=(lo+hi)>>1; if (p[mid][0] < wave) lo=mid; else hi=mid; }
  const t=(wave-p[lo][0])/(p[hi][0]-p[lo][0]); return [p[lo][1]+t*(p[hi][1]-p[lo][1]),p[lo][2]+t*(p[hi][2]-p[lo][2])];
}
const C=(re=0,im=0)=>({re,im}), add=(a,b)=>C(a.re+b.re,a.im+b.im), sub=(a,b)=>C(a.re-b.re,a.im-b.im), mul=(a,b)=>C(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re), div=(a,b)=>{const d=b.re*b.re+b.im*b.im;return C((a.re*b.re+a.im*b.im)/d,(a.im*b.re-a.re*b.im)/d)}, scale=(a,s)=>C(a.re*s,a.im*s), abs2=(a)=>a.re*a.re+a.im*a.im;
function csin(z){return C(Math.sin(z.re)*Math.cosh(z.im),Math.cos(z.re)*Math.sinh(z.im))} function ccos(z){return C(Math.cos(z.re)*Math.cosh(z.im),-Math.sin(z.re)*Math.sinh(z.im))}
function layerMatrix(layers, wave) {
  let M=[C(1),C(),C(),C(1)];
  for (const layer of layers) { const [n,k]=nkAt(state.byName.get(layer.name),wave), N=C(n,-k), d=scale(N,2*Math.PI*layer.thickness/wave), co=ccos(d), si=csin(d); const L=[co,div(mul(C(0,1),si),N),mul(mul(C(0,1),N),si),co]; M=[add(mul(M[0],L[0]),mul(M[1],L[2])),add(mul(M[0],L[1]),mul(M[1],L[3])),add(mul(M[2],L[0]),mul(M[3],L[2])),add(mul(M[2],L[1]),mul(M[3],L[3]))]; }
  return M;
}
function interfaceRT(layers, wave, nIn, nOut) {
  const M=layerMatrix(layers,wave), B=add(M[0],mul(M[1],nOut)), D=add(mul(nIn,B),add(M[2],mul(M[3],nOut))), Cc=add(M[2],mul(M[3],nOut));
  const r=div(sub(mul(nIn,B),Cc),D), t=div(scale(nIn,2),D); return {R:abs2(r),T:(nOut.re/Math.max(1e-12,nIn.re))*abs2(t)};
}
function calculate({silent=false}={}) {
  const min=+els.waveMin.value,max=+els.waveMax.value,step=+els.waveStep.value,subMat=state.byName.get(els.substrate.value),thickness=+els.substrateThickness.value;
  if (!state.layers.length) return toast('薄膜を1層以上追加してください'); if (!subMat) return toast('基板を選択してください'); if (!(step>0&&max>=min)) return toast('波長範囲を確認してください');
  const count=Math.floor((max-min)/step)+1; if (count>5000) return toast('データ点は5000点以下にしてください');
  const result=[]; for(let i=0;i<count;i++){const w=min+i*step,[ns,ks]=nkAt(subMat,w),N=C(ns,-ks),front=interfaceRT(state.layers,w,C(1),N); let T=front.T,R=front.R;
    if(els.backSurface.checked){const reverse=interfaceRT([...state.layers].reverse(),w,N,C(1)),back=interfaceRT([],w,N,C(1)),a=Math.exp(-4*Math.PI*ks/w*thickness*1e6),den=1-reverse.R*back.R*a*a;T=front.T*back.T*a/den;R=front.R+front.T*reverse.T*back.R*a*a/den;}
    result.push({w,T:Math.max(0,T),R:Math.max(0,R)});
  }
  state.result=result; drawChart(); renderSummary(); saveLocal(); if(!silent)toast(`${result.length} 点を計算しました`);
}

function canvasSetup(canvas) { const r=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1; canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w:r.width,h:r.height}; }
function niceStep(span,target=5){if(!(span>0))return 1;const raw=span/target,pow=10**Math.floor(Math.log10(raw)),n=raw/pow;return(n<=1?1:n<=2?2:n<=5?5:10)*pow}
function tickLabel(value,step){const digits=step>=1?0:Math.min(4,Math.max(1,Math.ceil(-Math.log10(step))));return Number(value.toFixed(digits)).toString()}
function drawMarkers(ctx,arr,point,color,maxCount){if(!arr.length)return;const step=Math.max(1,Math.ceil(arr.length/Math.max(1,maxCount))),indices=[];for(let i=0;i<arr.length;i+=step)indices.push(i);if(indices.at(-1)!==arr.length-1)indices.push(arr.length-1);ctx.fillStyle='#fff';ctx.strokeStyle=color;ctx.lineWidth=1.4;for(const i of indices){const [x,y]=point(arr[i]);ctx.beginPath();ctx.arc(x,y,2.35,0,Math.PI*2);ctx.fill();ctx.stroke()}}
function drawChart() {
  const {ctx,w,h}=canvasSetup(els.chart);ctx.clearRect(0,0,w,h);const data=state.result.length?state.result:state.reference;if(!data.length){els.chartEmpty.style.display='grid';return}els.chartEmpty.style.display='none';
  const all=[...state.result,...state.reference],rawMin=Math.min(...all.map(x=>x.w)),rawMax=Math.max(...all.map(x=>x.w)),xmin=rawMin===rawMax?rawMin-.5:rawMin,xmax=rawMin===rawMax?rawMax+.5:rawMax,pad={l:62,r:24,t:22,b:48},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b,tx=(x)=>pad.l+(x-xmin)/(xmax-xmin||1)*pw,ty=(y)=>pad.t+(1-clamp(y,0,1)/1)*ph,axis='#505762',grid='#e4e7eb',label='#59616c';
  ctx.font='11px -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif';ctx.fillStyle=label;ctx.lineWidth=1;
  for(let i=0;i<=5;i++){const y=i/5,py=ty(y);ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(pad.l,py);ctx.lineTo(w-pad.r,py);ctx.stroke();ctx.textAlign='right';ctx.fillText(`${Math.round(y*100)}%`,pad.l-10,py+4)}
  const xStep=niceStep(xmax-xmin,5),xStart=Math.ceil(xmin/xStep)*xStep;for(let x=xStart;x<=xmax+xStep*1e-6;x+=xStep){const px=tx(x);ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(px,pad.t);ctx.lineTo(px,h-pad.b);ctx.stroke();ctx.fillStyle=label;ctx.textAlign='center';ctx.fillText(tickLabel(x,xStep),px,h-pad.b+20)}
  ctx.strokeStyle=axis;ctx.lineWidth=1.35;ctx.beginPath();ctx.moveTo(pad.l,pad.t);ctx.lineTo(pad.l,h-pad.b);ctx.lineTo(w-pad.r,h-pad.b);ctx.stroke();
  for(let i=0;i<=5;i++){const py=ty(i/5);ctx.beginPath();ctx.moveTo(pad.l,py);ctx.lineTo(pad.l+7,py);ctx.stroke()}for(let x=xStart;x<=xmax+xStep*1e-6;x+=xStep){const px=tx(x);ctx.beginPath();ctx.moveTo(px,h-pad.b);ctx.lineTo(px,h-pad.b-7);ctx.stroke()}
  ctx.fillStyle=label;ctx.textAlign='center';ctx.fillText('波長 (nm)',pad.l+pw/2,h-10);ctx.textAlign='left';
  const line=(arr,key,color,dash=[],markers=false)=>{if(!arr.length)return;ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash(dash);arr.forEach((p,i)=>{const x=tx(p.w),y=ty(p[key]);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.setLineDash([]);if(markers)drawMarkers(ctx,arr,(p)=>[tx(p.w),ty(p[key])],color,arr.length)};
  if($('#showT').checked)line(state.result,'T','#078ea2',[],els.showCalcMarkers.checked);if($('#showR').checked)line(state.result,'R','#ef8740',[],els.showCalcMarkers.checked);if($('#showRefT').checked)line(state.reference,'T','#61aebb',[5,4],els.showRefMarkers.checked);if($('#showRefR').checked)line(state.reference,'R','#d19a73',[5,4],els.showRefMarkers.checked);
  els.chart._map={xmin,xmax,pad,pw,tx,ty};
}
function renderSummary(){if(!state.result.length)return els.summary.innerHTML='';const avg=(k)=>state.result.reduce((n,p)=>n+p[k],0)/state.result.length,peak=(k)=>state.result.reduce((a,b)=>b[k]>a[k]?b:a);const pt=peak('T'),pr=peak('R');els.summary.innerHTML=`<span>平均透過率 <b>${(avg('T')*100).toFixed(2)}%</b></span><span>平均反射率 <b>${(avg('R')*100).toFixed(2)}%</b></span><span>最大 T <b>${(pt.T*100).toFixed(2)}% @ ${pt.w.toFixed(1)} nm</b></span><span>最大 R <b>${(pr.R*100).toFixed(2)}% @ ${pr.w.toFixed(1)} nm</b></span>`;}
function updateRange(){const min=+els.waveMin.value,max=+els.waveMax.value,step=+els.waveStep.value,n=step>0&&max>=min?Math.floor((max-min)/step)+1:0;els.rangeNote.textContent=`${n.toLocaleString()} データ点${n>5000?'（上限超過）':''}`;saveLocal();}

function showNk(name){const m=state.byName.get(name);if(!m)return;els.nkTitle.textContent=m.name;els.nkComment.textContent=m.comment||'コメントなし';els.nkRange.textContent=`${m.points[0][0].toFixed(1)}–${m.points.at(-1)[0].toFixed(1)} nm / ${m.points.length}点`;els.nkDialog.showModal();requestAnimationFrame(()=>drawNk(m));}
function drawNk(m){const {ctx,w,h}=canvasSetup(els.nkChart),p={l:54,r:54,t:24,b:46},pw=w-p.l-p.r,ph=h-p.t-p.b,rawMin=m.points[0][0],rawMax=m.points.at(-1)[0],xmin=rawMin===rawMax?rawMin-.5:rawMin,xmax=rawMin===rawMax?rawMax+.5:rawMax,nmax=Math.max(1,...m.points.map(x=>x[1])),kmax=Math.max(.01,...m.points.map(x=>x[2])),axis='#505762',grid='#e4e7eb',label='#59616c',tx=x=>p.l+(x-xmin)/(xmax-xmin)*pw,ty=(v,max)=>p.t+(1-v/max)*ph;ctx.clearRect(0,0,w,h);ctx.font='11px -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif';ctx.fillStyle=label;ctx.lineWidth=1;for(let i=0;i<=5;i++){const py=p.t+ph*i/5,nv=nmax*(1-i/5),kv=kmax*(1-i/5);ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(p.l,py);ctx.lineTo(w-p.r,py);ctx.stroke();ctx.fillStyle=label;ctx.textAlign='right';ctx.fillText(tickLabel(nv,nmax/5),p.l-10,py+4);ctx.textAlign='left';ctx.fillText(tickLabel(kv,kmax/5),w-p.r+10,py+4)}const xStep=niceStep(xmax-xmin,7),xStart=Math.ceil(xmin/xStep)*xStep;for(let x=xStart;x<=xmax+xStep*1e-6;x+=xStep){const px=tx(x);ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(px,p.t);ctx.lineTo(px,h-p.b);ctx.stroke();ctx.fillStyle=label;ctx.textAlign='center';ctx.fillText(tickLabel(x,xStep),px,h-p.b+20)}ctx.strokeStyle=axis;ctx.lineWidth=1.35;ctx.beginPath();ctx.moveTo(p.l,p.t);ctx.lineTo(p.l,h-p.b);ctx.lineTo(w-p.r,h-p.b);ctx.lineTo(w-p.r,p.t);ctx.stroke();for(let i=0;i<=5;i++){const py=p.t+ph*i/5;ctx.beginPath();ctx.moveTo(p.l,py);ctx.lineTo(p.l+7,py);ctx.moveTo(w-p.r,py);ctx.lineTo(w-p.r-7,py);ctx.stroke()}for(let x=xStart;x<=xmax+xStep*1e-6;x+=xStep){const px=tx(x);ctx.beginPath();ctx.moveTo(px,h-p.b);ctx.lineTo(px,h-p.b-7);ctx.stroke()}const line=(idx,max,color)=>{ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2;m.points.forEach((v,i)=>{const x=tx(v[0]),y=ty(v[idx],max);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();if(els.showNkMarkers.checked)drawMarkers(ctx,m.points,(v)=>[tx(v[0]),ty(v[idx],max)],color,Math.floor(pw/5))};line(1,nmax,'#087fda');line(2,kmax,'#ed7b32');ctx.font='600 11px -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif';ctx.fillStyle='#087fda';ctx.textAlign='left';ctx.fillText('n',p.l,15);ctx.fillStyle='#ed7b32';ctx.textAlign='right';ctx.fillText('k',w-p.r,15);ctx.fillStyle=label;ctx.textAlign='center';ctx.fillText('波長 (nm)',p.l+pw/2,h-10);}

function layerText(){return `LayerFile ver 1.0\nLayer:\n${state.layers.map((l,i)=>`${i+1},${l.name},${l.thickness}`).join('\n')}\nSubstrate:\n${els.substrate.value},${els.substrateThickness.value}\nSimulation:\n${els.waveMin.value},${els.waveMax.value},${els.waveStep.value},${$('#showT').checked?'Yes':'No'},${$('#showR').checked?'Yes':'No'}\nEOF\n`;}
function openLayer(text){const lines=text.replace(/\r\n?/g,'\n').split('\n'),li=lines.indexOf('Layer:'),si=lines.indexOf('Substrate:'),ci=lines.indexOf('Simulation:');if(li<0||si<0)return toast('対応する .layer 形式ではありません');const layers=lines.slice(li+1,si).map(x=>x.split(',')).filter(x=>x.length>=3&&state.byName.has(x[1].trim())).map(x=>({name:x[1].trim(),thickness:+x[2]})).slice(0,100);state.layers=layers;const sub=lines[si+1]?.split(',');if(sub&&state.byName.has(sub[0].trim())){els.substrate.value=sub[0].trim();els.substrate.dataset.valid=els.substrate.value}if(sub?.[1])els.substrateThickness.value=+sub[1];const sim=ci>=0?lines[ci+1]?.split(','):null;if(sim?.length>=3){els.waveMin.value=+sim[0];els.waveMax.value=+sim[1];els.waveStep.value=+sim[2];$('#showT').checked=sim[3]?.trim().toLowerCase()==='yes';$('#showR').checked=sim[4]?.trim().toLowerCase()==='yes'}renderLayers();updateRange();toast(`${layers.length} 層を読み込みました`);}
function parseReference(text){const rows=text.replace(/\r\n?/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean),out=[];for(const row of rows){const p=row.split(/[,\t ]+/).map(Number);if(p.length>=3&&p.every(Number.isFinite))out.push({w:p[0],T:p[1]>1?p[1]/100:p[1],R:p[2]>1?p[2]/100:p[2]})}return out;}

function bind(){
  els.materialSearch.addEventListener('input',renderMaterialList);els.materialList.addEventListener('click',(e)=>{const info=e.target.closest('[data-info]');if(info)return showNk(info.dataset.info);const item=e.target.closest('[data-name]');if(item){state.selected=item.dataset.name;renderMaterialList();}});els.materialList.addEventListener('dblclick',(e)=>{const item=e.target.closest('[data-name]');if(item)addLayer(item.dataset.name)});$('#addSelectedBtn').onclick=()=>state.selected?addLayer(state.selected):toast('材料を選択してください');
  els.layerRows.addEventListener('input',(e)=>{if(e.target.dataset.thickness!==undefined){const i=+e.target.dataset.thickness;selectLayer(i);state.layers[i].thickness=Math.max(0,+e.target.value||0);els.tunerThickness.value=state.layers[i].thickness;renderStackVisual();scheduleLive();}});els.layerRows.addEventListener('change',(e)=>{if(e.target.dataset.thickness!==undefined){renderLayers();scheduleLive();}});els.layerRows.addEventListener('click',(e)=>{const row=e.target.closest('[data-row]');if(row)selectLayer(+row.dataset.row);const b=e.target.closest('button');if(!b)return;if(b.dataset.delete!==undefined){const i=+b.dataset.delete;state.layers.splice(i,1);state.selectedLayer=Math.min(i,state.layers.length-1);}if(b.dataset.copy!==undefined&&state.layers.length<100){const i=+b.dataset.copy;state.layers.splice(i+1,0,{...state.layers[i]});state.selectedLayer=i+1;}if(b.dataset.move){const i=+b.dataset.i,j=b.dataset.move==='up'?i-1:i+1;if(j>=0&&j<state.layers.length){[state.layers[i],state.layers[j]]=[state.layers[j],state.layers[i]];state.selectedLayer=j;}}renderLayers();scheduleLive();});
  els.tunerThickness.addEventListener('input',(e)=>setSelectedThickness(e.target.value));els.tunerThickness.addEventListener('change',()=>{renderLayers();scheduleLive();});els.thicknessSteps.addEventListener('click',(e)=>{const b=e.target.closest('[data-step]');if(!b)return;state.thicknessStep=+b.dataset.step;renderTuner();});els.thicknessDown.onclick=()=>adjustThickness(-1);els.thicknessUp.onclick=()=>adjustThickness(1);els.liveSimulation.onchange=()=>{saveLocal();if(els.liveSimulation.checked)scheduleLive();};els.stackVisual.addEventListener('click',(e)=>{const layer=e.target.closest('[data-visual-row]');if(layer)selectLayer(+layer.dataset.visualRow);});
  $('#clearLayersBtn').onclick=()=>{state.layers=[];state.selectedLayer=-1;state.result=[];renderLayers();drawChart();renderSummary()};els.substrate.addEventListener('input',()=>commitSubstrate({revertInvalid:false}));els.substrate.addEventListener('change',()=>commitSubstrate());els.substrate.addEventListener('blur',()=>commitSubstrate());els.substrateThickness.oninput=scheduleLive;els.backSurface.onchange=scheduleLive;[els.waveMin,els.waveMax,els.waveStep].forEach(x=>x.addEventListener('input',()=>{updateRange();scheduleLive();}));$('#calculateBtn').onclick=()=>calculate();document.addEventListener('keydown',(e)=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();calculate();}});
  ['showT','showR','showRefT','showRefR'].forEach(id=>$('#'+id).onchange=drawChart);[els.showCalcMarkers,els.showRefMarkers].forEach((box)=>box.onchange=()=>{drawChart();saveLocal()});els.showNkMarkers.onchange=()=>{const m=state.byName.get(els.nkTitle.textContent);if(m)drawNk(m);saveLocal()};window.addEventListener('resize',()=>{drawChart();const m=state.byName.get(els.nkTitle.textContent);if(els.nkDialog.open&&m)drawNk(m)});
  $('#saveLayerBtn').onclick=()=>download('hakumaku.layer',layerText());$('#layerFile').onchange=async(e)=>{if(e.target.files[0])openLayer(await e.target.files[0].text());e.target.value=''};$('#newBtn').onclick=()=>{state.layers=[];state.result=[];state.reference=[];renderLayers();drawChart();renderSummary();toast('新しい構成を開始しました')};
  $('#exportCsvBtn').onclick=()=>state.result.length?download('hakumaku-spectrum.csv','Wavelength (nm),Transmittance,Reflectance\n'+state.result.map(p=>`${p.w},${p.T},${p.R}`).join('\n'),'text/csv'):toast('先に計算を実行してください');$('#referenceFile').onchange=async(e)=>{const f=e.target.files[0];if(!f)return;state.reference=parseReference(await f.text());document.querySelectorAll('.legend-controls .muted').forEach(x=>x.classList.toggle('has-ref',!!state.reference.length));drawChart();toast(`${state.reference.length} 点の参照データを読み込みました`);e.target.value=''};
  $('#nkFile').onchange=async(e)=>{let n=0;for(const f of e.target.files){const m=parseNk(await f.text(),f.name.replace(/\.nk$/i,''));if(m.points.length){state.materials.push(m);state.byName.set(m.name,m);n++}}state.materials.sort((a,b)=>a.name.localeCompare(b.name));renderMaterialList();renderSubstrates(els.substrate.value);toast(`${n} 件の材料を追加しました`);e.target.value=''};
  $('#helpBtn').onclick=()=>$('#helpDialog').showModal();els.chart.addEventListener('mousemove',(e)=>{if(!state.result.length)return;const r=els.chart.getBoundingClientRect(),m=els.chart._map,w=m.xmin+(e.clientX-r.left-m.pad.l)/m.pw*(m.xmax-m.xmin),i=clamp(Math.round((w-state.result[0].w)/(state.result[1]?.w-state.result[0].w||1)),0,state.result.length-1),p=state.result[i];els.chartTooltip.innerHTML=`<b>${p.w.toFixed(2)} nm</b><br>T ${(p.T*100).toFixed(3)}%<br>R ${(p.R*100).toFixed(3)}%`;els.chartTooltip.style.display='block';els.chartTooltip.style.left=`${clamp(e.clientX-r.left+12,5,r.width-115)}px`;els.chartTooltip.style.top=`${clamp(e.clientY-r.top-30,5,r.height-75)}px`;});els.chart.onmouseleave=()=>els.chartTooltip.style.display='none';
}
init();
