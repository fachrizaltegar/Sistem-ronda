// SISTEM RONDA - Backend v2
const DB = {
  K: { W:'ronda_warga', R:'ronda_log', S:'ronda_settings', O:'ronda_ops', A:'ronda_act', SES:'ronda_ses' },
  _g(k){ try{return JSON.parse(localStorage.getItem(k))||[];}catch{return[];} },
  _s(k,v){ localStorage.setItem(k,JSON.stringify(v)); },
  _id(){ return Date.now()+'-'+Math.random().toString(36).slice(2,8); },
  _dt(d){ return d.toLocaleDateString('sv-SE'); },
  _tm(d){ return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0'); },
  today(){ return DB._dt(new Date()); },

  warga:{
    all(){ return DB._g(DB.K.W); },
    byId(id){ return DB._g(DB.K.W).find(w=>w.id===id)||null; },
    search(q){ q=q.toLowerCase(); return DB._g(DB.K.W).filter(w=>w.nama.toLowerCase().includes(q)||w.alamat.toLowerCase().includes(q)||w.rt.includes(q)); },
    add({nama,alamat,rt='',rw='',noHP=''}){
      if(!nama||!alamat) throw new Error('Nama & alamat wajib.');
      const list=DB._g(DB.K.W);
      if(list.some(w=>w.nama.toLowerCase()===nama.toLowerCase())) throw new Error('Nama sudah ada.');
      const e={id:DB._id(),nama:nama.trim(),alamat:alamat.trim(),rt:rt||'-',rw:rw||'-',noHP:noHP.trim(),createdAt:new Date().toISOString()};
      e.qr=QR.payload(e); list.push(e); DB._s(DB.K.W,list); return e;
    },
    update(id,f){
      const list=DB._g(DB.K.W),i=list.findIndex(w=>w.id===id);
      if(i<0) throw new Error('Tidak ditemukan.');
      list[i]={...list[i],...f,updatedAt:new Date().toISOString()};
      list[i].qr=QR.payload(list[i]); DB._s(DB.K.W,list); return list[i];
    },
    del(id){
      let list=DB._g(DB.K.W); list=list.filter(w=>w.id!==id);
      DB._s(DB.K.W,list);
      DB._s(DB.K.R,DB._g(DB.K.R).filter(r=>r.wargaId!==id));
    },
    importBulk(arr){
      const res={ok:0,skip:0,errors:[]};
      arr.forEach((item,i)=>{try{DB.warga.add(item);res.ok++;}catch(e){res.skip++;res.errors.push('Baris '+(i+1)+': '+e.message);}});
      return res;
    },
  },

  ronda:{
    all(){ return DB._g(DB.K.R); },
    byDate(d){ return DB._g(DB.K.R).filter(r=>r.tgl===d); },
    byWarga(id){ return DB._g(DB.K.R).filter(r=>r.wargaId===id); },
    range(f,t){ return DB._g(DB.K.R).filter(r=>r.tgl>=f&&r.tgl<=t); },
    record({wargaId,nominal=0,catatan='',method='scan'}){
      const w=DB.warga.byId(wargaId); if(!w) throw new Error('Warga tidak ada.');
      const now=new Date(),tgl=DB._dt(now),list=DB._g(DB.K.R);
      const ex=list.find(r=>r.wargaId===wargaId&&r.tgl===tgl);
      if(ex){ ex.nominal+=Number(nominal); ex.updatedAt=now.toISOString(); DB._s(DB.K.R,list); return ex; }
      const e={id:DB._id(),wargaId,nama:w.nama,alamat:w.alamat,rt:w.rt,rw:w.rw,
        tgl,waktu:DB._tm(now),nominal:Number(nominal),catatan,method,createdAt:now.toISOString()};
      list.push(e); DB._s(DB.K.R,list);
      Auth.log('CATAT_RONDA','Ronda: '+w.nama+' (Rp '+nominal+')');
      return e;
    },
    update(id,f){
      const list=DB._g(DB.K.R),i=list.findIndex(r=>r.id===id);
      if(i<0) throw new Error('Tidak ditemukan.');
      list[i]={...list[i],...f,updatedAt:new Date().toISOString()};
      DB._s(DB.K.R,list); return list[i];
    },
    del(id){
      const list=DB._g(DB.K.R).filter(r=>r.id!==id);
      DB._s(DB.K.R,list); Auth.log('HAPUS_RONDA','ID: '+id);
    },
    statsToday(){
      const tgl=DB.today(),logs=DB.ronda.byDate(tgl),all=DB.warga.all();
      const n = logs.reduce((s,l)=>s+(Number(l.nominal)||0),0);
      return{sudah:logs.length,belum:all.length-logs.length,total:all.length,nominal:n,logs};
    },
    statsWeek(){
      const days=[];
      for(let i=6;i>=0;i--){
        const d=new Date(); d.setDate(d.getDate()-i);
        const ds=DB._dt(d),logs=DB.ronda.byDate(ds);
        const n = logs.reduce((s,l)=>s+(Number(l.nominal)||0),0);
        days.push({date:ds,label:d.toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short'}),count:logs.length,nominal:n});
      }
      return days;
    },
    byWargaStat(f,t){
      const map={};
      let logs=DB._g(DB.K.R);
      if(f&&t) logs=logs.filter(l=>l.tgl>=f&&l.tgl<=t);
      logs.forEach(l=>{
        if(!map[l.wargaId]) map[l.wargaId]={wargaId:l.wargaId,nama:l.nama,hari:0,nominal:0};
        map[l.wargaId].hari++; 
        map[l.wargaId].nominal += (Number(l.nominal) || 0);
      });
      return Object.values(map).sort((a,b)=>b.nominal-a.nominal);
    },
    belumHariIni(){
      const ids=new Set(DB.ronda.byDate(DB.today()).map(l=>l.wargaId));
      return DB.warga.all().filter(w=>!ids.has(w.id));
    },
  },

  ops:{
    all(){ return DB._g(DB.K.O); },
    byId(id){ return DB._g(DB.K.O).find(o=>o.id===id)||null; },
    byUser(u){ return DB._g(DB.K.O).find(o=>o.username===u.toLowerCase())||null; },
    add({nama,username,password,role='petugas',noHP=''}){
      if(!nama||!username||!password) throw new Error('Nama, username, password wajib.');
      const list=DB._g(DB.K.O);
      if(list.some(o=>o.username===username.toLowerCase())) throw new Error('Username sudah ada.');
      const e={id:DB._id(),nama:nama.trim(),username:username.toLowerCase().trim(),
        ph:Auth._h(password),role,noHP:noHP.trim(),aktif:true,createdAt:new Date().toISOString()};
      list.push(e); DB._s(DB.K.O,list); return e;
    },
    update(id,f){
      const list=DB._g(DB.K.O),i=list.findIndex(o=>o.id===id);
      if(i<0) throw new Error('Tidak ditemukan.');
      if(f.password){f.ph=Auth._h(f.password);delete f.password;}
      list[i]={...list[i],...f,updatedAt:new Date().toISOString()};
      DB._s(DB.K.O,list); return list[i];
    },
    del(id){
      const ses=Auth.ses(); if(ses&&ses.oid===id) throw new Error('Tidak bisa hapus akun aktif.');
      let list=DB._g(DB.K.O);
      const admins=list.filter(o=>o.role==='admin'&&o.id!==id);
      if(!admins.length&&list.find(o=>o.id===id)?.role==='admin') throw new Error('Min 1 admin.');
      DB._s(DB.K.O,list.filter(o=>o.id!==id));
    },
    toggle(id,aktif){ return DB.ops.update(id,{aktif}); },
  },

  act:{
    all(){ return DB._g(DB.K.A); },
    byDate(d){ return DB._g(DB.K.A).filter(a=>a.tgl===d); },
    byOp(id){ return DB._g(DB.K.A).filter(a=>a.oid===id); },
    range(f,t){ return DB._g(DB.K.A).filter(a=>a.tgl>=f&&a.tgl<=t); },
    push(oid,action,detail=''){
      const op=DB.ops.byId(oid); if(!op) return;
      const now=new Date(),list=DB._g(DB.K.A);
      list.push({id:DB._id(),oid,nama:op.nama,username:op.username,role:op.role,action,detail,
        tgl:DB._dt(now),waktu:DB._tm(now),createdAt:now.toISOString()});
      DB._s(DB.K.A,list);
    },
    hariIni(){
      const logs=DB.act.byDate(DB.today()),map={};
      logs.forEach(l=>{
        if(!map[l.oid]) map[l.oid]={oid:l.oid,nama:l.nama,username:l.username,role:l.role,login:null,logout:null,aksi:0};
        map[l.oid].aksi++;
        if(l.action==='LOGIN'&&!map[l.oid].login) map[l.oid].login=l.waktu;
        if(l.action==='LOGOUT') map[l.oid].logout=l.waktu;
      });
      return Object.values(map);
    },
  },

  settings:{
    get(){ try{return JSON.parse(localStorage.getItem(DB.K.S))||{};}catch{return{};} },
    set(o){ localStorage.setItem(DB.K.S,JSON.stringify({...DB.settings.get(),...o})); },
  },

  backup(){
    const d={warga:DB._g(DB.K.W),ronda:DB._g(DB.K.R),ops:DB._g(DB.K.O),act:DB._g(DB.K.A),settings:DB.settings.get(),at:new Date().toISOString()};
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));
    a.download='backup_ronda_'+DB.today()+'.json'; a.click();
  },
  restore(file){
    return new Promise((res,rej)=>{
      const r=new FileReader();
      r.onload=e=>{try{const d=JSON.parse(e.target.result);
        if(d.warga) DB._s(DB.K.W,d.warga); if(d.ronda) DB._s(DB.K.R,d.ronda);
        if(d.ops) DB._s(DB.K.O,d.ops); if(d.act) DB._s(DB.K.A,d.act);
        if(d.settings) DB._s(DB.K.S,d.settings);
        res({warga:(d.warga||[]).length,ronda:(d.ronda||[]).length,ops:(d.ops||[]).length});
      }catch{rej(new Error('File tidak valid.'));}};
      r.onerror=()=>rej(new Error('Gagal baca file.')); r.readAsText(file);
    });
  },
  migrate(){
    try {
      const logs = DB._g(DB.K.R); let changed = false;
      logs.forEach(l => {
        if((l.nominal === undefined || l.nominal === null) && l.jml !== undefined) {
          l.nominal = Number(l.jml) * 5000; changed = true;
        }
      });
      if(changed) DB._s(DB.K.R, logs);
    } catch(e) { console.error('Migration failed', e); }
  },
  clear(){
    Object.values(DB.K).forEach(k => {
      if(k !== DB.K.SES) localStorage.removeItem(k);
    });
    localStorage.removeItem('_is_seeded');
  }
};

// QR Helper
const QR={
  payload(w){ return JSON.stringify({id:w.id,nama:w.nama,alamat:w.alamat,rt:w.rt,rw:w.rw,type:'RONDA_QR'}); },
  parse(raw){ try{const d=JSON.parse(raw);return d.type==='RONDA_QR'&&d.id?d:null;}catch{return null;} },
  gen(elId,payload,w=200){
    const el=document.getElementById(elId); if(!el) return; el.innerHTML='';
    if(typeof QRCode==='undefined'){el.innerHTML='<p style="color:red">QRCode.js tidak dimuat</p>';return;}
    return new QRCode(el,{text:payload,width:w,height:w,colorDark:'#0f172a',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  },
  print(warga){
    const p=warga.qr||QR.payload(warga);
    const win=window.open('','_blank');
    win.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>QR - ${warga.nama}</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
    <style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f4f8}
    .card{background:#fff;border-radius:16px;padding:24px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.15);width:260px}
    h2{margin:0 0 4px;font-size:18px;color:#0f172a}p{margin:2px 0;font-size:13px;color:#64748b}
    .badge{display:inline-block;margin-top:8px;background:#6366f1;color:#fff;border-radius:20px;padding:3px 12px;font-size:12px}
    @media print{body{background:#fff}.card{box-shadow:none}}</style></head>
    <body><div class="card"><h2>${warga.nama}</h2><p>${warga.alamat}</p><p>RT ${warga.rt} / RW ${warga.rw}</p>
    <span class="badge">RONDA</span><div id="qr" style="margin:16px auto"></div>
    <p style="font-size:11px;color:#94a3b8;margin-top:8px">Scan untuk catat kehadiran ronda</p></div>
    <script>window.onload=function(){new QRCode(document.getElementById('qr'),{text:${JSON.stringify(p)},width:180,height:180,colorDark:'#0f172a',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});setTimeout(()=>window.print(),800)};<\/script>
    </body></html>`);
    win.document.close();
  },
};

// Auth
const Auth={
  _h(s){ let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}return h.toString(36); },
  ses(){ try{return JSON.parse(sessionStorage.getItem(DB.K.SES))||null;}catch{return null;} },
  ok(){ return!!Auth.ses(); },
  isAdmin(){ const s=Auth.ses();return s&&s.role==='admin'; },
  login(username,password){
    const op=DB.ops.byUser(username);
    if(!op) throw new Error('Username tidak ditemukan.');
    if(!op.aktif) throw new Error('Akun dinonaktifkan.');
    if(op.ph!==Auth._h(password)) throw new Error('Password salah.');
    const s={oid:op.id,nama:op.nama,username:op.username,role:op.role,at:new Date().toISOString()};
    sessionStorage.setItem(DB.K.SES,JSON.stringify(s));
    DB.act.push(op.id,'LOGIN','Login berhasil'); return s;
  },
  logout(){
    const s=Auth.ses(); if(s) DB.act.push(s.oid,'LOGOUT','');
    sessionStorage.removeItem(DB.K.SES);
    window.location.href='login.html';
  },
  log(action,detail=''){ const s=Auth.ses();if(s) DB.act.push(s.oid,action,detail); },
  guard(url='login.html'){ if(!Auth.ok()){window.location.href=url;return false;}return true; },
  guardAdmin(url='index.html'){ if(!Auth.isAdmin()){Notif.error('Hanya admin.');setTimeout(()=>window.location.href=url,1500);return false;}return true; },
};

// Excel Export
const Excel={
  _chk(){ if(typeof XLSX==='undefined') throw new Error('SheetJS belum dimuat.'); },
  laporan(from,to){
    this._chk();
    const logs=from&&to?DB.ronda.range(from,to):DB.ronda.all();
    if(!logs.length) throw new Error('Tidak ada data.');
    const rows=logs.map((l,i)=>({'No':i+1,'Nama KK':l.nama,'Alamat':l.alamat,'RT':l.rt,'RW':l.rw,'Tanggal':l.tgl,'Waktu':l.waktu,'Nominal':l.nominal,'Metode':l.method==='scan'?'Scan QR':'Manual','Catatan':l.catatan||'-'}));
    const ws=XLSX.utils.json_to_sheet(rows);
    ws['!cols']=[{wch:5},{wch:25},{wch:30},{wch:6},{wch:6},{wch:12},{wch:10},{wch:12},{wch:12},{wch:20}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Laporan Ronda');
    const st=DB.ronda.byWargaStat(from,to);
    if(st.length){
      const ws2=XLSX.utils.json_to_sheet(st.map((s,i)=>({'No':i+1,'Nama':s.nama,'Total Hari':s.hari,'Total Nominal':s.nominal})));
      XLSX.utils.book_append_sheet(wb,ws2,'Rekap Warga');
    }
    XLSX.writeFile(wb,'laporan_ronda_'+(from&&to?from+'_sd_'+to:'semua')+'.xlsx');
  },
  warga(){
    this._chk();
    const list=DB.warga.all(); if(!list.length) throw new Error('Belum ada warga.');
    const rows=list.map((w,i)=>({'No':i+1,'Nama KK':w.nama,'Alamat':w.alamat,'RT':w.rt,'RW':w.rw,'No HP':w.noHP||'-','Terdaftar':w.createdAt.slice(0,10)}));
    const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Data Warga');
    XLSX.writeFile(wb,'data_warga_ronda.xlsx');
  },
  activity(from,to){
    this._chk();
    const logs=from&&to?DB.act.range(from,to):DB.act.all();
    if(!logs.length) throw new Error('Tidak ada data aktivitas.');
    const rows=logs.map((l,i)=>({'No':i+1,'Nama':l.nama,'Username':l.username,'Role':l.role,'Aksi':l.action,'Detail':l.detail||'-','Tanggal':l.tgl,'Waktu':l.waktu}));
    const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();
    ws['!cols']=[{wch:5},{wch:22},{wch:15},{wch:10},{wch:18},{wch:30},{wch:12},{wch:10}];
    XLSX.utils.book_append_sheet(wb,ws,'Log Aktivitas');
    const hi=DB.act.hariIni();
    if(hi.length){
      const ws2=XLSX.utils.json_to_sheet(hi.map((o,i)=>({'No':i+1,'Nama':o.nama,'Username':o.username,'Role':o.role,'Login':o.login||'-','Logout':o.logout||'Aktif','Total Aksi':o.aksi})));
      XLSX.utils.book_append_sheet(wb,ws2,'Operator Hari Ini');
    }
    XLSX.writeFile(wb,'log_aktivitas_'+(from&&to?from+'_sd_'+to:'semua')+'.xlsx');
  },
  importWarga(file){
    return new Promise((res,rej)=>{
      this._chk();
      const r=new FileReader();
      r.onload=e=>{try{
        const wb=XLSX.read(e.target.result,{type:'binary'}),ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws).map(r=>({nama:r['Nama KK']||r['Nama']||'',alamat:r['Alamat']||'',rt:String(r['RT']||'-'),rw:String(r['RW']||'-'),noHP:r['No HP']||''})).filter(r=>r.nama);
        res(DB.warga.importBulk(rows));
      }catch{rej(new Error('Format file tidak sesuai.'));}};
      r.onerror=()=>rej(new Error('Gagal baca file.')); r.readAsBinaryString(file);
    });
  },
};

// Notifikasi
const Notif={
  _c:null,
  init(){
    if(document.getElementById('_notif')) return;
    const el=document.createElement('div'); el.id='_notif';
    el.style.cssText='position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
    document.body.appendChild(el); this._c=el;
  },
  show(msg,type='info',dur=3500){
    if(!this._c) this.init();
    const C={success:{bg:'#22c55e',i:'✓'},error:{bg:'#ef4444',i:'✕'},warning:{bg:'#f59e0b',i:'⚠'},info:{bg:'#6366f1',i:'ℹ'}};
    const c=C[type]||C.info,el=document.createElement('div');
    el.style.cssText=`background:${c.bg};color:#fff;padding:12px 18px;border-radius:10px;font-size:14px;box-shadow:0 4px 15px rgba(0,0,0,.3);display:flex;align-items:center;gap:10px;pointer-events:auto;animation:_sIn .3s ease;min-width:260px;max-width:360px;`;
    el.innerHTML=`<span style="font-size:18px;font-weight:bold">${c.i}</span><span>${msg}</span>`;
    this._c.appendChild(el);
    setTimeout(()=>{el.style.animation='_sOut .3s ease forwards';setTimeout(()=>el.remove(),300);},dur);
  },
  success(m){this.show(m,'success');}, error(m){this.show(m,'error');},
  warning(m){this.show(m,'warning');}, info(m){this.show(m,'info');},
};

// Seed default
function _seed(){
  DB.migrate();
  // Akun default (Selalu pastikan ada admin jika kosong)
  if(!DB._g(DB.K.O).length){
    try{
      DB.ops.add({nama:'Administrator',username:'admin',password:'admin123',role:'admin'});
      DB.ops.add({nama:'Petugas Ronda',username:'petugas',password:'ronda123',role:'petugas'});
    }catch{}
  }
  
  // Data Sample (Hanya jika warga kosong DAN belum pernah di-seed)
  const isSeeded = localStorage.getItem('_is_seeded');
  if(!DB._g(DB.K.W).length && !isSeeded){
    [{nama:'Budi Santoso',alamat:'Jl. Melati No.1',rt:'01',rw:'02'},
     {nama:'Agus Salim',alamat:'Jl. Melati No.3',rt:'01',rw:'02'},
     {nama:'Slamet Riyadi',alamat:'Jl. Mawar No.5',rt:'01',rw:'02'},
     {nama:'Hendra Wijaya',alamat:'Jl. Anggrek No.7',rt:'02',rw:'02'},
     {nama:'Dedi Supriadi',alamat:'Jl. Anggrek No.9',rt:'02',rw:'02'},
     {nama:'Rudi Hartono',alamat:'Jl. Kenanga No.2',rt:'02',rw:'03'},
     {nama:'Wahyu Prasetyo',alamat:'Jl. Kenanga No.4',rt:'03',rw:'03'},
     {nama:'Eko Susanto',alamat:'Jl. Dahlia No.6',rt:'03',rw:'03'}]
    .forEach(w=>{try{DB.warga.add(w);}catch{}});
    
    const all=DB.warga.all(),today=DB.today();
    const yst=DB._dt(new Date(Date.now()-86400000));
    all.slice(0,4).forEach(w=>{const l=DB._g(DB.K.R);l.push({id:DB._id(),wargaId:w.id,nama:w.nama,alamat:w.alamat,rt:w.rt,rw:w.rw,tgl:today,waktu:'20:30',nominal:5000,catatan:'',method:'manual',createdAt:new Date().toISOString()});DB._s(DB.K.R,l);});
    all.slice(0,6).forEach(w=>{const l=DB._g(DB.K.R);l.push({id:DB._id(),wargaId:w.id,nama:w.nama,alamat:w.alamat,rt:w.rt,rw:w.rw,tgl:yst,waktu:'21:00',nominal:10000,catatan:'',method:'scan',createdAt:new Date().toISOString()});DB._s(DB.K.R,l);});
    
    localStorage.setItem('_is_seeded', '1');
  }
}

function fmt(n){ return 'Rp ' + Number(n||0).toLocaleString('id-ID'); }

// CSS animasi notif
const _style=document.createElement('style');
_style.textContent='@keyframes _sIn{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}@keyframes _sOut{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(100%)}}';
document.head.appendChild(_style);

document.addEventListener('DOMContentLoaded',()=>{
  Notif.init(); _seed();
  console.log('[Ronda] OK',{warga:DB.warga.all().length,ronda:DB.ronda.all().length,ops:DB._g(DB.K.O).length,session:Auth.ok()?Auth.ses().username:'—'});
});
