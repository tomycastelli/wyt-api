import { Worker } from "bullmq";
import "dotenv/config";
import {
	CoinGecko,
	CoinsPostgres,
	WalletsPostgres,
	WalletsProviderAdapters,
} from "@repo/adapters";
import {
	type BlockchainsName,
	CoinsService,
	type SavedWallet,
	WalletsService,
} from "@repo/domain";

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

const backfillWorker = new Worker<{
	wallet: SavedWallet;
	stream_webhook_url: string;
}>(
	"backfillQueue",
	async (job) => {
		await wallets_service.backfillWallet(
			job.data.wallet,
			job.data.stream_webhook_url,
		);
	},
	{
		connection: {
			host: "127.0.0.1",
			port: 6379,
		},
	},
);

backfillWorker.on("ready", () => {
	console.log("backfillWorker is ready!");
});

backfillWorker.on("completed", (job) => {
	console.log(
		`Job: ${job.id}, for wallet ${job.data.wallet.address} has completed!`,
	);
});

backfillWorker.on("failed", (job, err) => {
	console.error(`Job ${job?.id} has failed with err: `, err);
});

const transactionsStreamWorker = new Worker<{
	body: any;
	secret_key: string;
	headers: Record<string, string>;
	blockchain: BlockchainsName;
}>(
	"transactionsStreamQueue",
	async (job) => {
		await wallets_service.handleWebhookTransaction(
			job.data.body,
			job.data.secret_key,
			job.data.headers,
			job.data.blockchain,
		);
	},
	{
		connection: {
			host: "127.0.0.1",
			port: 6379,
		},
	},
);

transactionsStreamWorker.on("ready", () => {
	console.log("transactionsStreamWorker is ready!");
});

transactionsStreamWorker.on("completed", (job) => {
	console.log(
		`Job: ${job.id}, for stream of blockchain ${job.data.blockchain} has completed!`,
	);
});

transactionsStreamWorker.on("failed", (job, err) => {
	console.error(`Job ${job?.id} has failed with err: `, err);
});
