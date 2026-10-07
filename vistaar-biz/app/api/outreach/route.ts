import { NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth";
export async function POST(request:Request){
 try{
  const auth=await requireRole(["admin","manager"]);
  const body=await request.json();
  const businessId=String(body.businessId||"").trim();
  const status=String(body.status||"contacted").trim();
  const notes=String(body.notes||"").trim();
  if(!businessId) return NextResponse.json({ok:false,error:"businessId is required."},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) return NextResponse.json({ok:false,error:"Outreach persistence is not configured."},{status:503});
  const now=new Date().toISOString();
  const payload={business_id:businessId,manager_user_id:auth.userId,status,notes:notes||null,contacted_at:status==="contacted"||status==="follow_up"||status==="converted"?now:null,updated_at:now};
  const response=await fetch(url+"/rest/v1/manager_outreach?on_conflict=business_id,manager_user_id",{
   method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=representation"},
   body:JSON.stringify(payload),cache:"no-store"
  });
  if(!response.ok) return NextResponse.json({ok:false,error:"Outreach status could not be saved."},{status:502});
  const rows=await response.json();
  return NextResponse.json({ok:true,outreach:rows?.[0]||null});
 }catch(e){
  const message=e instanceof Error?e.message:"Unable to save outreach.";
  return NextResponse.json({ok:false,error:message==="FORBIDDEN"?"Only Vistaar managers and admins can record outreach.":"Unable to save outreach."},{status:message==="FORBIDDEN"?403:500});
 }
}
export async function GET(request:Request){
 try{
  const auth=await requireRole(["admin","manager"]);
  const businessId=new URL(request.url).searchParams.get("businessId");
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) return NextResponse.json({ok:false,error:"Outreach persistence is not configured."},{status:503});
  const q=new URLSearchParams({select:"*",order:"updated_at.desc",limit:"100"});
  if(businessId) q.set("business_id","eq."+businessId);
  if(auth.role==="manager") q.set("manager_user_id","eq."+auth.userId);
  const response=await fetch(url+"/rest/v1/manager_outreach?"+q.toString(),{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
  if(!response.ok) return NextResponse.json({ok:false,error:"Outreach could not be loaded."},{status:502});
  return NextResponse.json({ok:true,outreach:await response.json()});
 }catch(e){const message=e instanceof Error?e.message:"Unable to load outreach.";return NextResponse.json({ok:false,error:message==="FORBIDDEN"?"Dashboard access is restricted.":message},{status:message==="FORBIDDEN"?403:500});}
}