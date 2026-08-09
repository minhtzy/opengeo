ALTER TABLE probe_results
  ADD CONSTRAINT probe_results_run_prompt_engine_uq UNIQUE (org_id, run_id, prompt_id, engine_id);
--> statement-breakpoint
ALTER TABLE observations
  ADD CONSTRAINT observations_run_prompt_engine_uq UNIQUE (org_id, run_id, prompt_id, engine_id);
