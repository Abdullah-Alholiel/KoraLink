CREATE INDEX "activities_actor_id_idx" ON "activities" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "disputes_reporter_id_idx" ON "disputes" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "matches_host_id_idx" ON "matches" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "matches_pitch_id_idx" ON "matches" USING btree ("pitch_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_id_idx" ON "reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "transactions_reference_id_idx" ON "transactions" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "venues_owner_id_idx" ON "venues" USING btree ("owner_id");