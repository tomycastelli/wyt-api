import { coin_jobs_queue } from "./queue.js";

await coin_jobs_queue.add("guardado de coins recientes", {
	jobName: "saveLatestCoins",
});
