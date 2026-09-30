"use client";

import { FormEvent, useEffect, useState } from "react";

export type DbRole = "super_admin" | "department_admin" | "project_manager" | "operator";
export type SessionUser = { id: string; employeeId: string; name: string; department: string; role: DbRole; active: boolean };

const roleLabels: Record<DbRole, string> = { super_admin: "最高管理員", department_admin: "部門管理員", project_manager: "專案管理員", operator: "操作員" };

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...(options?.headers || {}) } });
  const raw = await response.text();
  let data: any = {};
  if (raw) try { data = JSON.parse(raw); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : `伺服器暫時無法處理此操作（錯誤 ${response.status}），請稍後再試。`);
  return data;
}

export function AuthPortal({ initialized, onLogin }: { initialized: boolean; onLogin: (user: SessionUser) => void }) {
  const [isInitialized,setIsInitialized]=useState(initialized);
  const [mode, setMode] = useState<"login" | "register">(initialized ? "login" : "register");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [login, setLogin] = useState({ employeeId: "", password: "" });
  const [register, setRegister] = useState({ employeeId: "", name: "", department: "", password: "", confirm: "" });
  const refreshUser = async () => { const status = await requestJson("/api/auth/status"); if (status.user) onLogin(status.user); };
  const submitLogin = async (event: FormEvent) => { event.preventDefault();setBusy(true);setError("");setMessage("");try{await requestJson("/api/auth/login",{method:"POST",body:JSON.stringify(login)});await refreshUser()}catch(reason){setError(reason instanceof Error?reason.message:"登入失敗")}finally{setBusy(false)}};
  const submitRegister = async (event: FormEvent) => { event.preventDefault();setError("");setMessage("");if(register.password!==register.confirm)return setError("兩次輸入的密碼不一致。");setBusy(true);try{const result=await requestJson("/api/auth/register",{method:"POST",body:JSON.stringify(register)});setMessage(result.message);setLogin({employeeId:register.employeeId,password:""});if(result.firstUser)setIsInitialized(true);setMode("login")}catch(reason){setError(reason instanceof Error?reason.message:"申請失敗")}finally{setBusy(false)}};
  return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><div className="brand-mark">Y</div><div><p className="eyebrow">MATERIAL R&amp;D CENTER</p><h1>{isInitialized?"材料研發中心登入":"建立第一位最高管理員"}</h1><small>by YCL 開發</small></div></div><p className="auth-intro">{isInitialized?"使用公司工號與密碼登入；尚未有帳號可先送出申請，待管理員啟用。":"此步驟只會出現一次。請由系統負責人建立最高管理員帳號。"}</p>{isInitialized&&<div className="auth-tabs"><button className={mode==="login"?"active":""} onClick={()=>{setMode("login");setError("");setMessage("")}}>帳密登入</button><button className={mode==="register"?"active":""} onClick={()=>{setMode("register");setError("");setMessage("")}}>申請帳號</button></div>}{mode==="login"&&isInitialized?<form className="auth-form" onSubmit={submitLogin}><label><span>工號</span><input required autoComplete="username" value={login.employeeId} onChange={event=>setLogin({...login,employeeId:event.target.value})} placeholder="例如 RD001" /></label><label><span>密碼</span><input required type="password" autoComplete="current-password" value={login.password} onChange={event=>setLogin({...login,password:event.target.value})} /></label><button className="primary" disabled={busy}>{busy?"登入中…":"登入系統"}</button></form>:<form className="auth-form" onSubmit={submitRegister}><div className="auth-grid"><label><span>工號</span><input required autoComplete="username" value={register.employeeId} onChange={event=>setRegister({...register,employeeId:event.target.value})} placeholder="例如 RD001" /></label><label><span>姓名</span><input required value={register.name} onChange={event=>setRegister({...register,name:event.target.value})} /></label></div><label><span>部門</span><input required value={register.department} onChange={event=>setRegister({...register,department:event.target.value})} placeholder="例如 研發部" /></label><label><span>設定密碼</span><input required minLength={10} type="password" autoComplete="new-password" value={register.password} onChange={event=>setRegister({...register,password:event.target.value})} /><small>至少 10 碼，必須同時包含英文字母與數字。</small></label><label><span>再次輸入密碼</span><input required minLength={10} type="password" autoComplete="new-password" value={register.confirm} onChange={event=>setRegister({...register,confirm:event.target.value})} /></label><button className="primary" disabled={busy}>{busy?"處理中…":isInitialized?"送出帳號申請":"建立最高管理員"}</button></form>}{message&&<div className="auth-message success" role="status">{message}</div>}{error&&<div className="auth-message error" role="alert">{error}</div>}<p className="auth-security">登入連續失敗 5 次會鎖定 15 分鐘；工作階段 8 小時後失效。</p></section></main>;
}

type ManagedUser = SessionUser & { lastLoginAt?: number | null; createdAt?: number };

export function AccountManagement({ currentUser }: { currentUser: SessionUser }) {
  const [users,setUsers]=useState<ManagedUser[]>([]);const [loading,setLoading]=useState(true);const [message,setMessage]=useState("");
  const load=async()=>{setLoading(true);try{const data=await requestJson("/api/auth/users");setUsers(data.users)}catch(reason){setMessage(reason instanceof Error?reason.message:"無法讀取帳號")}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const update=(id:string,change:Partial<ManagedUser>)=>setUsers(all=>all.map(user=>user.id===id?{...user,...change}:user));
  const save=async(user:ManagedUser)=>{setMessage("");try{await requestJson("/api/auth/users",{method:"PATCH",body:JSON.stringify({id:user.id,active:user.active,role:user.role,department:user.department})});setMessage(`${user.employeeId} 權限已更新`);await load()}catch(reason){setMessage(reason instanceof Error?reason.message:"更新失敗")}};
  return <section className="panel manage-card wide-card"><div className="panel-title"><div><h3>帳號申請與啟用</h3><p>核准申請、指派角色或停用帳號；未啟用者無法登入。</p></div><button className="secondary-button" onClick={load}>重新整理</button></div>{message&&<div className="account-message" role="status">{message}</div>}<div className="spec-table-wrap"><table className="spec-table account-table"><thead><tr><th>工號／姓名</th><th>部門</th><th>角色</th><th>狀態</th><th>最後登入</th><th>操作</th></tr></thead><tbody>{loading?<tr><td colSpan={6}>讀取中…</td></tr>:users.map(user=><tr key={user.id}><td><strong>{user.employeeId}</strong><small>{user.name}</small></td><td><input value={user.department} onChange={event=>update(user.id,{department:event.target.value})} /></td><td><select value={user.role} disabled={currentUser.role!=="super_admin"&&user.role==="super_admin"} onChange={event=>update(user.id,{role:event.target.value as DbRole})}>{Object.entries(roleLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td><td><label className="activation-toggle"><input type="checkbox" checked={user.active} disabled={user.id===currentUser.id} onChange={event=>update(user.id,{active:event.target.checked})} /><span className={user.active?"status good":"status warn"}>{user.active?"已啟用":"待啟用"}</span></label></td><td>{user.lastLoginAt?new Date(user.lastLoginAt).toLocaleString("zh-TW"):"尚未登入"}</td><td><button className="primary" onClick={()=>save(user)}>儲存權限</button></td></tr>)}</tbody></table></div></section>;
}

export { roleLabels };
