import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import{getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import{getFirestore,collection,doc,getDoc,getDocs,setDoc,addDoc,updateDoc,query,where,arrayUnion,arrayRemove}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
let rooms=[],me=null,busy=false,selectedRoom=null,markerById={};
const byId=id=>rooms.find(r=>r.id===id);
const pic=(r,cls)=>r.images[0]?`<img class="${cls}" src="${esc(r.images[0])}" alt="">`:`<div class="${cls}" style="display:flex;align-items:center;justify-content:center;font-size:55px;background:#e8f4fc">🏠</div>`;

// ---------- MAP ----------
const map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[80.45,28.82],zoom:8.5});
map.addControl(new maplibregl.NavigationControl());
window.roomMap=map;
function showMarkers(){
  Object.values(markerById).forEach(m=>m.remove());markerById={};
  rooms.filter(r=>r.latitude&&r.longitude).forEach(r=>{
    markerById[r.id]=new maplibregl.Marker().setLngLat([r.longitude,r.latitude]).setPopup(new maplibregl.Popup({offset:25}).setHTML(
      `<div style="min-width:170px"><strong>${esc(r.title)}</strong><p>📍 ${esc(r.location)}</p><p>💰 Rs. ${Number(r.rent).toLocaleString()}</p>
      <button onclick="showRoomDetails('${r.id}')" style="background:#1769aa;color:white;border:none;padding:7px 12px;border-radius:5px;cursor:pointer">View Details</button></div>`)).addTo(map);
  });
}

// ---------- AUTH ----------
onAuthStateChanged(auth,u=>{if(!busy)setUser(u)});
async function setUser(u){
  me=null;
  if(u){
    const s=await getDoc(doc(db,'users',u.uid));
    if(s.exists()&&s.data().status==='Blocked'){await signOut(auth);showToast('Your account has been blocked by the admin.')}
    else if(s.exists()&&s.data().role==='tenant')me={uid:u.uid,favs:[],...s.data()};
    else if(s.exists())showToast('You are logged in as '+s.data().role+'. Use a tenant account here.');
  }
  header();filterRooms();displayFavorites();
}
function header(){
  const l=Q('.login-btn'),r=Q('.register-btn');
  if(me){l.textContent='Logout ('+(me.name||'').split(' ')[0]+')';l.onclick=logout;r.style.display='none'}
  else{l.textContent='Login';l.onclick=()=>openAuth('login');r.style.display=''}
}
const errMsg=e=>e.code?e.code.replace('auth/','').replace(/-/g,' '):e.message;
async function loginTenant(){
  const e=$('loginEmail').value.trim(),p=$('loginPassword').value;
  if(!e||!p)return showToast('Please enter email and password.');
  try{await signInWithEmailAndPassword(auth,e,p);closeModal('authModal')}catch(x){showToast(errMsg(x))}
}
async function registerTenant(){
  const v=id=>$(id).value.trim(),name=v('registerName'),email=v('registerEmail'),phone=v('registerPhone'),pw=$('registerPassword').value;
  if(!name||!email||!phone||!pw||!$('registerConfirm').value)return showToast('Please fill all fields.');
  if(pw!==$('registerConfirm').value)return showToast('Passwords do not match.');
  try{
    busy=true;const c=await createUserWithEmailAndPassword(auth,email,pw);
    await setDoc(doc(db,'users',c.user.uid),{name,email,phone,role:'tenant',favs:[]});
    busy=false;await setUser(c.user);closeModal('authModal');showToast('Account created successfully! 🎉');
  }catch(x){busy=false;showToast(errMsg(x))}
}
async function logout(){await signOut(auth);showToast('Logged out.')}

// ---------- ROOMS ----------
async function loadRooms(){
  try{
    const s=await getDocs(query(collection(db,'listings'),where('status','==','approved')));
    rooms=s.docs.map(d=>{const r=d.data();return{id:d.id,title:r.title,location:r.area,address:r.address||r.area,rent:r.price,type:r.type,
      owner:r.ownerName,ownerId:r.ownerId,phone:r.contact||'—',bedrooms:r.beds||1,bathrooms:r.bathrooms||1,description:r.desc||'',
      facilities:r.facilities||[],images:r.img?[r.img]:[],latitude:r.latitude,longitude:r.longitude,available:r.available!==false}});
    const opt=(id,all,list)=>{$(id).innerHTML=`<option value="all">${all}</option>`+[...new Set(list)].filter(Boolean).sort().map(x=>`<option>${esc(x)}</option>`).join('')};
    opt('locationFilter','All Locations',rooms.map(r=>r.location));opt('roomTypeFilter','All Room Types',rooms.map(r=>r.type));
    filterRooms();showMarkers();displayFavorites();
  }catch(e){showToast(e.message)}
}
function displayRooms(list){
  $('resultCount').innerText=list.length+(list.length===1?' room found':' rooms found');
  $('noRooms').style.display=list.length?'none':'block';
  $('roomContainer').innerHTML=list.map(r=>{const fav=me&&me.favs.includes(r.id);return`<div class="room-card">
    <div class="room-image-container">${pic(r,'room-image')}<span class="room-badge">${esc(r.type)}${r.available?'':' • Occupied'}</span>
    <button class="favorite-button ${fav?'active':''}" onclick="toggleFavorite('${r.id}')" title="Add to favorites">${fav?'♥':'♡'}</button></div>
    <div class="room-info"><h3>${esc(r.title)}</h3><p class="location">📍 ${esc(r.location)}</p>
    <p>🛏 ${r.bedrooms} Bedroom &nbsp; • &nbsp; 🚿 ${r.bathrooms} Bathroom</p>
    ${r.facilities.length?`<p>✓ ${r.facilities.slice(0,3).map(esc).join(' • ')}</p>`:''}
    <p class="room-price">Rs. ${Number(r.rent).toLocaleString()} <span>/ month</span></p>
    <div class="room-actions"><button class="details-button" onclick="showRoomDetails('${r.id}')">View Details</button><button class="contact-button" onclick="openInquiry('${r.id}')">Contact</button></div></div></div>`}).join('');
}
function filterRooms(){
  const s=$('searchInput').value.toLowerCase().trim(),loc=$('locationFilter').value,rent=$('rentFilter').value,type=$('roomTypeFilter').value;
  displayRooms(rooms.filter(r=>(r.title+' '+r.location+' '+r.address).toLowerCase().includes(s)
    &&(loc==='all'||r.location===loc)&&(rent==='all'||r.rent<=Number(rent))&&(type==='all'||r.type===type)));
}
function clearFilters(){
  $('searchInput').value='';['locationFilter','rentFilter','roomTypeFilter'].forEach(i=>$(i).value='all');filterRooms();
}
function showRoomDetails(id){
  const r=byId(id);if(!r)return;selectedRoom=r;
  $('roomDetails').innerHTML=`${pic(r,'modal-main-image').replace('class="modal-main-image"','id="mainRoomImage" class="modal-main-image"')}
    <div class="modal-thumbnails">${r.images.map(i=>`<img src="${esc(i)}" onclick="changeMainImage(this.src)" alt="">`).join('')}</div>
    <div class="modal-room-info"><h2>${esc(r.title)}</h2><p class="location">📍 ${esc(r.address)}</p>
    <p class="room-price">Rs. ${Number(r.rent).toLocaleString()} <span>/ month</span></p>
    <div class="facilities">${r.facilities.map(f=>`<span class="facility">✓ ${esc(f)}</span>`).join('')}</div>
    <p>🛏 ${r.bedrooms} Bedroom &nbsp;&nbsp; 🚿 ${r.bathrooms} Bathroom</p>
    <p style="margin-top:15px;line-height:1.7;color:#555">${esc(r.description)}</p>
    <hr style="margin:20px 0;border:0;border-top:1px solid #ddd"><h3>Property Owner</h3><p>👤 ${esc(r.owner)}</p><p>📞 ${esc(r.phone)}</p>
    <div class="room-actions"><button class="details-button" onclick="showRoomOnMap('${r.id}')">📍 View on Map</button>
    <button class="contact-button" onclick="closeModal('roomModal');openInquiry('${r.id}')">💬 Contact Owner</button></div></div>`;
  openModal('roomModal');
}
function changeMainImage(src){const i=$('mainRoomImage');if(i&&i.tagName==='IMG')i.src=src}
function showRoomOnMap(id){
  const r=byId(id);if(!r||!r.latitude)return showToast('Owner has not added a map location.');
  closeModal('roomModal');$('map-section').scrollIntoView({behavior:'smooth'});
  setTimeout(()=>{map.flyTo({center:[r.longitude,r.latitude],zoom:15,speed:1.5});const m=markerById[id];if(m&&!m.getPopup().isOpen())m.togglePopup()},600);
}

// ---------- FAVORITES ----------
async function toggleFavorite(id){
  if(!me){showToast('Please login to save favorites.');return openAuth('login')}
  const on=me.favs.includes(id);
  try{
    await updateDoc(doc(db,'users',me.uid),{favs:on?arrayRemove(id):arrayUnion(id)});
    me.favs=on?me.favs.filter(x=>x!==id):[...me.favs,id];
    showToast(on?'Room removed from favorites':'Room added to favorites ❤️');filterRooms();displayFavorites();
  }catch(e){showToast(e.message)}
}
function displayFavorites(){
  const list=me?rooms.filter(r=>me.favs.includes(r.id)):[];
  $('favoriteContainer').innerHTML=list.length?`<div class="room-grid">${list.map(r=>`<div class="room-card"><div class="room-image-container">${pic(r,'room-image')}<span class="room-badge">${esc(r.type)}</span></div>
    <div class="room-info"><h3>${esc(r.title)}</h3><p class="location">📍 ${esc(r.location)}</p><p class="room-price">Rs. ${Number(r.rent).toLocaleString()} <span>/ month</span></p>
    <button class="contact-button" style="width:100%;padding:10px" onclick="showRoomDetails('${r.id}')">View Details</button></div></div>`).join('')}</div>`
    :`<div class="empty-favorite"><div>❤️</div><h3>No favorites yet</h3><p>${me?'Click the heart button on a room to save it.':'Login, then click the heart button on a room to save it.'}</p></div>`;
}

// ---------- INQUIRY ----------
function openInquiry(id){
  const r=byId(id);if(!r)return;
  if(!me){showToast('Please login to contact the owner.');return openAuth('login')}
  selectedRoom=r;$('inquiryRoomName').innerText=`${r.title} — ${r.location}`;
  $('inquiryName').value=me.name||'';$('inquiryPhone').value=me.phone||'';
  $('inquiryMessage').value=`Hello ${r.owner}, I am interested in your room. Is it still available?`;
  openModal('inquiryModal');
}
async function sendInquiry(){
  const name=$('inquiryName').value.trim(),phone=$('inquiryPhone').value.trim(),msg=$('inquiryMessage').value.trim();
  if(!name||!phone||!msg)return showToast('Please fill all fields.');
  try{
    await addDoc(collection(db,'messages'),{lid:selectedRoom.id,title:selectedRoom.title,tid:me.uid,oid:selectedRoom.ownerId,from:me.uid,fromName:name,text:`${msg} (Phone: ${phone})`,t:Date.now()});
    closeModal('inquiryModal');showToast('Inquiry sent successfully! 💬');
  }catch(e){showToast(e.message)}
}

// ---------- AUTH MODAL / COMMON ----------
function openAuth(t){openModal('authModal');showAuthForm(t)}
function showAuthForm(t){
  const L=t==='login';
  $('loginForm').classList.toggle('hidden',!L);$('registerForm').classList.toggle('hidden',L);
  $('loginTab').classList.toggle('active',L);$('registerTab').classList.toggle('active',!L);
}
function openModal(id){$(id).style.display='block';document.body.style.overflow='hidden'}
function closeModal(id){$(id).style.display='none';document.body.style.overflow='auto'}
function toggleMenu(){const m=$('mobileMenu');m.style.display=m.style.display==='block'?'none':'block'}
function showToast(message){
  const old=$('toast');if(old)old.remove();
  const t=document.createElement('div');t.id='toast';t.innerText=message;
  t.style.cssText='position:fixed;bottom:25px;right:25px;background:#1769aa;color:white;padding:13px 20px;border-radius:7px;z-index:5000;box-shadow:0 5px 20px rgba(0,0,0,.2)';
  document.body.appendChild(t);setTimeout(()=>t.remove(),2500);
}

Object.assign(window,{filterRooms,clearFilters,showRoomDetails,changeMainImage,showRoomOnMap,toggleFavorite,openInquiry,sendInquiry,openAuth,showAuthForm,loginTenant,registerTenant,openModal,closeModal,toggleMenu,logout});
loadRooms();
