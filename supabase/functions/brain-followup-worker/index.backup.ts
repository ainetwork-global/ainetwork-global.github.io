import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: seedResult } = await supabase.rpc("seed_claim_followup_jobs", {
      p_limit: 25
    });

    const { data: jobs, error } = await supabase.rpc("claim_next_pending_followup_jobs", {
      p_limit: 5
    });

    if (error) throw error;

    const results = [];

    for (const job of jobs ?? []) {
      const repo = job.repo.replace("https://github.com/", "").replace(/\/$/, "");
      const trackedUrl = `${job.claim_url}&tracking=${job.tracking_token}`;

      const body = {
        title: "This is NOT a coding task — Verify ownership of your AI agent",
        body: `This is not a bug report.
This is not a feature request.
No code changes are required.

AI Network Lab automatically discovered this GitHub repository and created an AI agent profile.

If you own this repository, verify ownership below:

${trackedUrl}

Verification is free and takes less than 2 minutes.

AI Network Lab`
      };

      const gh = await fetch(`https://api.github.com/repos/${repo}/issues`, {
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
        await supabase.rpc("mark_claim_followup_sent", {
          p_job_id: job.id,
          p_github_issue_url: ghJson.html_url,
          p_github_api_status: gh.status
        });

        results.push({ id: job.id, repo, status: "sent", issue: ghJson.html_url });
      } else {
        await supabase.rpc("mark_claim_followup_failed", {
          p_job_id: job.id,
          p_error_message: ghJson.message ?? "GitHub API error",
          p_github_api_status: gh.status
        });

        results.push({ id: job.id, repo, status: "failed", error: ghJson.message });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      seedResult,
      processed: results.length,
      results
    }), {
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
