import { reverseLookup } from "@bonfida/spl-name-service";
import type {
	BlockchainsName,
	Transaction,
	Wallet,
	WalletCoin,
	WalletsProvider,
} from "@repo/domain";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
	type ConfirmedSignatureInfo,
	Connection,
	PublicKey,
	SystemProgram,
} from "@solana/web3.js";
import { type } from "arktype";
import { WalletsProviderAdapters } from "./index";

const tokenAccountType = type({
	info: {
		mint: "string",
		tokenAmount: {
			amount: "string",
			"+": "delete",
		},
		"+": "delete",
	},
	"+": "delete",
});

export class SolanaProvider implements WalletsProvider {
	private readonly solana: Connection;

	constructor(rpc_endpoint: string) {
		this.solana = new Connection(rpc_endpoint);
	}

	async getWallet(
		address: string,
		blockchain: BlockchainsName,
	): Promise<Wallet | null> {
		const public_key = new PublicKey(address);

		const account_info = await this.solana.getAccountInfo(public_key);

		// Si no es del tipo cuenta normal, no la añado
		if (!account_info || account_info.owner !== SystemProgram.programId)
			return null;

		const token_accounts = await this.solana.getParsedTokenAccountsByOwner(
			public_key,
			{
				programId: TOKEN_PROGRAM_ID,
			},
		);

		// Segun la libreria esto me devuelve siempre una string
		const alias = await reverseLookup(this.solana, public_key);

		// Añado las coins
		const coins: WalletCoin[] = [];
		for (const ta of token_accounts.value) {
			const parsed_data = tokenAccountType(ta.account.data.parsed);
			if (parsed_data instanceof type.errors) continue;
			coins.push({
				coin_address: parsed_data.info.mint,
				value: BigInt(parsed_data.info.tokenAmount.amount),
			});
		}

		const wallet: Wallet = {
			address,
			blockchain,
			alias: alias ?? null,
			backfill_status: "pending",
			first_transfer_date: null,
			native_value: BigInt(account_info.lamports),
			coins,
		};

		return wallet;
	}

	async getRecentTransactions(wallet_data: Wallet): Promise<Transaction[]> {
		const public_key = new PublicKey(wallet_data.address);

		// Agarro las primeras 20
		const transactions = await this.solana.getSignaturesForAddress(public_key, {
			limit: 20,
		});

		return this.mapTransactionData(transactions, wallet_data.blockchain);
	}

	async getTransactionHistory(
		wallet_data: Wallet,
		loop_cursor: string | undefined,
	): Promise<{ transactions: Transaction[]; cursor: string | undefined }> {
		const public_key = new PublicKey(wallet_data.address);

		// Agarro las primeras 20
		const transactions = await this.solana.getSignaturesForAddress(public_key, {
			before: loop_cursor,
			limit: 1000,
		});

		return {
			transactions: this.mapTransactionData(
				transactions,
				wallet_data.blockchain,
			),
			cursor: transactions[-1]?.signature,
		};
	}

	mapTransactionData(
		confirmed_signature_info: ConfirmedSignatureInfo[],
		blockchain: BlockchainsName,
	): Transaction[] {
		const mapped_transactions: Transaction[] = [];

		for (const tx of confirmed_signature_info) {
			if (tx.confirmationStatus !== "finalized") continue;

			// Por ahora las transacciones de Solana van a tener que ser vistas en solscan.io usando el id
			mapped_transactions.push({
				block_timestamp: new Date(tx.blockTime!),
				blockchain: blockchain,
				fee: 0n,
				hash: tx.signature,
				transfers: [],
				summary: null,
				from_address: "",
				to_address: "",
			});
		}

		return mapped_transactions;
	}
}