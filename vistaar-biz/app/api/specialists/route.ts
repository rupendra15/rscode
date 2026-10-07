import { NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth";

export async function POST(request:Request){
  try{
    await requireRole(["admin","manager"]);
    const body=await request.json();
    const businessId=String(body.businessId||"").trim();
    const specialistType=String(body.specialistType||"").trim();
    const brief=String(body.brief||"").trim();
    if(!businessId||!specialistType||!brief) return NextResponse.json({ok:false,error:"businessId, specialistType and brief are required."},{status:400});
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) return NextResponse.json({ok:false,error:"Specialist workflow is not configured."},{status:503});
    const response=await fetch(url+"/rest/v1/specialist_requests",{
      method:"POST",
      headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"},
      body:JSON.stringify({business_id:businessId,action_id:body.actionId||null,specialist_type:specialistType,brief,status:"recommended"}),cache:"no-store"
    });
    if(!response.ok) return NextResponse.json({ok:false,error:"Specialist request could not be created."},{status:502});
    const rows=await response.json();
    return NextResponse.json({ok:true,request:rows?.[0]||null});
  }catch{return NextResponse.json({ok:false,error:"Unable to create specialist request."},{status:500});}
}
