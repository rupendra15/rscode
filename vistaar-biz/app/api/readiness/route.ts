import { NextResponse } from "next/server";
import { backendFetch } from "../../../lib/backend";
export async function POST(request:Request){const r=await backendFetch("/api/readiness",{method:"POST",body:JSON.stringify(await request.json())});return NextResponse.json(await r.json(),{status:r.status});}
export async function GET(){const r=await backendFetch("/api/readiness");return NextResponse.json(await r.json(),{status:r.status});}