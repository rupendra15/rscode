import { NextResponse } from "next/server";

type Enquiry = {
  name: string;
  businessName: string;
  phone: string;
  email?: string;
  need: string;
  question: string;
};

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<Enquiry>;
    const enquiry: Enquiry = {
      name: String(body.name ?? "").trim(),
      businessName: String(body.businessName ?? "").trim(),
      phone: String(body.phone ?? "").trim(),
      email: String(body.email ?? "").trim(),
      need: String(body.need ?? "").trim(),
      question: String(body.question ?? "").trim(),
    };

    if (!enquiry.name || !enquiry.businessName || !enquiry.phone || !enquiry.need || !enquiry.question) {
      return NextResponse.json({ ok: false, error: "Please complete the required fields." }, { status: 400 });
    }

    if (enquiry.phone.replace(/\D/g, "").length < 8) {
      return NextResponse.json({ ok: false, error: "Please enter a valid phone number." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({
        ok: true,
        stored: false,
        message: "Enquiry received by Vistaar. Connect Supabase server credentials to persist it."
      });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/enquiries`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        name: enquiry.name,
        business_name: enquiry.businessName,
        phone: enquiry.phone,
        email: enquiry.email || null,
        need: enquiry.need,
        question: enquiry.question,
        source: "vistaar-biz-website",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Vistaar enquiry persistence failed:", detail);
      return NextResponse.json({ ok: false, error: "We couldn't save your enquiry right now. Please call, email or WhatsApp us instead." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, stored: true });
  } catch (error) {
    console.error("Vistaar enquiry request failed:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again or contact us directly." }, { status: 500 });
  }
}