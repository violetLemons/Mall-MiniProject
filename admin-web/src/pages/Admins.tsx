import React,{useState,useEffect} from 'react';
import {AdminApi,requestCloud} from '../api/client';
import {AdminUser} from '../types';
import {Badge} from '../components/Badge';
import {useToast} from '../components/Toast';
export const Admins:React.FC=()=>{
  const {toast}=useToast(),[list,setList]=useState<AdminUser[]>([]),[username,setUsername]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
  const load=async()=>{try{setList(await AdminApi.getAdmins());}catch(e:any){toast(e.message,'error');}};useEffect(()=>{load();},[]);
  const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);try{await fn();setPassword('');await load();toast('已更新','success');}catch(e:any){toast(e.message,'error');}finally{setBusy(false);}};
  return <div style={{padding:24}}><h1>超级管理员</h1><p>仅保留 SUPER_ADMIN。停用或改密后旧会话失效；不能停用当前登录账号。</p>
    <div style={{display:'flex',gap:12}}><input placeholder="用户名" value={username} onChange={e=>setUsername(e.target.value)}/><input placeholder="姓名" value={name} onChange={e=>setName(e.target.value)}/><input type="password" autoComplete="new-password" placeholder="密码至少12位" value={password} onChange={e=>setPassword(e.target.value)}/><button disabled={busy||password.length<12||username.length<3} onClick={()=>run(()=>requestCloud('adminUsers','create',{username,name:name||username,password,role:'SUPER_ADMIN'}))}>创建超管</button></div>
    <table style={{width:'100%',marginTop:24}}><thead><tr><th>用户名</th><th>姓名</th><th>状态</th><th>操作</th></tr></thead><tbody>{list.map(a=><tr key={a.id}><td>{a.username}</td><td>{a.name}</td><td><Badge status={a.status}/></td><td><button disabled={busy||a.id===AdminApi.getCurrentUser()?.id} onClick={()=>run(()=>AdminApi.toggleAdminStatus(a.id,a.status==='ACTIVE'?'DISABLED':'ACTIVE'))}>切换状态</button><button disabled={busy} onClick={()=>{const next=window.prompt('输入新密码，至少12位；所有旧会话将失效');if(next&&next.length>=12)run(()=>requestCloud('adminUsers','resetPassword',{id:a.id,password:next}));}}>重设密码</button></td></tr>)}</tbody></table>
  </div>;
};
