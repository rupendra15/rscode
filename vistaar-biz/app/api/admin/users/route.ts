import { NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth";

function db() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("Vistaar database is not configured.");
  return {url,key};
}
const h=(key:string,extra?:Record<string,string>)=>({apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...extra});

export async function GET(){
 try{
  await requireRole(["admin"]);
  const {url,key}=db();
  const response=await fetch(url+"/rest/v1/app_users?select=id,name,email,role,status,created_at,last_login_at&order=created_at.desc&limit=500",{headers:h(key),cache:"no-store"});
  if(!response.ok) return NextResponse.json({ok:false,error:"Users could not be loaded."},{status:502});
  const users=await response.json();
  return NextResponse.json({ok:true,users});
 }catch(e){
  const m=e instanceof Error?e.message:"Unable to load users.";
  return NextResponse.json({ok:false,error:m==="FORBIDDEN"?"Admin access is required.":m},{status:m==="FORBIDDEN"?403:500});
 }
}

export async function POST(request:Request){
 try{
  const admin=await requireRole(["admin"]);
  const body=await request.json();
  const userId=String(body.userId||"").trim();
  const role=String(body.role||"user").trim();
  const status=String(body.status||"active").trim();
  if(!userId||!["admin","manager","user"].includes(role)||!["active","disabled"].includes(status)) {
   return NextResponse.json({ok:false,error:"Valid user, role and status are required."},{status:400});
  }
  if(userId===admin.userId && role!=="admin") {
   return NextResponse.json({ok:false,error:"The active admin account cannot remove its own admin role."},{status:400});
  }
  const {url,key}=db();
  const response=await fetch(url+"/rest/v1/app_users?id=eq."+encodeURIComponent(userId),{
   method:"PATCH",
   headers:h(key,{Prefer:"return=representation"}),
   body:JSON.stringify({role,status,updated_at:new Date().toISOString()}),
   cache:"no-store"
  });
  if(!response.ok) return NextResponse.json({ok:false,error:"User role could not be updated."},{status:502});
  const rows=await response.json();
  return NextResponse.json({ok:true,user:rows?.[0]||null});
 }catch(e){
  const m=e instanceof Error?e.message:"Unable to update user.";
  return NextResponse.json({ok:false,error:m==="FORBIDDEN"?"Admin access is required.":m},{status:m==="FORBIDDEN"?403:500});
 }
}
