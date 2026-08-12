import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiResponse";

// Le leghe a cui l'utente autenticato partecipa (come giocatore o come
// admin), per mostrarle in homepage senza dover ridigitare il codice ogni
// volta.
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const sb = supabaseServer();

    const { data, error } = await sb
      .from("participants")
      .select("is_admin, leagues:league_id(code, name, status)")
      .eq("user_id", user.id);

    if (error) throw error;

    const leagues = (data || [])
      .filter((row) => row.leagues)
      .map((row) => {
        const league = row.leagues as unknown as { code: string; name: string; status: string };
        return { code: league.code, name: league.name, status: league.status, isAdmin: row.is_admin };
      });

    return NextResponse.json({ leagues });
  } catch (err) {
    return handleRouteError(err);
  }
}
