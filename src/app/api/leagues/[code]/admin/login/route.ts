import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabaseServer";
import { generateToken, hashToken } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Permette all'admin di ottenere un nuovo token da un altro dispositivo
// (o dopo aver svuotato la cache) verificando nome admin + password.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const { displayName, password } = await req.json();
    if (!displayName || !password) return jsonError(422, "MISSING_FIELDS");

    const sb = supabaseServer();
    const { data: league } = await sb
      .from("leagues")
      .select("id, admin_password_hash")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const validPassword = await bcrypt.compare(String(password), league.admin_password_hash);
    if (!validPassword) return jsonError(401, "INVALID_CREDENTIALS");

    const { data: admin } = await sb
      .from("participants")
      .select("id")
      .eq("league_id", league.id)
      .eq("is_admin", true)
      .ilike("display_name", String(displayName).trim())
      .maybeSingle();

    if (!admin) return jsonError(404, "ADMIN_NOT_FOUND");

    const token = generateToken();
    await sb.from("participants").update({ token_hash: hashToken(token) }).eq("id", admin.id);

    return NextResponse.json({ token, participantId: admin.id, leagueId: league.id, isAdmin: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
