import { NextResponse } from "next/server";

export async function GET(request:Request){
  const businessId=new URL(request.url).searchParams.get("businessId");
  if(!businessId) return NextResponse.json({ok:false,error:"businessId is required."},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) return NextResponse.json({ok:false,stored:false},{status:503});
  const headers={apikey:key,Authorization:"Bearer "+key};
  try{
    const [businessRes,auditRes,actionsRes]=await Promise.all([
      fetch(url+"/rest/v1/businesses?select=*&id=eq."+encodeURIComponent(businessId)+"&limit=1",{headers,cache:"no-store"}),
      fetch(url+"/rest/v1/growth_audits?select=*&business_id=eq."+encodeURIComponent(businessId)+"&order=created_at.desc&limit=1",{headers,cache:"no-store"}),
      fetch(url+"/rest/v1/growth_actions?select=*&business_id=eq."+encodeURIComponent(businessId)+"&order=impact.desc&limit=10",{headers,cache:"no-store"})
    ]);
    if(!businessRes.ok||!auditRes.ok) return NextResponse.json({ok:false,error:"Workspace data could not be loaded."},{status:502});
    const businesses=await businessRes.json(), audits=await auditRes.json(), actions=actionsRes.ok?await actionsRes.json():[];
    if(!businesses?.[0]||!audits?.[0]) return NextResponse.json({ok:false,error:"Workspace not found."},{status:404});
    const b=businesses[0], a=audits[0];
    return NextResponse.json({
      ok:true,
      business:b,
      audit:a.result,
      auditId:a.id,
      actions
    });
  }catch{
    return NextResponse.json({ok:false,error:"Unable to load the workspace."},{status:500});
  }
}