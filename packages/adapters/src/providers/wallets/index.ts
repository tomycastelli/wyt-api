import {
  type BlockchainsName,
  type Stream,
  type Transaction,
  type Transfer,
  type Wallet,
  type WalletCoin,
  type WalletsProvider,
  blockchains,
} from "@repo/domain";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { Connection, PublicKey } from "@solana/web3.js";
import { EthereumProvider } from "./ethereum";

/** Esta clase agrupa varios providers de distintas blockchains */
export class WalletsProviderAdapters implements WalletsProvider {
  private ethereumProvider: EthereumProvider;
  // private bitcoinProvider: BitcoinProvider;
  // private solanaProvider: SolanaProvider;

  constructor(
    moralis_api_key: string,
    blockchain_com_api_key: string,
    solana_rpc_endpoint: string,
  ) {
    this.ethereumProvider = new EthereumProvider(moralis_api_key);
    // this.bitcoinProvider = new BitcoinProvider();
    // this.solanaProvider = new SolanaProvider();
  }

  async initialize() {
    await this.ethereumProvider.initialize();
  }

  async getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<Wallet> {
    return this.ethereumProvider.getWallet(address, blockchain);
    // const ecosystem = blockchains[blockchain].ecosystem;
    // switch (ecosystem) {
    //   case "ethereum":
    //     return this.ethereumProvider.getWallet(address, blockchain);
    //   case "solana":
    //     return this.bitcoinProvider.getWallet(address, blockchain);
    //   case "bitcoin":
    //     return this.solanaProvider.getWallet(address, blockchain);
    // }
  }

  async getRecentTransactions(wallet_data: Wallet): Promise<Transaction[]> {
    return this.ethereumProvider.getRecentTransactions(wallet_data);
  }

  async getTransactionHistory(
    wallet_data: Wallet,
    loop_cursor: string | undefined,
  ): Promise<{ transactions: Transaction[]; cursor: string | undefined }> {
    return this.ethereumProvider.getTransactionHistory(
      wallet_data,
      loop_cursor,
    );
  }

  async addAddressToStream(stream_id: string, address: string): Promise<void> {
    return this.ethereumProvider.addAddressToStream(stream_id, address);
  }

  async createStream(
    webhook_url: string,
    description: string,
    tag: string,
    blockchain: BlockchainsName,
  ): Promise<Stream> {
    return this.ethereumProvider.createStream(
      webhook_url,
      description,
      tag,
      blockchain,
    );
  }

  async deleteStream(stream_id: string): Promise<void> {
    return this.ethereumProvider.deleteStream(stream_id);
  }

  async getAddresesByStream(stream_id: string): Promise<string[]> {
    return this.ethereumProvider.getAddresesByStream(stream_id);
  }

  async getAllStreams(): Promise<Stream[]> {
    return this.ethereumProvider.getAllStreams();
  }

  validateWebhookTransaction(
    body: any,
    secret_key: string,
    headers: Record<string, string>,
  ): boolean {
    return this.ethereumProvider.validateWebhookTransaction(
      body,
      secret_key,
      headers,
    );
  }

  parseWebhookTransaction(
    body: any,
    blockchain: BlockchainsName,
  ): Transaction[] | undefined {
    return this.ethereumProvider.parseWebhookTransaction(body, blockchain);
  }
}

// class BitcoinProvider implements WalletsProvider {}
class SolanaProvider implements WalletsProvider {
  private readonly solana: Connection

  constructor(rpc_endpoint: string) {
    this.solana = new Connection(rpc_endpoint)
  }

  async getWallet(address: string, blockchain: BlockchainsName): Promise<Wallet> {
    const public_key = new PublicKey(address)
    const token_accounts = await this.solana.getParsedTokenAccountsByOwner(public_key, {
      programId: TOKEN_PROGRAM_ID
    })
  }
}
