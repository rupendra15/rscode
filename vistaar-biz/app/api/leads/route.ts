import { NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth";

export async function POST(request:Request){
  try{
    await requireRole(["admin","manager"]);
    const body=await request.json();
    const businessId=String(body.businessId||"").trim();
    const source=String(body.source||"").trim();
    if(!businessId||!source) return NextResponse.json({ok:false,error:"businessId and source are required."},{status:400});
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) return NextResponse.json({ok:false,error:"Lead persistence is not configured."},{status:503});
    const response=await fetch(url+"/rest/v1/growth_leads",{
      method:"POST",
      headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"},
      body:JSON.stringify({
        business_id:businessId,source,external_id:body.externalId||null,name:body.name||null,
        phone:body.phone||null,email:body.email||null,status:body.status||"new",
        value:body.value??null,currency:body.currency||"INR",metadata:body.metadata||null
      }),cache:"no-store"
    });
    if(!response.ok) return NextResponse.json({ok:false,error:"Lead could not be saved."},{status:502});
    const rows=await response.json();
    return NextResponse.json({ok:true,lead:rows?.[0]||null});
  }catch(e){
    const message=e instanceof Error?e.message:"";
    if(message==="UNAUTHENTICATED") return NextResponse.json({ok:false,error:"Please sign in."},{status:401});
    if(message==="FORBIDDEN") return NextResponse.json({ok:false,error:"This operation is available only to Vistaar admin and manager accounts."},{status:403});return NextResponse.json({ok:false,error:"Unable to save lead."},{status:500});}
}
