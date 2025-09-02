const pages={form:document.getElementById('form-page'),result:document.getElementById('result-page')};
const loading=document.getElementById('loading-overlay');
const toast=document.getElementById('toast-notification');

function showPage(n){ Object.values(pages).forEach(p=>p.classList.remove('active')); pages[n].classList.add('active'); }
function showLoading(b){ loading.classList.toggle('hidden',!b); }
function showToast(m){ toast.textContent=m; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),2200); }

document.getElementById('proposal-form').addEventListener('submit', async (e)=>{ e.preventDefault(); await generateProposal(); });
document.getElementById('download-pdf-btn').addEventListener('click', ()=>downloadProposalAsPDF());
document.getElementById('back-edit').addEventListener('click', ()=>showPage('form'));

async function generateProposal(){
  const inputs={
    clientName:val('clientName',true),
    clientWebsite:val('clientWebsite'),
    clientAddress:val('clientAddress'),
    clientPhone:val('clientPhone'),
    industry:val('industry'),
    target:val('target'),
    issues:val('issues'),
    goals:val('goals'),
    competitorName:val('competitorName'),
    competitorWebsite:val('competitorWebsite')
  };
  showLoading(true);

  const prompt = buildPrompt(inputs);

  try{
    const res = await fetch('/.netlify/functions/openai-proxy', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        system: 'あなたは上級のデジタル戦略コンサルタントです。Markdownで日本語の提案書を作成します。実行可能性/測定可能性と具体性を重視。',
        user: prompt
      })
    });
    if(!res.ok) throw new Error('API error '+res.status);
    const data = await res.json();
    const raw = (data.content||'').trim();
    if(!raw) throw new Error('応答が空です。');

    document.getElementById('proposal-output').innerHTML = mdToHtml(raw);
    document.getElementById('proposal-output').dataset.rawText = raw;
    document.getElementById('proposal-client-name').textContent = inputs.clientName;
    document.getElementById('proposal-date').textContent = new Date().toLocaleDateString('ja-JP');

    showPage('result');
  }catch(e){
    console.error('OPENAI PROXY ERROR:', e);
    document.getElementById('proposal-output').innerHTML =
      `<p class="text-red-500">提案生成に失敗しました：${e.message}</p>`;
    showPage('result');
  }finally{ showLoading(false); }
}

function val(id, req=false){
  const v = (document.getElementById(id)?.value||'').trim();
  if(req && !v) throw new Error('必須：'+id);
  return v;
}

function buildPrompt(i){
  return `あなたはプロのデジタル戦略コンサルタントです。以下のクライアント情報（簡易ワード含む）を構造化解析し、各チャネル（Web/アプリ/印刷物/CRM/マーケ/広告）に跨る最適提案をMarkdownで作成してください。各セクションは「### 見出し」で。結論先出し・KGI/KPI・ロードマップ・概算コストも含めてください。

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

# 提案書フォーマット（必ずこの順で出力）
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

function mdToHtml(text){
  if(!text) return '';
  // 見出し
  let html = text.replace(/^\s*#{1,6}\s*(.*?)\s*$/gm,'<h3>$1</h3>');
  // 太字
  html = html.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
  // 箇条書き
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

// PDF（html2pdf.js）
async function downloadProposalAsPDF(el=null, clientName=null){
  const target = el || document.getElementById('proposal-document');
  const name = clientName || (document.getElementById('proposal-client-name').textContent||'proposal').replace(/\s/g,'_');
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

