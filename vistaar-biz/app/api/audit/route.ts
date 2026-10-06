import { NextResponse } from "next/server";
import { runGrowthAudit, type BusinessProfile } from "../../../lib/audit";

export async function POST(request:Request){
  try{
    const profile=(await request.json()) as BusinessProfile;
    if(!profile.businessName||!profile.industry||!profile.city||!profile.goal)
      return NextResponse.json({error:"Business name, category, city and goal are required."},{status:400});
    const audit=runGrowthAudit(profile);
    return NextResponse.json({profile,audit,generatedAt:new Date().toISOString()});
  }catch{return NextResponse.json({error:"Unable to generate the growth audit."},{status:500});}
}