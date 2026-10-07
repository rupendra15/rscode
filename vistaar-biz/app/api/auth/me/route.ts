import { NextResponse } from "next/server";
import { getAuthContext } from "../../../../lib/auth";
export async function GET() {
  const context = await getAuthContext();
  return NextResponse.json({ ok:true, authenticated:Boolean(context), user:context?{id:context.userId,email:context.email,role:context.role}:null });
}