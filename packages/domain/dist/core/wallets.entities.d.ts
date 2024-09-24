export declare const walletCoin: import("arktype/internal/methods/object.ts").ObjectType<{
    coin_address: string;
    value: bigint;
}, {}>;
export declare const coinedWalletCoin: import("arktype/internal/methods/object.ts").ObjectType<{
    coin_address: string;
    value: bigint;
    coin: {
        market_cap: number;
        price: number;
        price_change_percentage_24h: number;
        price_change_24h: number;
        ath: number;
        name: string;
        symbol: string;
        provider: string;
        contracts: {
            blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
            contract_address: string & {
                " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"alphanumeric">;
            };
            decimal_place: number;
        }[];
        description: string | null;
        image_url: (string & {
            " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"url">;
        }) | null;
        id: import("arktype/internal/keywords/number/integer.ts").integer;
    };
}, {}>;
export declare const valuedWalletCoin: import("arktype/internal/methods/object.ts").ObjectType<{
    coin_address: string;
    value: bigint;
    coin: {
        market_cap: number;
        price: number;
        price_change_percentage_24h: number;
        price_change_24h: number;
        ath: number;
        name: string;
        symbol: string;
        provider: string;
        contracts: {
            blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
            contract_address: string & {
                " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"alphanumeric">;
            };
            decimal_place: number;
        }[];
        description: string | null;
        image_url: (string & {
            " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"url">;
        }) | null;
        id: import("arktype/internal/keywords/number/integer.ts").integer;
    };
    value_usd: number;
    percentage_in_wallet: number;
}, {}>;
export declare const walletType: import("arktype/internal/methods/object.ts").ObjectType<{
    address: string;
    blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
    alias: string | null;
    native_value: bigint;
    coins: {
        coin_address: string;
        value: bigint;
    }[];
    first_transfer_date: Date | null;
    backfill_status: "pending" | "complete";
}, {}>;
export declare const coinedWalletType: import("arktype/internal/methods/object.ts").ObjectType<{
    address: string;
    blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
    alias: string | null;
    native_value: bigint;
    first_transfer_date: Date | null;
    backfill_status: "pending" | "complete";
    native_coin: {
        market_cap: number;
        price: number;
        price_change_percentage_24h: number;
        price_change_24h: number;
        ath: number;
        name: string;
        symbol: string;
        provider: string;
        contracts: {
            blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
            contract_address: string & {
                " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"alphanumeric">;
            };
            decimal_place: number;
        }[];
        description: string | null;
        image_url: (string & {
            " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"url">;
        }) | null;
    };
    coins: {
        coin_address: string;
        value: bigint;
        coin: {
            market_cap: number;
            price: number;
            price_change_percentage_24h: number;
            price_change_24h: number;
            ath: number;
            name: string;
            symbol: string;
            provider: string;
            contracts: {
                blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
                contract_address: string & {
                    " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"alphanumeric">;
                };
                decimal_place: number;
            }[];
            description: string | null;
            image_url: (string & {
                " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"url">;
            }) | null;
            id: import("arktype/internal/keywords/number/integer.ts").integer;
        };
    }[];
}, {}>;
export declare const valuedWalletType: import("arktype/internal/methods/object.ts").ObjectType<{
    address: string;
    blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
    alias: string | null;
    native_value: bigint;
    first_transfer_date: Date | null;
    backfill_status: "pending" | "complete";
    native_coin: {
        market_cap: number;
        price: number;
        price_change_percentage_24h: number;
        price_change_24h: number;
        ath: number;
        name: string;
        symbol: string;
        provider: string;
        contracts: {
            blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
            contract_address: string & {
                " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"alphanumeric">;
            };
            decimal_place: number;
        }[];
        description: string | null;
        image_url: (string & {
            " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"url">;
        }) | null;
    };
    total_value_usd: number;
    native_value_usd: number;
    coins: {
        coin_address: string;
        value: bigint;
        coin: {
            market_cap: number;
            price: number;
            price_change_percentage_24h: number;
            price_change_24h: number;
            ath: number;
            name: string;
            symbol: string;
            provider: string;
            contracts: {
                blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
                contract_address: string & {
                    " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"alphanumeric">;
                };
                decimal_place: number;
            }[];
            description: string | null;
            image_url: (string & {
                " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"url">;
            }) | null;
            id: import("arktype/internal/keywords/number/integer.ts").integer;
        };
        value_usd: number;
        percentage_in_wallet: number;
    }[];
}, {}>;
export declare const transactionType: import("arktype/internal/methods/object.ts").ObjectType<{
    blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
    hash: string;
    block_timestamp: Date;
    type: "native" | "erc20" | "nft";
    token_id: number | null;
    value: bigint;
    fee: bigint;
    from_address: string;
    to_address: string;
    summary: string;
    coin_address?: string | undefined;
}, {}>;
export declare const coinedTransactionType: import("arktype/internal/methods/object.ts").ObjectType<{
    blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
    hash: string;
    block_timestamp: Date;
    type: "native" | "erc20" | "nft";
    token_id: number | null;
    value: bigint;
    fee: bigint;
    from_address: string;
    to_address: string;
    summary: string;
    coin_address?: string | undefined;
    value_usd: number;
    coin: {
        name: string;
        symbol: string;
        provider: string;
        contract_address: string;
        blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
        image_url: string;
        description: string | null;
        token_id: number;
        price: number;
    } | {
        market_cap: number;
        price: number;
        price_change_percentage_24h: number;
        price_change_24h: number;
        ath: number;
        name: string;
        symbol: string;
        provider: string;
        contracts: {
            blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
            contract_address: string;
            decimal_place: number;
        }[] & {};
        description: string | null;
        image_url: string | null;
    };
}, {}>;
export declare const coinedWalletWithTransactions: import("arktype/internal/methods/object.ts").ObjectType<{
    address: string;
    blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
    alias: string | null;
    native_value: bigint;
    first_transfer_date: Date | null;
    backfill_status: "pending" | "complete";
    native_coin: {
        market_cap: number;
        price: number;
        price_change_percentage_24h: number;
        price_change_24h: number;
        ath: number;
        name: string;
        symbol: string;
        provider: string;
        contracts: {
            blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
            contract_address: string & {
                " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"alphanumeric">;
            };
            decimal_place: number;
        }[];
        description: string | null;
        image_url: (string & {
            " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"url">;
        }) | null;
    };
    total_value_usd: number;
    native_value_usd: number;
    coins: {
        coin_address: string;
        value: bigint;
        coin: {
            market_cap: number;
            price: number;
            price_change_percentage_24h: number;
            price_change_24h: number;
            ath: number;
            name: string;
            symbol: string;
            provider: string;
            contracts: {
                blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
                contract_address: string & {
                    " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"alphanumeric">;
                };
                decimal_place: number;
            }[];
            description: string | null;
            image_url: (string & {
                " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"url">;
            }) | null;
            id: import("arktype/internal/keywords/number/integer.ts").integer;
        };
        value_usd: number;
        percentage_in_wallet: number;
    }[];
    transactions: {
        blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
        hash: string;
        block_timestamp: Date;
        type: "native" | "erc20" | "nft";
        token_id: number | null;
        value: bigint;
        fee: bigint;
        from_address: string;
        to_address: string;
        summary: string;
        coin_address?: string | undefined;
        value_usd: number;
        coin: {
            name: string;
            symbol: string;
            provider: string;
            contract_address: string;
            blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
            image_url: string;
            description: string | null;
            token_id: number;
            price: number;
        } | {
            market_cap: number;
            price: number;
            price_change_percentage_24h: number;
            price_change_24h: number;
            ath: number;
            name: string;
            symbol: string;
            provider: string;
            contracts: {
                blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
                contract_address: string;
                decimal_place: number;
            }[] & {};
            description: string | null;
            image_url: string | null;
        };
    }[];
}, {}>;
/** # Una [Wallet] en una blockchain */
export type Wallet = typeof walletType.infer;
/** # Una [Wallet] con las [Coin] integradas */
export type CoinedWallet = typeof coinedWalletType.infer;
/** # Una [Wallet] con su valor en USD y las [Coin] integradas */
export type ValuedWallet = typeof valuedWalletType.infer;
/** # Una [WalletCoin] con la [Coin] integrada */
export type CoinedWalletCoin = typeof coinedWalletCoin.infer;
/** # Una transacción en una blockchain */
export type Transaction = typeof transactionType.infer;
/** # Una [WalletCoin] con su valor en USD y la [Coin] integrada */
export type ValuedWalletCoin = typeof valuedWalletCoin.infer;
/** # Una transferencia con su valor en USD en su momento */
export type CoinedTransaction = typeof coinedTransactionType.infer;
/** # Una [Wallet] con sus transacciones valuadas */
export type CoinedWalletWithTransactions = typeof coinedWalletWithTransactions.infer;
//# sourceMappingURL=wallets.entities.d.ts.map