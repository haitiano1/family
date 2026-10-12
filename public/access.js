document.querySelector('#access-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try {
    const response=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1'},body:JSON.stringify({password:document.querySelector('#access-password').value})});
    const data=await response.json();if (!response.ok) throw new Error(data.error);
    location.replace('/');
  } catch(error) {document.querySelector('#access-error').textContent=error.message || 'Không kết nối được. Kiểm tra mạng rồi thử lại.';}
  finally {button.disabled=false;}
});
