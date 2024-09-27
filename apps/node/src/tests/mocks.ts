import type { CoinsProvider, WalletsProvider } from "@repo/domain";
import { type Mocked, vi } from "vitest";

export const mockWalletsProvider: Mocked<WalletsProvider> = {
	getWallet: vi.fn(),
	getRecentTransactions: vi.fn(),
	getTransactionHistory: vi.fn(),
	getAllStreams: vi.fn(),
	addAddressToStream: vi.fn(),
	createStream: vi.fn(),
	parseWebhookTransaction: vi.fn(),
	deleteStream: vi.fn(),
	getAddresesByStream: vi.fn(),
};

export const mockCoinsProvider: Mocked<CoinsProvider> = {
	getAllCoinMarketData: vi.fn(),
	getAllCoins: vi.fn(),
	getAllHistoricalCandles: vi.fn(),
	getCandleData: vi.fn(),
	getCoinByAddress: vi.fn(),
	getCoinMarketData: vi.fn(),
	getLatestCoins: vi.fn(),
};
