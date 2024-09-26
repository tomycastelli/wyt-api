import { Worker } from "bullmq";
import "dotenv/config";
import {
	CoinGecko,
	CoinsPostgres,
	WalletsPostgres,
	WalletsProviderAdapters,
} from "@repo/adapters";
import { CoinsService, type SavedWallet, WalletsService } from "@repo/domain";

// Los adapters
const coingecko = new CoinGecko(process.env.COINGECKO_API_KEY ?? "");
const coins_postgres = new CoinsPostgres(process.env.POSTGRES_URL ?? "");

// El servicio de Coins
const coins_service = new CoinsService(coins_postgres, coingecko);

const wallets_repository = new WalletsPostgres(process.env.POSTGRES_URL ?? "");
const wallets_provider = new WalletsProviderAdapters(
	process.env.MORALIS_API_KEY ?? "",
	"",
	"",
);

await wallets_provider.initialize();

// El servicio de Wallets
const wallets_service = new WalletsService(
	wallets_repository,
	wallets_provider,
	coins_service,
);

const worker = new Worker<SavedWallet>(
	"backfillQueue",
	async (job) => {
		await wallets_service.backfillWallet(job.data);
	},
	{
		connection: {
			host: "127.0.0.1",
			port: 6379,
		},
	},
);

worker.on("ready", () => {
	console.log("Worker is ready!");
});

worker.on("completed", (job) => {
	console.log(`Job: ${job.id}, for wallet ${job.data.id} has completed!`);
});

worker.on("failed", (job, err) => {
	console.error(`Job ${job?.id} has failed with err: `, err);
});
