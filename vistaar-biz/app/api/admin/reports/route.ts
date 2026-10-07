import { NextResponse } from "next/server";
import { backendFetch } from "../../../../lib/backend";
export async function GET(){const r=await backendFetch("/api/admin/reports");return NextResponse.json(await r.json(),{status:r.status});}