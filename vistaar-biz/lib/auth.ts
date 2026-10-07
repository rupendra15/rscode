import { cookies } from "next/headers";

export type VistaarRole = "admin" | "manager";
export type AuthContext = { userId:string; name:string; email:string; role:VistaarRole; accessToken:string };
const COOKIE="vistaar_session";
const backend=()=> (process.env.VISTAAR_BACKEND_URL||"http://localhost:8080").replace(/\/$/,"");

export async function getAuthContext():Promise<AuthContext|null>{
  try{const token=(await cookies()).get(COOKIE)?.value;if(!token)return null;
    const r=await fetch(backend()+"/api/auth/me",{headers:{cookie:COOKIE+"="+token},cache:"no-store"}); if(!r.ok)return null;
    const b=await r.json();if(!b?.ok||!b.user)return null;
    return {userId:String(b.user.id),name:String(b.user.name||""),email:String(b.user.email||""),role:b.user.role,accessToken:token};
  }catch{return null;}
}
export async function requireRole(roles:VistaarRole[]):Promise<AuthContext>{const c=await getAuthContext();if(!c)throw new Error("UNAUTHENTICATED");if(!roles.includes(c.role))throw new Error("FORBIDDEN");return c;}
export async function signIn(email:string,password:string){const r=await fetch(backend()+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password}),cache:"no-store"});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b?.error||"Unable to sign in.");return {body:b,setCookie:r.headers.get("set-cookie")};}
export async function clearAuthCookies(){const jar=await cookies();const token=jar.get(COOKIE)?.value;if(token){try{await fetch(backend()+"/api/auth/logout",{method:"POST",headers:{cookie:COOKIE+"="+token},cache:"no-store"});}catch{}}jar.delete(COOKIE);}
