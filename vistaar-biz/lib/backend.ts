import { cookies } from "next/headers";
const base=()=> (process.env.VISTAAR_BACKEND_URL||"http://localhost:8080").replace(/\/$/,"");
export async function backendFetch(path:string,init:RequestInit={},request?:Request){
  const h=new Headers(init.headers);
  if(!h.has("Content-Type")&&init.body)h.set("Content-Type","application/json");
  const token=(await cookies()).get("vistaar_session")?.value;
  if(token&&!h.has("cookie"))h.set("cookie","vistaar_session="+token);
  return fetch(base()+path,{...init,headers:h,cache:"no-store"});
}
export async function backendBase(){return base();}
