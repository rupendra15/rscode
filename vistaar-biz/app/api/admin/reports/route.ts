import { NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth";
export async function GET(){
 try{
  await requireRole(["admin"]);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) return NextResponse.json({ok:false,error:"Reporting persistence is not configured."},{status:503});
  const h={apikey:key,Authorization:"Bearer "+key};
  const [a,b,au,actions,enquiries]=await Promise.all([
   fetch(url+"/rest/v1/growth_assessments?select=*&order=created_at.desc&limit=500",{headers:h,cache:"no-store"}),
   fetch(url+"/rest/v1/businesses?select=*&order=created_at.desc&limit=500",{headers:h,cache:"no-store"}),
   fetch(url+"/rest/v1/growth_audits?select=*&order=created_at.desc&limit=500",{headers:h,cache:"no-store"}),
   fetch(url+"/rest/v1/growth_actions?select=*&order=created_at.desc&limit=500",{headers:h,cache:"no-store"}),
   fetch(url+"/rest/v1/enquiries?select=*&order=created_at.desc&limit=500",{headers:h,cache:"no-store"})
  ]);
  const read=async(r:Response)=>r.ok?await r.json():[];
  return NextResponse.json({ok:true,assessments:await read(a),businesses:await read(b),audits:await read(au),actions:await read(actions),enquiries:await read(enquiries)});
 }catch(e){const message=e instanceof Error?e.message:"Unable to load reports.";return NextResponse.json({ok:false,error:message==="FORBIDDEN"?"Admin access is required.":message},{status:message==="FORBIDDEN"?403:500});}
}