import { NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth";
const headers=(key:string)=>({apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"});
export async function GET(){
 try{
  await requireRole(["admin"]);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) return NextResponse.json({ok:false,error:"User administration is not configured."},{status:503});
  const [usersRes,rolesRes]=await Promise.all([
   fetch(url+"/auth/v1/admin/users?page=1&per_page=100",{headers:headers(key),cache:"no-store"}),
   fetch(url+"/rest/v1/user_roles?select=*&limit=500",{headers:headers(key),cache:"no-store"})
  ]);
  if(!usersRes.ok) return NextResponse.json({ok:false,error:"Auth users could not be loaded."},{status:502});
  const usersData=await usersRes.json(); const roles=rolesRes.ok?await rolesRes.json():[];
  const roleMap=new Map<string, any>((roles||[]).map((r:any)=>[String(r.user_id),r]));
  return NextResponse.json({ok:true,users:(usersData.users||[]).map((u:any)=>({id:u.id,email:u.email,createdAt:u.created_at,confirmed:Boolean(u.email_confirmed_at),role:roleMap.get(u.id)?.role||"user",status:roleMap.get(u.id)?.status||"active"}))});
 }catch(e){const m=e instanceof Error?e.message:"Unable to load users.";return NextResponse.json({ok:false,error:m==="FORBIDDEN"?"Admin access is required.":m},{status:m==="FORBIDDEN"?403:500});}
}
export async function POST(request:Request){
 try{
  await requireRole(["admin"]);
  const body=await request.json(); const userId=String(body.userId||"").trim(); const role=String(body.role||"user").trim(); const status=String(body.status||"active").trim();
  if(!userId||!["admin","manager","user"].includes(role)||!["active","disabled"].includes(status)) return NextResponse.json({ok:false,error:"Valid user, role and status are required."},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return NextResponse.json({ok:false,error:"User administration is not configured."},{status:503});
  const response=await fetch(url+"/rest/v1/user_roles?on_conflict=user_id",{method:"POST",headers:{...headers(key),Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({user_id:userId,role,status,updated_at:new Date().toISOString()}),cache:"no-store"});
  if(!response.ok)return NextResponse.json({ok:false,error:"User role could not be updated."},{status:502});
  const rows=await response.json();return NextResponse.json({ok:true,user:rows?.[0]||null});
 }catch(e){const m=e instanceof Error?e.message:"Unable to update user.";return NextResponse.json({ok:false,error:m==="FORBIDDEN"?"Admin access is required.":m},{status:m==="FORBIDDEN"?403:500});}
}