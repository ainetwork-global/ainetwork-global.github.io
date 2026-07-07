import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: item, error } = await supabase.rpc("claim_delivery_pick_next");

    if (error) throw error;

    if (!item || item.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        processed: 0,
        message: "No ready recovery followups."
      }), { headers: { "Content-Type": "application/json" } });
    }

    const job = item[0];
    const owner = job.github_username;

    const body = {
      title: "Complete ownership verification for your AI agent",
      body: job.recovery_message
    };

    const gh = await fetch(`https://api.github.com/repos/${owner}/${owner}/issues`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const ghJson = await gh.json();

    if (gh.ok) {
      await supabase.rpc("claim_delivery_mark_sent", {
        p_id: job.id,
        p_github_issue_url: ghJson.html_url,
        p_github_comment_url: null
      });

      return new Response(JSON.stringify({
        ok: true,
        processed: 1,
        status: "sent",
        followup_id: job.id,
        github_issue_url: ghJson.html_url
      }), { headers: { "Content-Type": "application/json" } });
    }

    await supabase.rpc("claim_delivery_mark_failed", {
      p_id: job.id,
      p_error: ghJson.message ?? "GitHub API error"
    });

    return new Response(JSON.stringify({
      ok: false,
      processed: 1,
      status: "failed",
      followup_id: job.id,
      github_status: gh.status,
      error: ghJson.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: String(err?.message ?? err)
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
