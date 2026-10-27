import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import{getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import{getFirestore,collection,doc,getDoc,getDocs,setDoc,addDoc,updateDoc,deleteDoc,query,where}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Same config as public/index.html (copy from there if different)
const firebaseConfig={
  apiKey:"AIzaSyAeK1X1urtNRHq0AWd60RMMBe42648KygA",
  authDomain:"roomsewa-sudur-410e2.firebaseapp.com",
  projectId:"roomsewa-sudur-410e2",
  storageBucket:"roomsewa-sudur-410e2.firebasestorage.app",
  messagingSenderId:"731405794361",
  appId:"1:731405794361:web:6a29ada3e1f93e94d661e8"
};
const auth=getAuth(initializeApp(firebaseConfig)),db=getFirestore(auth.app);
const $=id=>document.getElementById(id),Q=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LABEL={pending:'Pending',approved:'Active',rejected:'Rejected'};
const MAP_STYLE='https://tiles.openfreemap.org/styles/liberty';
let busy=false,me=null,listings=[],threads=[],editingId=null,lat=null,lng=null,ownerMap=null,addMap=null,pin=null,markers=[],replyIdx=null;

// extra "Contact phone" field in the Add Room form
$('roomAddress').previousElementSibling.insertAdjacentHTML('beforebegin','<label>Contact phone</label><input type="text" id="roomContact" placeholder="98XXXXXXXX" required>');

// ---------- LOGIN / REGISTER ----------
const lm=document.createElement('div');
lm.className='modal';lm.id='loginModal';
const inp='width:100%;padding:11px;margin-bottom:10px;border:1px solid #d1d5db;border-radius:6px';
lm.innerHTML=`<div class="modal-content small-modal">
<div id="ownLogin"><h2>Owner Login</h2><p class="modal-description">Log in with your House owner account.</p>
<input id="loginEmail" type="email" placeholder="Email" style="${inp}"><input id="loginPass" type="password" placeholder="Password" style="${inp}">
<p id="loginErr" style="color:#b91c1c;font-size:13px;margin-bottom:8px"></p>
<button class="publish-btn" id="loginBtn" style="margin-top:0">Log in</button>
<p style="text-align:center;margin-top:15px;font-size:13px">New house owner? <a href="#" id="toReg" style="color:#1769aa;font-weight:bold">Register</a></p></div>
<div id="ownReg" style="display:none"><h2>Owner Registration</h2><p class="modal-description">Create a House owner account.</p>
<input id="regName" placeholder="Full name" style="${inp}"><input id="regEmail" type="email" placeholder="Email" style="${inp}"><input id="regPhone" type="tel" placeholder="Phone number" style="${inp}">
<input id="regPass" type="password" placeholder="Password (min 6 characters)" style="${inp}"><input id="regConf" type="password" placeholder="Confirm password" style="${inp}">
<p id="regErr" style="color:#b91c1c;font-size:13px;margin-bottom:8px"></p>
<button class="publish-btn" id="regBtn" style="margin-top:0">Create Owner Account</button>
<p style="text-align:center;margin-top:15px;font-size:13px">Already registered? <a href="#" id="toLogin" style="color:#1769aa;font-weight:bold">Log in</a></p></div></div>`;
document.body.appendChild(lm);
const showForm=reg=>{$('ownLogin').style.display=reg?'none':'block';$('ownReg').style.display=reg?'block':'none'};
$('toReg').onclick=e=>{e.preventDefault();showForm(true)};
$('toLogin').onclick=e=>{e.preventDefault();showForm(false)};
const errText=e=>(e.code||e.message).replace('auth/','').replace(/-/g,' ');
$('loginBtn').onclick=async()=>{
  $('loginErr').textContent='';
  try{await signInWithEmailAndPassword(auth,$('loginEmail').value.trim(),$('loginPass').value)}
  catch(e){$('loginErr').textContent=errText(e)}
};
$('regBtn').onclick=async()=>{
  const v=id=>$(id).value.trim(),name=v('regName'),email=v('regEmail'),phone=v('regPhone'),pw=$('regPass').value;
  $('regErr').textContent='';
  if(!name||!email||!phone||!pw){$('regErr').textContent='Please fill all fields.';return}
  if(pw!==$('regConf').value){$('regErr').textContent='Passwords do not match.';return}
  try{
    busy=true;const c=await createUserWithEmailAndPassword(auth,email,pw);
    await setDoc(doc(db,'users',c.user.uid),{name,email,phone,role:'owner',favs:[]});
    busy=false;await enter(c.user);showToast('Owner account created! 🏠');
  }catch(e){busy=false;$('regErr').textContent=errText(e)}
};
onAuthStateChanged(auth,u=>{if(!busy)enter(u)});
async function enter(u){
  if(!u){me=null;lm.style.display='block';showForm(false);return}
  const s=await getDoc(doc(db,'users',u.uid));
  if(!s.exists()||s.data().role!=='owner'){
    await signOut(auth);$('loginErr').textContent='This is not a house owner account. Use the Register link to create one.';return;
  }
  if(s.data().status==='Blocked'){await signOut(auth);$('loginErr').textContent='Your account has been blocked by the admin.';return}
  me={uid:u.uid,...s.data()};lm.style.display='none';fill();await loadAll();
}
function fill(){
  Q('.owner-name').textContent='👤 '+me.name;
  Q('.welcome h1').textContent='Welcome, '+me.name+' 👋';
  Q('.profile-avatar').textContent=(me.name||'?')[0].toUpperCase();
  Q('.profile-details').innerHTML=`<h2>${esc(me.name)}</h2><p>📧 ${esc(me.email)}</p><p>📞 ${esc(me.phone||'Not added')}</p><p>🏠 House owner</p><button class="edit-profile" onclick="editProfile()">Edit Profile</button>`;
}

// ---------- DATA ----------
async function loadAll(){
  try{
    listings=(await getDocs(query(collection(db,'listings'),where('ownerId','==',me.uid)))).docs.map(d=>({id:d.id,...d.data()}));
    const ms=(await getDocs(query(collection(db,'messages'),where('oid','==',me.uid)))).docs.map(d=>d.data()).sort((a,b)=>a.t-b.t),m={};
    ms.forEach(x=>{const k=x.lid+'|'+x.tid;(m[k]=m[k]||{lid:x.lid,tid:x.tid,title:x.title,list:[]}).list.push(x)});
    threads=Object.values(m).map(t=>({...t,tenant:(t.list.find(x=>x.from===x.tid)||{}).fromName||'Tenant'}));
    displayListings();updateStatistics();showMarkers();displayInquiries();
  }catch(e){showToast(e.message)}
}
function updateStatistics(){
  $('totalListings').innerText=listings.length;
  $('activeListings').innerText=listings.filter(r=>r.status==='approved').length;
  const h=document.querySelectorAll('.stat-card h2');h[2].textContent=threads.length;h[3].textContent='—';
}

// ---------- LISTINGS ----------
function displayListings(){
  $('listingContainer').innerHTML=listings.length?listings.map(r=>`<div class="listing-card">
    ${r.img?`<img class="listing-image" src="${esc(r.img)}" alt="">`:'<div class="listing-image" style="display:flex;align-items:center;justify-content:center;font-size:50px;background:#e8f4fc">🏠</div>'}
    <div class="listing-body"><h3>${esc(r.title)}</h3><p>📍 ${esc(r.area)}</p>
    <p>${esc(r.type)} • 🚿 ${r.bathrooms||1} Bathroom</p>
    <p class="listing-rent">Rs. ${Number(r.price).toLocaleString()} / month</p>
    <span class="status ${r.status==='approved'?'active':'pending'}">${LABEL[r.status]||r.status}</span>
    <div class="listing-actions"><button class="edit-btn" onclick="editListing('${r.id}')">Edit</button><button class="delete-btn" onclick="deleteListing('${r.id}')">Delete</button></div></div></div>`).join(''):'<p>No listings yet. Click "+ Add New Room".</p>';
}
async function deleteListing(id){
  const r=listings.find(x=>x.id===id);if(!r||!confirm(`Delete "${r.title}"?`))return;
  await deleteDoc(doc(db,'listings',id));showToast('Listing deleted.');await loadAll();
}

// ---------- MAPS ----------
ownerMap=new maplibregl.Map({container:'ownerMap',style:MAP_STYLE,center:[80.45,28.82],zoom:8.5});
ownerMap.addControl(new maplibregl.NavigationControl());
function showMarkers(){
  markers.forEach(m=>m.remove());markers=[];
  listings.filter(r=>r.latitude&&r.longitude).forEach(r=>markers.push(new maplibregl.Marker().setLngLat([r.longitude,r.latitude])
    .setPopup(new maplibregl.Popup().setHTML(`<strong>${esc(r.title)}</strong><p>📍 ${esc(r.area)}</p><p>Rs. ${Number(r.price).toLocaleString()}</p>`)).addTo(ownerMap)));
}
function setPin(a,b){
  lat=a;lng=b;if(pin)pin.remove();
  pin=new maplibregl.Marker().setLngLat([b,a]).addTo(addMap);
  $('coordinates').innerText=a.toFixed(5)+', '+b.toFixed(5);
}
function initAddMap(){
  if(addMap){addMap.resize();return}
  addMap=new maplibregl.Map({container:'addRoomMap',style:MAP_STYLE,center:[80.1772,28.9639],zoom:10});
  addMap.addControl(new maplibregl.NavigationControl());
  addMap.on('click',e=>setPin(e.lngLat.lat,e.lngLat.lng));
}

// ---------- ADD / EDIT ROOM ----------
function openAddRoom(){
  $('roomModal').style.display='block';document.body.style.overflow='hidden';
  if(!editingId&&!$('roomContact').value)$('roomContact').value=me.phone||'';
  setTimeout(initAddMap,200);
}
function closeRoomModal(){
  $('roomModal').style.display='none';document.body.style.overflow='auto';
  $('roomForm').reset();$('imagePreview').innerHTML='';$('coordinates').innerText='Not selected';
  lat=lng=null;editingId=null;if(pin){pin.remove();pin=null}
  Q('#roomForm .publish-btn').textContent='Publish Room';Q('#roomModal h2').textContent='Add New Room';
}
function previewImages(e){
  const p=$('imagePreview');p.innerHTML='';
  [...e.target.files].forEach(f=>{const i=document.createElement('img');i.src=URL.createObjectURL(f);p.appendChild(i)});
}
// photos are shrunk and kept inside the listing (no Firebase Storage needed); first photo only
const shrink=f=>new Promise(res=>{const r=new FileReader();r.onload=()=>{const i=new Image();i.onload=()=>{
  const s=Math.min(1,800/i.width),c=document.createElement('canvas');c.width=i.width*s;c.height=i.height*s;
  c.getContext('2d').drawImage(i,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.7))};i.src=r.result};r.readAsDataURL(f)});
async function addRoom(e){
  e.preventDefault();
  if(!lat||!lng)return showToast('Please select property location on map.');
  const v=id=>$(id).value.trim(),type=$('roomType').value;
  const data={title:v('roomTitle'),area:$('roomLocation').value,type,price:Number(v('roomRent')),bathrooms:Number(v('roomBathrooms')),beds:type==='2 BHK'?2:1,
    address:v('roomAddress'),desc:v('roomDescription'),contact:v('roomContact'),latitude:lat,longitude:lng,
    facilities:[...document.querySelectorAll('.checkbox input:checked')].map(x=>x.value)};
  try{
    const f=$('roomImages').files[0];
    if(f)data.img=await shrink(f);else if(!editingId)data.img='';
    if(editingId){await updateDoc(doc(db,'listings',editingId),data);showToast('Room updated.')}
    else{await addDoc(collection(db,'listings'),{...data,status:'pending',available:true,ownerId:me.uid,ownerName:me.name,t:Date.now()});showToast('Room submitted for approval! 🏠')}
    closeRoomModal();await loadAll();
  }catch(err){showToast(err.message)}
}
function editListing(id){
  const r=listings.find(x=>x.id===id);if(!r)return;
  editingId=id;openAddRoom();
  $('roomTitle').value=r.title;$('roomLocation').value=r.area;$('roomType').value=r.type;$('roomRent').value=r.price;
  $('roomBathrooms').value=r.bathrooms||1;$('roomAddress').value=r.address||'';$('roomDescription').value=r.desc||'';$('roomContact').value=r.contact||'';
  document.querySelectorAll('.checkbox input').forEach(x=>x.checked=(r.facilities||[]).includes(x.value));
  Q('#roomForm .publish-btn').textContent='Update Room';Q('#roomModal h2').textContent='Edit Room';
  setTimeout(()=>{if(r.latitude){addMap.flyTo({center:[r.longitude,r.latitude],zoom:14});setPin(r.latitude,r.longitude)}},500);
}

// ---------- INQUIRIES ----------
function displayInquiries(){
  Q('.inquiry-count').textContent=threads.length+' inquiries';
  Q('.inquiry-list').innerHTML=threads.length?threads.map((t,i)=>`<div class="inquiry-card"><div class="tenant-avatar">${esc(t.tenant[0])}</div>
    <div class="inquiry-content"><h3>${esc(t.tenant)}</h3><p class="inquiry-room">Interested in: ${esc(t.title)}</p>
    ${t.list.map(x=>`<p>${x.from===me.uid?'<b>You:</b> ':''}"${esc(x.text)}"</p>`).join('')}
    <small>${new Date(t.list[t.list.length-1].t).toLocaleString()}</small></div>
    <div class="inquiry-actions"><button onclick="replyInquiry(${i})">Reply</button></div></div>`).join(''):'<p>No inquiries yet.</p>';
}
function replyInquiry(i){
  replyIdx=i;$('replyPerson').innerText='Replying to '+threads[i].tenant;$('replyText').value='';
  $('replyModal').style.display='block';document.body.style.overflow='hidden';
}
async function sendReply(){
  const text=$('replyText').value.trim(),t=threads[replyIdx];if(!text)return showToast('Please write a reply.');
  try{
    await addDoc(collection(db,'messages'),{lid:t.lid,title:t.title,tid:t.tid,oid:me.uid,from:me.uid,fromName:me.name,text,t:Date.now()});
    closeReply();showToast('Reply sent successfully! 💬');await loadAll();
  }catch(e){showToast(e.message)}
}
function closeReply(){$('replyModal').style.display='none';document.body.style.overflow='auto'}

// ---------- PROFILE / LOGOUT / TOAST ----------
async function editProfile(){
  const n=prompt('Your name',me.name);if(n===null)return;
  const p=prompt('Phone number',me.phone||'');if(p===null)return;
  const upd={name:n.trim()||me.name,phone:p.trim()};
  try{await updateDoc(doc(db,'users',me.uid),upd);me={...me,...upd};fill();showToast('Profile updated.')}catch(e){showToast(e.message)}
}
async function logout(){if(confirm('Do you want to logout?')){await signOut(auth);showToast('Logged out successfully.')}}
function showToast(message){
  const old=$('toast');if(old)old.remove();
  const t=document.createElement('div');t.id='toast';t.innerText=message;
  t.style.cssText='position:fixed;bottom:25px;right:25px;background:#1769aa;color:white;padding:13px 20px;border-radius:7px;z-index:5000;box-shadow:0 5px 20px rgba(0,0,0,.2)';
  document.body.appendChild(t);setTimeout(()=>t.remove(),2500);
}

Object.assign(window,{openAddRoom,closeRoomModal,previewImages,addRoom,editListing,deleteListing,replyInquiry,sendReply,closeReply,editProfile,logout});
