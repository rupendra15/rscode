import { NextResponse } from "next/server";
import { backendFetch } from "../../../../lib/backend";
export async function GET(){const r=await backendFetch("/api/admin/users");return NextResponse.json(await r.json(),{status:r.status});}
export async function POST(request:Request){const r=await backendFetch("/api/admin/users",{method:"PATCH",body:JSON.stringify(await request.json())});return NextResponse.json(await r.json(),{status:r.status});}