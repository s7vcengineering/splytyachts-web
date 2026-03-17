import { createServiceClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

const DOWNLOAD_URL = "https://splytpayments.com/download";

interface OutreachParams {
  captainName: string;
  experienceTitle: string;
  experienceDate: string;
}

const templates = {
  en: (p: OutreachParams) =>
    `Hi ${p.captainName}, this is Sam from SPLYT. ` +
    `Your upcoming charter "${p.experienceTitle}" on ${p.experienceDate} — ` +
    `your party is waiting to connect with you directly through our app. ` +
    `Download SPLYT to join the conversation, coordinate details, ` +
    `and manage your booking seamlessly.\n\n` +
    `Download here: ${DOWNLOAD_URL}\n\n` +
    `Sign up as a Captain and your crew will be ready to chat!`,
  es: (p: OutreachParams) =>
    `Hola ${p.captainName}, soy Sam de SPLYT. ` +
    `Tu charter "${p.experienceTitle}" el ${p.experienceDate} — ` +
    `tu grupo te esta esperando para conectar contigo directamente ` +
    `a traves de nuestra app. Descarga SPLYT para unirte a la conversacion, ` +
    `coordinar los detalles y gestionar tu reserva facilmente.\n\n` +
    `Descargala aqui: ${DOWNLOAD_URL}\n\n` +
    `Registrate como Capitan y tu grupo estara listo para chatear!`,
  pt: (p: OutreachParams) =>
    `Ola ${p.captainName}, aqui e o Sam da SPLYT. ` +
    `Seu charter "${p.experienceTitle}" no dia ${p.experienceDate} — ` +
    `seu grupo esta esperando para se conectar com voce diretamente ` +
    `pelo nosso app. Baixe o SPLYT para entrar na conversa, ` +
    `coordenar os detalhes e gerenciar sua reserva com facilidade.\n\n` +
    `Baixe aqui: ${DOWNLOAD_URL}\n\n` +
    `Cadastre-se como Capitao e sua tripulacao estara pronta para conversar!`,
};

/**
 * POST /api/captains/[id]/outreach
 * Generate captain outreach messages in EN/ES/PT.
 * Body: { experience_title?, experience_date? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const supabase = createServiceClient();

    const { data: captain } = await supabase
      .from("captains")
      .select("name, phone")
      .eq("id", id)
      .single();

    if (!captain) {
      return NextResponse.json({ error: "Captain not found" }, { status: 404 });
    }

    const outreachParams: OutreachParams = {
      captainName: captain.name,
      experienceTitle: body.experience_title || "your upcoming charter",
      experienceDate: body.experience_date || "the scheduled date",
    };

    const messages = {
      en: templates.en(outreachParams),
      es: templates.es(outreachParams),
      pt: templates.pt(outreachParams),
    };

    return NextResponse.json({
      captain_name: captain.name,
      captain_phone: captain.phone,
      messages,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
