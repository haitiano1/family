// Signed in already but the first request came without the cookie (some Android launchers and browsers):
// a same-origin request carries it, so check once and go straight into the app.
(()=>{let recent=false;try{recent=Date.now()-Number(sessionStorage.getItem('fam-access-auto')||0)<30000;}catch{}
  if(!recent)fetch('/',{redirect:'manual',cache:'no-store',credentials:'same-origin'}).then(response=>{if(!response.ok||response.type==='opaqueredirect')return;
    try{sessionStorage.setItem('fam-access-auto',String(Date.now()));}catch{} // at most once per 30 s, never a loop
    location.replace('/'+location.hash);}).catch(()=>{});})();
document.querySelector('#access-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try {
    const response=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1'},body:JSON.stringify({password:document.querySelector('#access-password').value})});
    const data=await response.json();if (!response.ok) throw new Error(data.error);
    location.replace('/');
  } catch(error) {document.querySelector('#access-error').textContent=error.message || 'Không kết nối được. Kiểm tra mạng rồi thử lại.';}
  finally {button.disabled=false;}
});
