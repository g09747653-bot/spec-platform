ALTER TABLE "autonomous_runs" DROP CONSTRAINT "autonomous_runs_counts_non_negative";--> statement-breakpoint
ALTER TABLE "autonomous_runs" ADD COLUMN "step_outcome" text;--> statement-breakpoint
ALTER TABLE "autonomous_runs" ADD COLUMN "fruitless_asks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "autonomous_runs" ADD CONSTRAINT "autonomous_runs_step_outcome_valid" CHECK ("autonomous_runs"."step_outcome" IS NULL OR "autonomous_runs"."step_outcome" IN ('landed', 'refused', 'fruitless-ask'));--> statement-breakpoint
ALTER TABLE "autonomous_runs" ADD CONSTRAINT "autonomous_runs_counts_non_negative" CHECK ("autonomous_runs"."steps" >= 0 AND "autonomous_runs"."idle_steps" >= 0 AND "autonomous_runs"."fruitless_asks" >= 0
          AND "autonomous_runs"."version" >= 0);