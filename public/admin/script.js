import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import{getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import{getFirestore,collection,doc,getDoc,getDocs,updateDoc,deleteDoc}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LABEL={pending:'Pending',approved:'Active',rejected:'Rejected'};
let owners=[],tenants=[],listings=[],reports=[],selectedListingId=null,listingFilter='all';

// ---------- LOGIN ----------
const lm=document.createElement('div');
lm.className='modal';lm.id='loginModal';
lm.innerHTML=`<div class="modal-box" style="max-width:380px"><div class="modal-header"><h2>Admin Login</h2></div>
<div class="search-row"><input id="loginEmail" type="email" placeholder="Email"></div>
<div class="search-row"><input id="loginPass" type="password" placeholder="Password"></div>
<p id="loginErr" style="color:#b91c1c;font-size:13px"></p>
<div class="modal-actions"><button class="approve-btn" id="loginBtn">Log in</button></div></div>`;
document.body.appendChild(lm);
$('loginBtn').onclick=async()=>{
  $('loginErr').textContent='';
  try{await signInWithEmailAndPassword(auth,$('loginEmail').value.trim(),$('loginPass').value)}
  catch(e){$('loginErr').textContent=(e.code||e.message).replace('auth/','').replace(/-/g,' ')}
};
onAuthStateChanged(auth,async u=>{
  if(!u){lm.style.display='flex';return}
  const s=await getDoc(doc(db,'users',u.uid));
  if(!s.exists()||s.data().role!=='admin'){
    await signOut(auth);$('loginErr').textContent='Admin access only.';return;
  }
  lm.style.display='none';
  await loadAll();
});

// ---------- DATA ----------
async function loadAll(){
  const rd=async n=>(await getDocs(collection(db,n))).docs.map(d=>({id:d.id,...d.data()}));
  try{
    const[us,ls,rs]=await Promise.all([rd('users'),rd('listings'),rd('reports')]);
    listings=ls.map(l=>({...l,owner:l.ownerName,location:l.area,rent:l.price,raw:l.status,status:LABEL[l.status]||l.status}));
    const count=id=>listings.filter(l=>l.ownerId===id).length;
    owners=us.filter(u=>u.role==='owner').map(u=>({...u,location:'—',listings:count(u.id),status:u.status||'Pending'}));
    tenants=us.filter(u=>u.role==='tenant').map(u=>({...u,location:'—',joined:'—',status:u.status||'Active'}));
    reports=rs.map(r=>({...r,reporter:r.by,listing:r.title,date:r.t?new Date(r.t).toLocaleDateString():'—',status:'Pending'}));
    updateDashboard();displayOwners();displayTenants();displayListings(listingFilter);displayReports();displayActivities();setDate();
  }catch(e){showToast(e.message)}
}
async function setUser(id,status,msg){await updateDoc(doc(db,'users',id),{status});showToast(msg);await loadAll()}
async function setListing(id,status,msg){await updateDoc(doc(db,'listings',id),{status});showToast(msg);await loadAll()}

// ---------- DASHBOARD ----------
function updateDashboard(){
  $('totalUsers').textContent=owners.length+tenants.length;
  $('totalListings').textContent=listings.length;
  $('pendingListings').textContent=listings.filter(l=>l.status==='Pending').length;
  $('totalReports').textContent=reports.length;
}
function setDate(){$('currentDate').textContent=new Date().toLocaleDateString('en-NP',{year:'numeric',month:'long',day:'numeric'})}
function showSection(id){
  document.querySelectorAll('.section').forEach(s=>s.classList.add('hidden'));
  $(id).classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('nav a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();showSection(a.getAttribute('href').slice(1))}));

// ---------- OWNERS ----------
function displayOwners(data=owners){
  $('ownerTable').innerHTML=data.map(o=>`<tr>
    <td><div class="user-cell"><div class="user-avatar">${esc((o.name||'?')[0])}</div><strong>${esc(o.name)}</strong></div></td>
    <td>${esc(o.email)}</td><td>${o.location}</td><td>${o.listings}</td>
    <td><span class="status ${o.status==='Verified'?'active':o.status==='Blocked'?'blocked':'pending'}">${o.status}</span></td>
    <td><button class="small-btn view-btn" onclick="viewOwner('${o.id}')">View</button>
    ${o.status==='Verified'?`<button class="small-btn block-btn" onclick="blockOwner('${o.id}')">Block</button>`:`<button class="small-btn verify-btn" onclick="verifyOwner('${o.id}')">${o.status==='Blocked'?'Unblock':'Verify'}</button>`}</td></tr>`).join('')||'<tr><td colspan="6">No owners yet.</td></tr>';
}
function searchOwners(){
  const q=$('ownerSearch').value.toLowerCase();
  displayOwners(owners.filter(o=>(o.name+' '+o.email).toLowerCase().includes(q)));
}
function viewOwner(id){
  const o=owners.find(x=>x.id===id);
  $('ownerDetails').innerHTML=[['Name',o.name],['Email',o.email],['Total Listings',o.listings],['Status',o.status]].map(r=>`<div class="detail-row"><span>${r[0]}</span><strong>${esc(r[1])}</strong></div>`).join('');
  $('ownerModal').style.display='flex';
}
const verifyOwner=id=>setUser(id,'Verified','Owner verified.');
const blockOwner=id=>setUser(id,'Blocked','Owner blocked.');

// ---------- TENANTS ----------
function displayTenants(data=tenants){
  $('tenantTable').innerHTML=data.map(t=>`<tr>
    <td><div class="user-cell"><div class="user-avatar">${esc((t.name||'?')[0])}</div><strong>${esc(t.name)}</strong></div></td>
    <td>${esc(t.email)}</td><td>${t.location}</td><td>${t.joined}</td>
    <td><span class="status ${t.status==='Active'?'active':'blocked'}">${t.status}</span></td>
    <td><button class="small-btn block-btn" onclick="toggleTenant('${t.id}')">${t.status==='Active'?'Block':'Unblock'}</button></td></tr>`).join('')||'<tr><td colspan="6">No tenants yet.</td></tr>';
}
function searchTenants(){
  const q=$('tenantSearch').value.toLowerCase();
  displayTenants(tenants.filter(t=>(t.name+' '+t.email).toLowerCase().includes(q)));
}
function toggleTenant(id){
  const t=tenants.find(x=>x.id===id),on=t.status==='Active';
  setUser(id,on?'Blocked':'Active',on?'Tenant blocked.':'Tenant unblocked.');
}

// ---------- LISTINGS ----------
function displayListings(filter='all'){
  listingFilter=filter;
  const data=filter==='all'?listings:listings.filter(l=>l.status===filter);
  $('listingContainer').innerHTML=data.length?data.map(l=>`<div class="listing-card">
    <div class="room-image">${l.img?`<img src="${esc(l.img)}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()">`:'🏠'}</div>
    <div class="listing-body"><h3>${esc(l.title)}</h3>
    <div class="location">📍 ${esc(l.location)}</div>
    <div class="rent">Rs. ${Number(l.rent).toLocaleString()} /month</div>
    <p class="owner-name">Owner: ${esc(l.owner)}</p><p class="owner-name">Type: ${esc(l.type)}</p><br>
    <span class="status ${l.status.toLowerCase()}">${l.status}</span>
    <div class="listing-actions"><button class="view-listing" onclick="viewListing('${l.id}')">View</button>
    ${l.status==='Pending'?`<button class="approve-listing" onclick="approveListing('${l.id}')">Approve</button><button class="reject-listing" onclick="rejectListing('${l.id}')">Reject</button>`:''}</div></div></div>`).join(''):'<div class="content-card"><p>No listings found.</p></div>';
}
function filterListings(f,btn){
  document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');displayListings(f);
}
function viewListing(id){
  const l=listings.find(x=>x.id===id);selectedListingId=id;
  $('listingDetails').innerHTML=[['Room',l.title],['Owner',l.owner],['Location',l.location],['Room Type',l.type],['Monthly Rent','Rs. '+l.rent],['Contact',l.contact],['Description',l.desc],['Status',l.status]].map(r=>`<div class="detail-row"><span>${r[0]}</span><strong>${esc(r[1])}</strong></div>`).join('');
  $('listingModal').style.display='flex';
}
const approveListing=id=>setListing(id,'approved','Listing approved.');
const rejectListing=id=>setListing(id,'rejected','Listing rejected.');
function approveSelectedListing(){if(selectedListingId){approveListing(selectedListingId);closeModal('listingModal')}}
function rejectSelectedListing(){if(selectedListingId){rejectListing(selectedListingId);closeModal('listingModal')}}

// ---------- REPORTS ----------
function displayReports(){
  $('reportContainer').innerHTML=reports.length?reports.map(r=>`<div class="report">
    <div class="report-header"><strong>🚨 ${esc(r.listing)}</strong><span class="status pending">${r.status}</span></div>
    <p><strong>Reported by:</strong> ${esc(r.reporter)}</p><p><strong>Reason:</strong> ${esc(r.reason)}</p><p><strong>Date:</strong> ${r.date}</p><br>
    <button class="small-btn verify-btn" onclick="resolveReport('${r.id}')">Resolve</button>
    <button class="small-btn block-btn" onclick="removeReportedListing('${r.id}')">Remove Listing</button></div>`).join(''):'<p>No reports.</p>';
}
async function resolveReport(id){await deleteDoc(doc(db,'reports',id));showToast('Report resolved.');await loadAll()}
async function removeReportedListing(id){
  const r=reports.find(x=>x.id===id);
  if(r&&listings.some(l=>l.id===r.lid))await updateDoc(doc(db,'listings',r.lid),{status:'rejected'});
  await deleteDoc(doc(db,'reports',id));showToast('Listing removed.');await loadAll();
}

// ---------- ACTIVITY ----------
function displayActivities(){
  const a=[...listings.filter(l=>l.t).map(l=>({icon:'🏠',text:'Room listing submitted',user:l.owner,t:l.t})),
           ...reports.filter(r=>r.t).map(r=>({icon:'🚨',text:'A room listing was reported',user:r.reporter,t:r.t}))]
          .sort((x,y)=>y.t-x.t).slice(0,5);
  $('activityList').innerHTML=a.length?a.map(x=>`<div class="activity"><div class="activity-icon">${x.icon}</div><div><p><strong>${x.text}</strong></p><small>${esc(x.user)} • ${new Date(x.t).toLocaleString()}</small></div></div>`).join(''):'<p>No activity yet.</p>';
}
const showAllActivity=()=>showToast('Latest activity is shown in the dashboard.');

// ---------- COMMON ----------
const closeModal=id=>$(id).style.display='none';
async function logout(){
  if(confirm('Are you sure you want to logout?'))await signOut(auth);
}
function showToast(m){const t=$('toast');t.textContent=m;t.style.display='block';clearTimeout(showToast.t);showToast.t=setTimeout(()=>t.style.display='none',2500)}

Object.assign(window,{showSection,searchOwners,searchTenants,viewOwner,verifyOwner,blockOwner,toggleTenant,filterListings,viewListing,approveListing,rejectListing,approveSelectedListing,rejectSelectedListing,resolveReport,removeReportedListing,showAllActivity,closeModal,logout});
