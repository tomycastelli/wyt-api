import { Queue } from "bullmq";
import type { JobsQueue } from "../index.js";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) throw Error("REDIS_URL missing");

export const coin_jobs_queue = new Queue<JobsQueue>("coinJobsQueue", {
	connection: {
		host: REDIS_URL,
		port: 6379,
	},
});
