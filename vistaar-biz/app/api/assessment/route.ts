import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const required = ["businessName","industry","city","serviceArea","idealCustomer","offerings","differentiator","goal","target","constraint","channels","challenge"];
    if (required.some((key) => !String(body[key] ?? "").trim())) return NextResponse.json({ ok:false, error:"Please complete the required assessment fields." }, { status:400 });
    const record = {
      business_name:String(body.businessName).trim(), industry:String(body.industry).trim(), city:String(body.city).trim(), service_area:String(body.serviceArea).trim(),
      ideal_customer:String(body.idealCustomer).trim(), offerings:String(body.offerings).trim(), differentiator:String(body.differentiator).trim(),
      goal:String(body.goal).trim(), target:String(body.target).trim(), constraint:String(body.constraint).trim(), channels:String(body.channels).trim(),
      monthly_leads:body.monthlyLeads?String(body.monthlyLeads).trim():null, conversion:body.conversion?String(body.conversion).trim():null,
      website:body.website?String(body.website).trim():null, google:body.google?String(body.google).trim():null, instagram:body.instagram?String(body.instagram).trim():null,
      other_links:body.otherLinks?String(body.otherLinks).trim():null, challenge:String(body.challenge).trim(), notes:body.notes?String(body.notes).trim():null
    };
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key)return NextResponse.json({ok:true,stored:false,id:null});
    const r=await fetch(url+"/rest/v1/growth_assessments",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(record)});
    if(!r.ok)return NextResponse.json({ok:true,stored:false,id:null});
    const rows=await r.json(); return NextResponse.json({ok:true,stored:true,id:rows?.[0]?.id??null});
  } catch { return NextResponse.json({ok:false,error:"We couldn't start the assessment. Please try again."},{status:500}); }
}
