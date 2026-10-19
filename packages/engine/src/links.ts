import { applyBalanceChange, type WalletState } from "./levels.js";
import type { Rules } from "./rules.js";

/**
 * Wallet linking: a holder proves two wallets are theirs by signing a message with each (free, no
 * transaction). Linked wallets form one group with one bag (and one selling penalty), and
 * transfers inside the group aren't sales (they still pay the tax).
 *
 * The group is tracked as a single WalletState: `address` is the group's id (its first wallet),
 * `balance` and `penalty` are the sums of its wallets. Chain-watch skips transfers whose sender and
 * receiver are in the same group, and applies every other transfer to the group with
 * `applyBalanceChange`.
 */

/** Link a wallet into a group: bags and selling penalties add up. */
export function linkWallet(group: WalletState, wallet: WalletState): WalletState {
  return { address: group.address, balance: group.balance + wallet.balance, penalty: group.penalty + wallet.penalty };
}

/**
 * Unlink a wallet holding `walletBalance` (base units) from a group. It counts as the group selling
 * that much (the 3× rule applies to the group), and the wallet starts over on its own.
 */
export function unlinkWallet(
  group: WalletState,
  wallet: { address: string; balance: bigint },
  rules: Rules,
): { group: WalletState; wallet: WalletState } {
  const rest = applyBalanceChange(group, -wallet.balance, rules);
  return { group: rest, wallet: { address: wallet.address, balance: wallet.balance, penalty: 0n } };
}

/** True when a transfer stays inside one linked group, so it isn't a sale. */
export function isInternalTransfer(from: string, to: string, groupOf: (address: string) => string | undefined): boolean {
  const a = groupOf(from);
  return a !== undefined && a === groupOf(to);
}
