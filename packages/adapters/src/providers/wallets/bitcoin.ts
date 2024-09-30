import type {
	BlockchainsName,
	Transaction,
	Transfer,
	Wallet,
	WalletsProvider,
} from "@repo/domain";
import { type } from "arktype";

const blockchainComTxType = type({
	hash: "string",
	time: "number",
	fee: "number",
	inputs: type({
		prev_out: {
			value: "number",
			addr: "string",
		},
	}).array(),
	out: type({
		value: "number",
		addr: "string",
	}).array(),
});

type BlockchainComTransactions = typeof blockchainComTxType.infer;

const blockchainComAddrType = type({
	final_balance: "number",
	txs: blockchainComTxType.array(),
});

export class BitcoinProvider implements WalletsProvider {
	async getWallet(
		address: string,
		blockchain: BlockchainsName,
	): Promise<Wallet | null> {
		const response = await fetch(`https://blockchain.info/rawaddr/${address}`);

		if (!response.ok) return null;

		const parsedResponse = blockchainComAddrType(await response.json());

		if (parsedResponse instanceof type.errors) throw parsedResponse;

		const wallet: Wallet = {
			address,
			blockchain,
			alias: null,
			backfill_status: "pending",
			coins: [],
			first_transfer_date:
				parsedResponse.txs.length > 0
					? new Date(parsedResponse.txs[-1]!.time)
					: null,
			native_value: BigInt(parsedResponse.final_balance),
		};

		return wallet;
	}

	async getRecentTransactions(wallet_data: Wallet): Promise<Transaction[]> {
		const response = await fetch(
			`https://blockchain.info/rawaddr/${wallet_data.address}`,
		).then((res) => res.json());

		const parsedResponse = blockchainComAddrType(response);

		if (parsedResponse instanceof type.errors) throw parsedResponse;

		const transactions = this.mapTransactionData(
			parsedResponse.txs.slice(0, 30),
		);

		return transactions;
	}

	async getTransactionHistory(
		wallet_data: Wallet,
		loop_cursor: string | undefined,
	): Promise<{ transactions: Transaction[]; cursor: string | undefined }> {
		const response = await fetch(
			`https://blockchain.info/rawaddr/${wallet_data.address}`,
		).then((res) => res.json());

		const parsedResponse = blockchainComAddrType(response);

		if (parsedResponse instanceof type.errors) throw parsedResponse;

		const transactions = this.mapTransactionData(parsedResponse.txs);

		return { transactions, cursor: undefined };
	}

	mapTransactionData(transactions: BlockchainComTransactions[]): Transaction[] {
		const mapped_transactions: Transaction[] = transactions.map((tx) => {
			const transfers: Transfer[] = [];

			for (const input of tx.inputs) {
				transfers.push({
					from_address: input.prev_out.addr,
					to_address: null,
					value: BigInt(input.prev_out.value),
					type: "native",
					coin_address: null,
					token_id: null,
				});
			}
			for (const output of tx.out) {
				transfers.push({
					to_address: output.addr,
					from_address: null,
					value: BigInt(output.value),
					type: "native",
					coin_address: null,
					token_id: null,
				});
			}

			return {
				block_timestamp: new Date(tx.time),
				blockchain: "bitcoin",
				// Las fees son mas implicitas en la red bitcoin y ya con poner los inputs en transfers estamos
				fee: 0n,
				// No existe un solo from_address o to_address
				from_address: null,
				to_address: null,
				hash: tx.hash,
				summary: null,
				transfers,
			};
		});

		return mapped_transactions;
	}
}
