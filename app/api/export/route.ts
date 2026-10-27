import { adminOk, db } from "@/lib/server";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const k = new URL(req.url).searchParams.get("k");
  if (!adminOk(k)) return new Response("forbidden", { status: 403 });
  const r = process.env.ROOM_CODE!;
  const [{ data: posts }, { data: votes }, { data: wak }, { data: replies }] = await Promise.all([
    db().from("posts").select("*").eq("room_id", r).order("created_at"),
    db().from("votes").select("post_id").eq("room_id", r),
    db().from("wakaru").select("target_id").eq("room_id", r),
    db().from("replies").select("*").eq("room_id", r).order("created_at"),
  ]);
  const rows = [["種類", "本文", "名前", "票", "わかる", "解決案", "非表示", "あとから", "日時", "親ID", "ID"]];
  for (const p of posts ?? []) {
    rows.push([
      "困りごと", p.body, "(匿名)",
      String((votes ?? []).filter((v) => v.post_id === p.id).length),
      String((wak ?? []).filter((w) => w.target_id === p.id).length),
      "", p.hidden ? "1" : "", p.late ? "1" : "", p.created_at, "", p.id,
    ]);
    for (const c of (replies ?? []).filter((x) => x.post_id === p.id)) {
      rows.push([
        "コメント", c.body, c.nickname, "",
        String((wak ?? []).filter((w) => w.target_id === c.id).length),
        c.is_solution ? "1" : "", c.hidden ? "1" : "", "", c.created_at, p.id, c.id,
      ]);
    }
  }
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="komarigoto-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
