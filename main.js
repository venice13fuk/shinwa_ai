/* ====== 汎用UI ====== */
const pages = {
  projects: document.getElementById('page-projects'),
  form: document.getElementById('page-form'),
  result: document.getElementById('page-result'),
  history: document.getElementById('page-history'),
};
const loading = document.getElementById('loading-overlay');
const toast = document.getElementById('toast-notification');
const backToTop = document.getElementById('back-to-top-btn');

function showPage(name){
  Object.values(pages).forEach(p=>p.classList.remove('active'));
  pages[name].classList.add('active');
  backToTop.classList.toggle('hidden', name==='projects');
}
function showLoading(b){ loading.classList.toggle('hidden', !b); }
function showToast(msg){ toast.textContent = msg; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'), 2200); }

/* ====== ストレージ（localStorage） ====== */
const LS_KEY = 'shinwa-ai-projects-v1'; // { projects: [{id,name,createdAt}], proposals: { [projectId]: [{id,createdAt,inputs,raw}]} }

function loadDB(){
  try{ return JSON.parse(localStorage.getItem(LS_KEY)) || { projects:[], proposals:{} }; }
  catch{ return { projects:[], proposals:{} }; }
}
function saveDB(db){ localStorage.setItem(LS_KEY, JSON.stringify(db)); }
function uid(){ return Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); }

/* ====== 状態 ====== */
let currentProject = null;

/* ====== 案件管理 ====== */
const projListEl = document.getElementById('project-list');
document.getElementById('add-project-btn').addEventListener('click', addProject);
backToTop.addEventListener('click', ()=>showPage('projects'));

function renderProjects(){
  const db = loadDB();
  projListEl.innerHTML = '';
  if(db.projects.length===0){
    projListEl.innerHTML = '<p class="text-gray-500 text-center">案件が登録されていません。</p>';
    return;
  }
  db.projects.sort((a,b)=>b.createdAt-a.createdAt).forEach(p=>{
    const d = new Date(p.createdAt).toLocaleString('ja-JP');
    const card = document.createElement('div');
    card.className = 'bg-white border rounded-lg p-4 shadow-sm';
    card.innerHTML = `
      <div class="flex justify-between items-start">
        <div>
          <h3 class="text-xl font-bold text-gray-800">${p.name}</h3>
          <p class="text-sm text-gray-500 mt-1">作成日: ${d}</p>
        </div>
        <div class="space-x-2">
          <button data-id="${p.id}" class="btn-neutral px-3 py-1 rounded-md text-sm btn-new">新規提案</button>
          <button data-id="${p.id}" class="btn-neutral px-3 py-1 rounded-md text-sm btn-history">提案履歴</button>
          <button data-id="${p.id}" class="text-gray-400 hover:text-red-600" title="削除">🗑</button>
        </div>
      </div>`;
    card.querySelector('.btn-new').addEventListener('click', ()=>openForm(p));
    card.querySelector('.btn-history').addEventListener('click', ()=>openHistory(p));
    card.querySelector('[title="削除"]').addEventListener('click', ()=>deleteProject(p));
    projListEl.appendChild(card);
  });
}

function addProject(){
  const name = (document.getElementById('new-project-name').value||'').trim();
  if(!name){ showToast('クライアント名を入力してください'); return; }
  const db = loadDB();
  const id = uid();
  db.projects.push({ id, name, createdAt: Date.now() });
  db.proposals[id] = [];
  saveDB(db);
  document.getElementById('new-project-name').value = '';
  renderProjects();
  showToast(`案件「${name}」を追加しました`);
}

function deleteProject(p){
  if(!confirm(`案件「${p.name}」を削除しますか？（提案履歴も消えます）`)) return;
  const db = loadDB();
  db.projects = db.projects.filter(x=>x.id!==p.id);
  delete db.proposals[p.id];
  saveDB(db);
  renderProjects();
  showToast('削除しました');
}

/* ====== フォーム → 生成 ====== */
document.getElementById('proposal-form').addEventListener('submit', async (e)=>{ e.preventDefault(); await generateProposal(); });

function openForm(p){
  currentProject = p;
  document.getElementById('form-project-name').textContent = p.name;
  document.getElementById('form-project-id').textContent = p.id;
  document.getElementById('clientName').value = p.name;
  ['clientWebsite','clientAddress','clientPhone','industry','target','competitorName','competitorWebsite','issues','goals'].forEach(id=>{
    const el = document.getElementById(id); if(el) el.value = '';
  });
  showPage('form');
}

async function generateProposal(){
  const inputs = {
    clientName: getVal('clientName', true),
    clientWebsite: getVal('clientWebsite'),
    clientAddress: getVal('clientAddress'),
    clientPhone: getVal('clientPhone'),
    industry: getVal('industry'),
    target: getVal('target'),
    issues: getVal('issues'),
    goals: getVal('goals'),
    competitorName: getVal('competitorName'),
    competitorWebsite: getVal('competitorWebsite'),
  };
  showLoading(true);

  const prompt = buildPrompt(inputs);

  try{
    const res = await fetch('/.netlify/functions/openai-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        system: 'あなたは上級のデジタル戦略コンサルタントです。Markdownで日本語の提案書を作成します。実行可能性/測定可能性と具体性を重視。',
        user: prompt
      })
    });
    if(!res.ok){
      const t = await res.text();
      throw new Error('API error '+res.status+' / '+t);
    }
    const data = await res.json();
    const raw = (data.content||'').trim();
    if(!raw) throw new Error('応答が空です。');

    document.getElementById('proposal-output').innerHTML = mdToHtml(raw);
    document.getElementById('proposal-output').dataset.rawText = raw;
    document.getElementById('proposal-client-name').textContent = inputs.clientName;
    document.getElementById('proposal-date').textContent = new Date().toLocaleDateString('ja-JP');

    document.getElementById('btn-save-proposal').onclick = ()=>saveProposal(inputs, raw);

    showPage('result');
  }catch(e){
    console.error('OPENAI PROXY ERROR:', e);
    document.getElementById('proposal-output').innerHTML = `<p class="text-red-500 whitespace-pre-wrap">提案生成に失敗しました：${e.message}</p>`;
    showPage('result');
  }finally{ showLoading(false); }
}

function getVal(id, req=false){
  const v = (document.getElementById(id)?.value || '').trim();
  if(req && !v) throw new Error('必須：'+id);
  return v;
}

function buildPrompt(i){
  return `あなたはプロのデジタル戦略コンサルタントです。以下のクライアント情報（簡易ワード含む）を構造化解析し、Web/アプリ/印刷物/CRM/マーケ/広告の各領域に跨る最適提案をMarkdownで作成してください。各セクションは「### 見出し」。結論先出し、KGI/KPIの明確化、90日ロードマップ、概算コストレンジを含めてください。

# クライアント情報
- クライアント名: ${i.clientName}
- 自社サイト: ${i.clientWebsite||'未入力'}
- 住所/電話: ${i.clientAddress||'未入力'} / ${i.clientPhone||'未入力'}
- 業界/事業: ${i.industry||'未入力'}
- ターゲット: ${i.target||'未入力'}
- 現状課題: ${i.issues||'未入力'}
- 目的/目標: ${i.goals||'未入力'}
- 競合名: ${i.competitorName||'未入力'}
- 競合URL: ${i.competitorWebsite||'未入力'}

# 提案書フォーマット（必ずこの順）
### 1. エグゼクティブサマリー
### 2. 課題の本質と外部環境
### 3. ゴール/KGI/KPI（数値）
### 4. ターゲット再定義（ペルソナ/行動特性/購買動機）
### 5. チャネル別提案
- Web/アプリ
- 印刷物（チラシ/パンフ/同梱物）
- CRM（会員基盤/MA/ステップメール）
- マーケ（コンテンツ/SEO/イベント）
- 広告（運用型/OOH/SNS/アフィリエイト）
### 6. 実行計画（90日ロードマップ/体制/概算コストレンジ）
### 7. 成果測定（ダッシュボード/KPI監視/レポート頻度）
### 8. リスクと代替案
### 9. 次のアクション（即日〜4週）`;
}

/* ====== 保存（案件内の履歴） ====== */
function saveProposal(inputs, raw){
  if(!currentProject){ showToast('案件情報がありません'); return; }
  const db = loadDB();
  if(!db.proposals[currentProject.id]) db.proposals[currentProject.id]=[];
  db.proposals[currentProject.id].unshift({
    id: uid(),
    createdAt: Date.now(),
    inputs,
    raw
  });
  saveDB(db);
  showToast('提案を保存しました');
}

/* ====== 履歴（案件別） ====== */
function openHistory(p){
  currentProject = p;
  document.getElementById('history-project-name').textContent = p.name;
  const db = loadDB();
  const listEl = document.getElementById('history-list');
  listEl.innerHTML = '';

  const items = (db.proposals[p.id] || []);
  if(items.length===0){
    listEl.innerHTML = '<p class="text-gray-500 text-center">保存された提案はありません。</p>';
  }else{
    items.forEach(item=>{
      const d = new Date(item.createdAt).toLocaleString('ja-JP');
      const wrap = document.createElement('div');
      wrap.className = 'border rounded-lg bg-white shadow-sm';
      wrap.innerHTML = `
        <div class="flex items-center justify-between p-4">
          <div class="text-sm text-gray-700">保存日時: <span class="font-medium">${d}</span></div>
          <div class="space-x-2">
            <button class="btn-neutral px-3 py-1 rounded-md text-sm btn-reedit">再編集</button>
            <button class="btn-primary px-3 py-1 rounded-md text-sm btn-pdf">PDF出力</button>
            <button class="text-gray-400 hover:text-red-600 btn-delete" title="削除">🗑</button>
          </div>
        </div>
        <div class="p-4">
          <div class="proposal-document p-6">
            <div class="proposal-header">
              <h2 class="text-xl font-bold">デジタル戦略提案書</h2>
              <p class="text-gray-600 mt-1">クライアント: <span class="font-semibold">${item.inputs.clientName}</span></p>
              <p class="text-gray-600">作成日: <span class="font-semibold">${d}</span></p>
            </div>
            <div class="history-content">${mdToHtml(item.raw)}</div>
          </div>
        </div>
      `;
      wrap.querySelector('.btn-reedit').addEventListener('click', ()=>{
        ['clientName','clientWebsite','clientAddress','clientPhone','industry','target','competitorName','competitorWebsite','issues','goals'].forEach(id=>{
          document.getElementById(id).value = item.inputs[id] || '';
        });
        document.getElementById('form-project-name').textContent = p.name;
        document.getElementById('form-project-id').textContent = p.id;
        showPage('form');
      });
      wrap.querySelector('.btn-pdf').addEventListener('click', ()=>{
        const docEl = wrap.querySelector('.proposal-document');
        downloadProposalAsPDF(docEl, item.inputs.clientName);
      });
      wrap.querySelector('.btn-delete').addEventListener('click', ()=>{
        if(!confirm('この提案履歴を削除しますか？')) return;
        const db2 = loadDB();
        db2.proposals[p.id] = (db2.proposals[p.id]||[]).filter(x=>x.id!==item.id);
        saveDB(db2);
        openHistory(p);
      });
      listEl.appendChild(wrap);
    });
  }
  showPage('history');
}

document.getElementById('btn-back-projects').addEventListener('click', ()=>showPage('projects'));
document.getElementById('btn-back-edit').addEventListener('click', ()=>showPage('form'));

/* ====== Markdown→HTML ====== */
function mdToHtml(text){
  if(!text) return '';
  let html = text.replace(/^\s*#{1,6}\s*(.*?)\s*$/gm,'<h3>$1</h3>');
  html = html.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
  const lines = html.split('\n');
  let out='', inList=false;
  for(const line of lines){
    const t=line.trim();
    if(t.startsWith('- ')){
      if(!inList){ out+='<ul>'; inList=true; }
      out+=`<li>${t.substring(2)}</li>`;
    }else{
      if(inList){ out+='</ul>'; inList=false; }
      if(t.length>0 && !t.startsWith('<h')) out+=`<p>${t}</p>`;
      else if(t.startsWith('<h')) out+=t;
    }
  }
  if(inList) out+='</ul>';
  return out.replace(/<p><\/p>/g,'');
}

/* ====== PDF（html2pdf.js） ====== */
document.getElementById('btn-download-pdf').addEventListener('click', ()=>downloadProposalAsPDF());
async function downloadProposalAsPDF(el=null, clientName=null){
  const target = el || document.getElementById('proposal-document');
  const name = (clientName || document.getElementById('proposal-client-name').textContent || 'proposal').replace(/\s/g,'_');
  const date = new Date().toISOString().slice(0,10);
  try{
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    document.body.classList.add('print-mode');
    await html2pdf().set({
      margin:10,
      filename:`${name}_proposal_${date}.pdf`,
      image:{type:'jpeg',quality:0.98},
      html2canvas:{scale:2,useCORS:true,backgroundColor:'#fff'},
      jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}
    }).from(target).save();
    showToast('PDFをダウンロードしました');
  }catch(e){
    console.error(e); showToast('PDFの生成に失敗しました');
  }finally{
    document.body.classList.remove('print-mode');
  }
}

/* ====== 初期表示 ====== */
renderProjects();

