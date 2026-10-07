import { NextResponse } from "next/server";

export async function POST(request:Request){
  try{
    const body=await request.json();
    const businessId=String(body.businessId||"").trim();
    const metricName=String(body.metricName||"").trim();
    const source=String(body.source||"").trim();
    if(!businessId||!metricName||!source) return NextResponse.json({ok:false,error:"businessId, metricName and source are required."},{status:400});
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) return NextResponse.json({ok:false,error:"Measurement persistence is not configured."},{status:503});
    const response=await fetch(url+"/rest/v1/growth_measurements",{
      method:"POST",
      headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"},
      body:JSON.stringify({
        business_id:businessId,action_id:body.actionId||null,metric_name:metricName,
        baseline_value:body.baselineValue??null,current_value:body.currentValue??null,
        unit:body.unit||null,source,metadata:body.metadata||null
      }),cache:"no-store"
    });
    if(!response.ok) return NextResponse.json({ok:false,error:"Measurement could not be saved."},{status:502});
    const rows=await response.json();
    return NextResponse.json({ok:true,measurement:rows?.[0]||null});
  }catch{return NextResponse.json({ok:false,error:"Unable to save measurement."},{status:500});}
}
