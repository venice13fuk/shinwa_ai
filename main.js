const loadingOverlay=document.getElementById('loading-overlay');
const toast=document.getElementById('toast-notification');
function showPage(name){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById(name).classList.add('active');}
function showLoading(s){loadingOverlay.classList.toggle('hidden',!s);}
function showToast(m){toast.textContent=m;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2500);}

document.getElementById('proposal-form').addEventListener('submit',async e=>{e.preventDefault();await generateProposal();});
document.getElementById('download-pdf-btn').addEventListener('click',()=>downloadProposalAsPDF());

async function generateProposal(){
  const inputs={
    clientName:document.getElementById('clientName').value.trim(),
    industry:document.getElementById('industry').value.trim(),
    target:document.getElementById('target').value.trim(),
    issues:document.getElementById('issues').value.trim(),
    goals:document.getElementById('goals').value.trim()
  };
  if(!inputs.clientName){showToast('クライアント名は必須です');return;}
  showLoading(true);
  const prompt=`クライアント: ${inputs.clientName}\n業界:${inputs.industry}\nターゲット:${inputs.target}\n課題:${inputs.issues}\n目標:${inputs.goals}`;
  try{
    const res=await fetch('/.netlify/functions/openai-proxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini',temperature:0.7,system:'あなたはデジタル戦略コンサルタントです。Markdownで簡潔に回答。',user:prompt})});
    if(!res.ok) throw new Error('API error '+res.status);
    const data=await res.json(); const rawText=(data.content||'').trim(); if(!rawText) throw new Error('応答が空');
    document.getElementById('proposal-output').innerHTML=parseProposalMarkdown(rawText);
    document.getElementById('proposal-output').dataset.rawText=rawText;
    document.getElementById('proposal-client-name').textContent=inputs.clientName;
    document.getElementById('proposal-date').textContent=new Date().toLocaleDateString('ja-JP');
    showPage('proposal-result-page');
  }catch(e){console.error(e);document.getElementById('proposal-output').innerHTML='<p class="text-red-500">生成失敗:'+e.message+'</p>';showPage('proposal-result-page');}finally{showLoading(false);}
}

function parseProposalMarkdown(t){if(!t) return '';let h=t.replace(/^\s*#{1,6}\s*(.*?)\s*$/gm,'<h3>$1</h3>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');return h.split('\n').map(l=>l.trim().startsWith('- ')?'<li>'+l.trim().substring(2)+'</li>':l.startsWith('<h')?l:'<p>'+l+'</p>').join('');}

async function downloadProposalAsPDF(el=null,clientName=null){
  const elmt=el||document.getElementById('proposal-document');
  const name=clientName||document.getElementById('proposal-client-name').textContent||'proposal';
  const date=new Date().toISOString().slice(0,10);
  try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;document.body.classList.add('print-mode');await html2pdf().set({margin:10,filename:`${name}_${date}.pdf`,image:{type:'jpeg',quality:0.98},html2canvas:{scale:2,useCORS:true,backgroundColor:'#fff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(elmt).save();showToast('PDFをダウンロードしました');}catch(e){console.error(e);showToast('PDF生成失敗');}finally{document.body.classList.remove('print-mode');}
}
